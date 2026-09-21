import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// O GLTFLoader do three espera navegador na hora de montar textura. Aqui so'
// interessa geometria, e sem isto ele nem chega a ler os vertices.
(globalThis as unknown as { self: unknown }).self = globalThis;

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { COURT } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * O estadio e' um asset COZIDO — sai de `scripts/preparar-estadio.mjs`, que
 * apaga 73% do modelo original e realinha o resto. O arquivo cru tem 45 MB e
 * nao esta' no repositorio, entao ninguem vai abrir os dois lado a lado pra
 * conferir. Se a receita for mexida e o resultado sair torto, o jogo continua
 * rodando: a fisica nao sabe que o estadio existe.
 *
 * O jeito de isso aparecer e' o pior possivel — um atleta correndo para no ar
 * contra uma arquibancada invisivel para o `Court`, ou o estadio afunda meio
 * metro e a quadra vira um buraco. Nenhum dos dois quebra nada.
 */

const carregar = async (): Promise<THREE.Object3D> => {
  const buf = fs.readFileSync(new URL('../src/assets/estadio.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // O aviso de textura que nao carrega e' esperado no Node, e so' faz barulho.
  const erroDeVerdade = console.error;
  console.error = () => {};
  try {
    const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, err) =>
      loader.parse(ab, '', ok as never, err));
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  } finally {
    console.error = erroDeVerdade;
  }
};

test('o estadio abre — ou seja, o meshopt foi gravado e e legivel', async () => {
  const cena = await carregar();
  let malhas = 0;
  cena.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas++; });
  assert.ok(malhas > 10, `so ${malhas} malhas: o arquivo veio vazio`);
});

/**
 * A areia e' o chao do jogo, em y=0, e o estadio tem que POUSAR nela.
 *
 * O modelo do Sketchfab vem com a superficie de jogo em y=1,4. Quem corrige e'
 * a receita, medindo o proprio gramado antes de apaga-lo — e este teste e' o
 * que garante que a medicao continua acontecendo.
 */
test('o piso do estadio esta na altura da areia', async () => {
  const cena = await carregar();
  const caixa = new THREE.Box3().setFromObject(cena);

  // Abaixo de zero so' a laje, que e' subsolo e ninguem ve'.
  assert.ok(caixa.min.y > -3, `estadio enterrado: base em ${caixa.min.y.toFixed(2)}`);
  assert.ok(caixa.min.y < 0.1, `estadio flutuando: base em ${caixa.min.y.toFixed(2)}`);
  // E ele tem que ser alto: arquibancada e refletor sao a razao de ele existir.
  assert.ok(caixa.max.y > 15, `estadio baixo demais: topo em ${caixa.max.y.toFixed(2)}`);
});

/**
 * NADA do estadio pode estar dentro da area onde se joga e se corre.
 *
 * E' o teste que importa de verdade. O estadio e' so' desenho — nao tem
 * colisor, e o `Court` nao sabe que ele existe. Uma arquibancada que invada a
 * zona livre nao empurra ninguem: ela ENGOLE o atleta, que passa correndo por
 * dentro do concreto.
 *
 * A conferencia e' por VERTICE, e nao por caixa. Caixa daria alarme falso na
 * placa de LED, que e' um anel em volta do campo: a caixa dela cobre a quadra
 * inteira, e o miolo e' vazio. Vertice basta aqui porque a unica peca que era
 * um triangulo gigante atravessando o campo — o gramado — e' justamente a que a
 * receita apaga.
 */
test('nada do estadio invade a quadra nem a zona livre', async () => {
  const cena = await carregar();

  const meioX = COURT.width / 2 + COURT.freeZone;      // 8 m
  const meioZ = COURT.length / 2 + COURT.freeZone;     // 12 m
  const ALTURA = 3;                                    // acima disso ninguem encosta

  const v = new THREE.Vector3();
  const invasores: string[] = [];

  cena.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    const pos = malha.geometry.getAttribute('position');

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(malha.matrixWorld);
      if (v.y > 0.05 && v.y < ALTURA && Math.abs(v.x) < meioX && Math.abs(v.z) < meioZ) {
        invasores.push(`${malha.name} em (${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`);
        return;
      }
    }
  });

  assert.equal(invasores.length, 0, `estadio dentro da area de jogo: ${invasores.slice(0, 3).join('; ')}`);
});

/**
 * O orcamento de triangulos.
 *
 * O modelo cru tem 472 mil, e 345 mil deles sao gol e alambrado — rede e tela
 * modeladas em GEOMETRIA. Se alguem reexportar sem apagar essas pecas, o asset
 * volta a pesar dez vezes mais e nada avisa: o jogo abre igual, so' que lento
 * no celular de quem nao ia reclamar aqui.
 */
test('o estadio cabe no orcamento de triangulos', async () => {
  const cena = await carregar();
  let tri = 0;
  cena.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    tri += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });

  assert.ok(tri < 200_000, `${Math.round(tri).toLocaleString()} triangulos: o futebol voltou pro arquivo`);
  assert.ok(tri > 50_000, `so ${Math.round(tri).toLocaleString()} triangulos: sobrou estadio de menos`);
});

test('o arquivo cabe no que o jogador baixa', async () => {
  const { size } = fs.statSync(new URL('../src/assets/estadio.glb', import.meta.url));
  // O cru tem 45 MB. Acima de 3 MB alguma coisa deu errado na receita.
  assert.ok(size < 3 * 1024 * 1024, `estadio com ${(size / 1024 / 1024).toFixed(1)} MB`);
});
