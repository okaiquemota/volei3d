import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// O GLTFLoader do three espera navegador na hora de montar textura. Aqui so'
// interessa geometria, e sem isto ele nem chega a ler os vertices.
(globalThis as unknown as { self: unknown }).self = globalThis;

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { COURT, ESTADIO } from '../src/config';
import { ALTURA_MINIMA, MATERIAIS_DE_BANCO, construirTorcida } from '../src/world/buildTorcida';

/**
 * O que estes testes protegem:
 *
 * A torcida nao tem lugares escritos — eles sao DESCOBERTOS por raycast contra
 * os degraus. E' o que a faz sobreviver a `ESTADIO.escala` mudar, e tambem o
 * que a deixa quebrar em silencio: se os nomes de material nao baterem, o
 * raycast nao acha banco nenhum e a arquibancada fica simplesmente vazia. O
 * jogo abre igual, sem erro, so' sem ninguem assistindo.
 */

const estadio = async (): Promise<THREE.Object3D> => {
  const buf = fs.readFileSync(new URL('../src/assets/estadio.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const erroDeVerdade = console.error;
  console.error = () => {};
  try {
    const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, err) =>
      loader.parse(ab, '', ok as never, err));
    gltf.scene.scale.setScalar(ESTADIO.escala);
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  } finally {
    console.error = erroDeVerdade;
  }
};

test('os materiais de banco continuam existindo no modelo', async () => {
  const cena = await estadio();

  const achados = new Set<string>();
  cena.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) {
      if (MATERIAIS_DE_BANCO.has(m.name)) achados.add(m.name);
    }
  });

  for (const nome of MATERIAIS_DE_BANCO) {
    assert.ok(achados.has(nome), `material de banco "${nome}" sumiu: a arquibancada fica vazia`);
  }
});

test('a arquibancada enche', async () => {
  const torcida = construirTorcida(await estadio());
  // Com a escala de hoje cabem uns mil. O piso e' generoso de proposito: o
  // numero muda com `escala` e com `densidade`, e o que nao pode e' ser ZERO.
  assert.ok(torcida.quantidade > 300,
    `so ${torcida.quantidade} pessoas: o raycast parou de achar os degraus`);
  torcida.dispose();
});

/**
 * Ninguem flutua, ninguem senta no chao, e ninguem senta na quadra.
 *
 * O raio cai de 40 m e aceita a PRIMEIRA batida horizontal acima de um piso
 * minimo. Um degrau que mude de nome ou de altura faria a torcida aparecer no
 * lugar errado sem erro nenhum — e "gente sentada no ar" e' o tipo de coisa que
 * so' se ve' olhando de um angulo especifico.
 */
test('cada pessoa esta sentada num degrau, e fora da area de jogo', async () => {
  const cena = await estadio();
  const torcida = construirTorcida(cena);

  const caixa = new THREE.Box3().setFromObject(cena);
  const corpos = torcida.root.getObjectByName('torcida-corpos') as THREE.InstancedMesh;
  assert.ok(corpos, 'a malha de corpos sumiu');

  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const meioX = COURT.width / 2 + COURT.freeZone;
  const meioZ = COURT.length / 2 + COURT.freeZone;

  let baixos = 0;
  let altos = 0;
  let naQuadra = 0;

  for (let i = 0; i < corpos.count; i++) {
    corpos.getMatrixAt(i, m4);
    p.setFromMatrixPosition(m4);

    if (p.y < ALTURA_MINIMA) baixos++;
    if (p.y > caixa.max.y) altos++;
    if (Math.abs(p.x) < meioX && Math.abs(p.z) < meioZ) naQuadra++;
  }

  assert.equal(baixos, 0, `${baixos} pessoas sentadas no chao da arena`);
  assert.equal(altos, 0, `${altos} pessoas acima do estadio`);
  assert.equal(naQuadra, 0, `${naQuadra} pessoas sentadas dentro da area de jogo`);
  torcida.dispose();
});

/** A mesma semente, a mesma arquibancada: duas capturas tem que bater. */
test('a torcida e a mesma toda vez', async () => {
  const a = construirTorcida(await estadio());
  const b = construirTorcida(await estadio());
  assert.equal(a.quantidade, b.quantidade);
  a.dispose();
  b.dispose();
});

/** Le o desvio vertical de cada um em relacao a onde sentou. */
function desvios(torcida: ReturnType<typeof construirTorcida>, base: Float32Array): number {
  const corpos = torcida.root.getObjectByName('torcida-corpos') as THREE.InstancedMesh;
  const arr = corpos.instanceMatrix.array as Float32Array;
  let maior = 0;
  for (let i = 0; i < corpos.count; i++) {
    maior = Math.max(maior, Math.abs(arr[i * 16 + 13]! - base[i]!));
  }
  return maior;
}

function ondeSentaram(torcida: ReturnType<typeof construirTorcida>): Float32Array {
  const corpos = torcida.root.getObjectByName('torcida-corpos') as THREE.InstancedMesh;
  const arr = corpos.instanceMatrix.array as Float32Array;
  const base = new Float32Array(corpos.count);
  for (let i = 0; i < corpos.count; i++) base[i] = arr[i * 16 + 13]!;
  return base;
}

/**
 * Parada ela balanca pouco; no ponto ela PULA.
 *
 * Os dois numeros tem que ser diferentes por uma ordem de grandeza, senao a
 * comemoracao nao se distingue do balanco e o ponto passa despercebido — que
 * era o estado anterior, com a torcida imovel.
 */
test('a torcida balanca parada e pula no ponto', async () => {
  const torcida = construirTorcida(await estadio());
  const base = ondeSentaram(torcida);

  // Alguns quadros de espera: o balanco e' lento de proposito.
  for (let i = 0; i < 20; i++) torcida.update(1 / 60);
  const parada = desvios(torcida, base);

  assert.ok(parada > 0.001, `torcida imovel: desvio de ${parada.toFixed(4)} m`);
  assert.ok(parada < 0.06, `balanco parado exagerado: ${parada.toFixed(3)} m`);

  torcida.comemorar();
  for (let i = 0; i < 6; i++) torcida.update(1 / 60);
  const festa = desvios(torcida, base);

  assert.ok(festa > parada * 4,
    `comemoracao (${festa.toFixed(3)}) nao se distingue do balanco (${parada.toFixed(3)})`);
  torcida.dispose();
});

/** E a festa ACABA: senao a arquibancada pula pelo resto da partida. */
test('a comemoracao decai ate virar balanco de novo', async () => {
  const torcida = construirTorcida(await estadio());
  const base = ondeSentaram(torcida);

  torcida.comemorar();
  for (let i = 0; i < 6; i++) torcida.update(1 / 60);
  const noPico = desvios(torcida, base);

  // Passar do tempo de festa com folga.
  for (let i = 0; i < 60 * 4; i++) torcida.update(1 / 60);
  const depois = desvios(torcida, base);

  assert.ok(depois < noPico / 3,
    `a festa nao acabou: ${depois.toFixed(3)} m contra ${noPico.toFixed(3)} no pico`);
  torcida.dispose();
});
