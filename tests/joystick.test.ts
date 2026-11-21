import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { lerJoystick } from '../src/core/joystick';
import { Input } from '../src/core/Input';
import { direcaoDoTeclado } from '../src/players/controle';

/**
 * O que estes testes protegem:
 *
 * O sinal. A tela tem y pra BAIXO e o jogo tem z pra FRENTE; trocar um pelo
 * outro faz o polegar pra cima andar pra tras, e na mao isso parece "o
 * controle esta' estranho" antes de parecer "a conta esta' errada" — a mesma
 * armadilha do `cross(frente, cima)` em `controle.ts`.
 */

test('polegar pra cima anda pra frente, pra direita anda pra direita', () => {
  const cima = lerJoystick(0, -56, 56, 0.18);
  assert.ok(Math.abs(cima.x) < 1e-9);
  assert.ok(Math.abs(cima.z - 1) < 1e-9);

  const direita = lerJoystick(56, 0, 56, 0.18);
  assert.ok(Math.abs(direita.x - 1) < 1e-9);
  assert.ok(Math.abs(direita.z) < 1e-9);
});

test('dentro da zona morta nao anda nada', () => {
  const e = lerJoystick(5, -5, 56, 0.18);
  assert.equal(e.x, 0);
  assert.equal(e.z, 0);
});

test('a faixa util comeca em zero logo depois da zona morta, sem degrau', () => {
  const borda = 56 * 0.18;
  const e = lerJoystick(0, -(borda + 0.5), 56, 0.18);
  assert.ok(e.z > 0 && e.z < 0.02, `esperava quase zero, deu ${e.z}`);
});

test('o modulo nunca passa de 1, nem com o polegar fora do circulo', () => {
  const e = lerJoystick(300, 300, 56, 0.18);
  assert.ok(Math.abs(Math.hypot(e.x, e.z) - 1) < 1e-9);
});

test('meio caminho anda devagar, nao corre', () => {
  const e = lerJoystick(0, -33, 56, 0.18);
  const m = Math.hypot(e.x, e.z);
  assert.ok(m > 0.3 && m < 0.7, `modulo ${m}`);
});

test('o eixo do joystick chega na direcao do atleta, com o mesmo sinal do teclado', () => {
  // O Input liga listeners na janela; no Node so' precisa existir algo com
  // addEventListener. O teste usa apenas o estado.
  const alvo = { addEventListener() {}, removeEventListener() {} };
  const g = globalThis as unknown as Record<string, unknown>;
  const antes = { window: g.window, document: g.document };
  g.window = alvo;
  g.document = alvo;
  try {
    const input = new Input(alvo as unknown as HTMLCanvasElement);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 5, -10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const teclado = new THREE.Vector3();
    input.apertar('KeyD');
    direcaoDoTeclado(input, camera, teclado);
    input.soltar('KeyD');

    const polegar = new THREE.Vector3();
    input.eixoX = 1;
    input.eixoZ = 0;
    direcaoDoTeclado(input, camera, polegar);

    assert.ok(teclado.distanceTo(polegar) < 1e-9, `teclado ${teclado.toArray()} polegar ${polegar.toArray()}`);
  } finally {
    g.window = antes.window;
    g.document = antes.document;
  }
});
