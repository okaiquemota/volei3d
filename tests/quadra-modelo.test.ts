import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { encaixarNoCampo } from '../src/world/encaixarQuadra';
import { POUSO_NA_AREIA } from '../src/world/buildCourt';
import { COURT } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * O cenario QUADRA e' uma PELE. A fisica, os limites e o julgamento de dentro e
 * fora continuam saindo do `Court`, e o modelo so' desenha por cima. Se o
 * encaixe escorregar, nada quebra: o jogo continua rodando e passa a MENTIR —
 * a bola cai do lado de fora de uma linha que na tela esta' meio metro adiante,
 * ou atravessa uma fita desenhada abaixo do colisor.
 *
 * E' exatamente o tipo de erro que nenhum teste de logica pega e que um olhar
 * distraido na tela deixa passar, porque "parece uma quadra".
 */

const modelo = async (): Promise<THREE.Object3D> => {
  const buf = fs.readFileSync(new URL('../src/assets/quadra.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, err) =>
    new GLTFLoader().parse(ab, '', ok as never, err));
  return gltf.scene;
};

const caixaDe = (raiz: THREE.Object3D, nome: string): THREE.Box3 => {
  const peca = raiz.getObjectByName(nome);
  assert.ok(peca, `o modelo nao tem mais a peca ${nome}`);
  return new THREE.Box3().setFromObject(peca);
};

test('as linhas do modelo caem em cima das linhas que valem', async () => {
  const raiz = await modelo();
  encaixarNoCampo(raiz);
  raiz.updateMatrixWorld(true);

  const piso = caixaDe(raiz, 'Plane088');
  const tamanho = new THREE.Vector3();
  piso.getSize(tamanho);

  // O modelo e' indoor (9 x 18) e o campo e' de praia (8 x 16). Os dois sao
  // 1:2, entao uma escala so' resolve — e e' isso que este teste fixa.
  assert.ok(Math.abs(tamanho.x - COURT.width) < 0.01, `largura ${tamanho.x.toFixed(3)}`);
  assert.ok(Math.abs(tamanho.z - COURT.length) < 0.01, `comprimento ${tamanho.z.toFixed(3)}`);
});

test('a quadra fica CENTRADA no campo, e nao so do tamanho dele', async () => {
  const raiz = await modelo();
  encaixarNoCampo(raiz);
  raiz.updateMatrixWorld(true);

  const centro = new THREE.Vector3();
  caixaDe(raiz, 'Plane088').getCenter(centro);
  // O modelo nasce a 136 m da origem no X. Esquecer de recentrar deixaria a
  // quadra do tamanho certo e no lugar errado.
  assert.ok(Math.abs(centro.x) < 0.01, `x ${centro.x.toFixed(2)}`);
  assert.ok(Math.abs(centro.z) < 0.01, `z ${centro.z.toFixed(2)}`);
});

test('a fita desenhada fica na altura do colisor que para a bola', async () => {
  const raiz = await modelo();
  encaixarNoCampo(raiz);
  raiz.updateMatrixWorld(true);

  const rede = caixaDe(raiz, 'Plane089');
  assert.ok(Math.abs(rede.max.y - COURT.netHeight) < 0.01,
    `topo da rede em ${rede.max.y.toFixed(3)}, colisor em ${COURT.netHeight}`);
});

test('o piso POUSA na areia: nem enterrado, nem flutuando', async () => {
  const raiz = await modelo();
  encaixarNoCampo(raiz);
  raiz.updateMatrixWorld(true);

  const piso = caixaDe(raiz, 'Plane088');
  assert.ok(Math.abs(piso.min.y - POUSO_NA_AREIA) < 1e-4,
    `base do piso em ${piso.min.y.toFixed(4)}, esperado ${POUSO_NA_AREIA}`);
  // E o piso fica RENTE: uma bola quicando em y = 0 nao pode afundar no desenho.
  assert.ok(piso.max.y < 0.05, `o piso subiu pra ${piso.max.y.toFixed(3)} m`);
});
