import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { arcoPorApice, arcoPorTempo, corrigirArrasto, preverQueda, alturaAoCruzarRede } from '../src/core/ballistics';
import { PASSO, passoDaBola } from '../src/world/Physics';
import { BALL, COURT } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * O jogo inteiro depende de PREVER onde a bola vai cair — a IA corre pra la',
 * e a correcao de arrasto mira a partir disso. Se a previsao divergir da
 * simulacao, nada quebra de forma visivel: a IA so' passa a jogar mal, e leva
 * horas pra descobrir por que.
 *
 * Por isso o primeiro teste e' o mais importante do projeto.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

test('a previsao de queda bate com a simulacao real', () => {
  // Semente fixa: um teste que falha em uma execucao em vinte nao serve.
  let semente = 12345;
  const rnd = (): number => {
    semente = (semente * 1664525 + 1013904223) >>> 0;
    return semente / 0x100000000;
  };

  for (let i = 0; i < 20; i++) {
    const pos = v((rnd() - 0.5) * 8, 1 + rnd() * 2, (rnd() - 0.5) * 14);
    const vel = v((rnd() - 0.5) * 12, 4 + rnd() * 8, (rnd() - 0.5) * 16);

    const previsto = new THREE.Vector3();
    const tempoPrevisto = preverQueda(pos, vel, BALL.radius, previsto);

    // Simulacao "de verdade": o mesmo passo que a Ball roda.
    const simPos = pos.clone();
    const simVel = vel.clone();
    let t = 0;
    while (t < 8 && !(simPos.y <= BALL.radius && simVel.y < 0)) {
      passoDaBola(simPos, simVel, PASSO);
      t += PASSO;
    }

    // Um passo de folga: a previsao interpola dentro do ultimo passo, a
    // simulacao nao. A diferenca e' no maximo o deslocamento de um passo.
    const folga = simVel.length() * PASSO + 0.01;
    assert.ok(
      previsto.distanceTo(simPos) < folga,
      `lance ${i}: previsto ${previsto.toArray()} x simulado ${simPos.toArray()}`,
    );
    assert.ok(Math.abs(tempoPrevisto - t) < PASSO * 2, `lance ${i}: tempo previsto ${tempoPrevisto} x ${t}`);
  }
});

test('o arco por apice atinge o apice pedido e cai no alvo', () => {
  const de = v(0, 1.4, -6);
  const alvo = v(1.5, 0, 5);
  const apice = 6;

  const vel = new THREE.Vector3();
  assert.ok(arcoPorApice(de, alvo, apice, vel));

  // Sem arrasto, a solucao e' analitica: conferir contra a parabola pura.
  const subida = (vel.y * vel.y) / (2 * BALL.gravity);
  assert.ok(Math.abs(de.y + subida - apice) < 1e-6, 'apice errado');

  const tempo = vel.y / BALL.gravity + Math.sqrt((2 * (apice - alvo.y)) / BALL.gravity);
  const chegada = new THREE.Vector3(
    de.x + vel.x * tempo,
    de.y + vel.y * tempo - 0.5 * BALL.gravity * tempo * tempo,
    de.z + vel.z * tempo,
  );
  assert.ok(chegada.distanceTo(alvo) < 1e-6, `caiu em ${chegada.toArray()}`);
});

test('apice abaixo do minimo e' + "' elevado em vez de devolver erro", () => {
  const de = v(0, 2, 0);
  const alvo = v(0, 0, 4);
  const vel = new THREE.Vector3();

  // Apice pedido ABAIXO da origem: nao existe parabola assim.
  assert.ok(arcoPorApice(de, alvo, 0.5, vel), 'devia elevar o apice, nao falhar');
  assert.ok(vel.y > 0, 'a bola tem que subir');
});

test('a correcao de arrasto faz a bola cair no alvo pedido', () => {
  const de = v(0, 1.3, -6);
  const alvo = v(2, BALL.radius, 5);
  const vel = new THREE.Vector3();

  const ok = corrigirArrasto(de, alvo, vel, (a, b, out) => arcoPorApice(a, b, 6, out));
  assert.ok(ok);

  const pouso = new THREE.Vector3();
  preverQueda(de, vel, alvo.y, pouso);

  // Sem a correcao o arrasto encurta o lance em dezenas de centimetros.
  assert.ok(pouso.distanceTo(alvo) < 0.05, `errou por ${pouso.distanceTo(alvo).toFixed(3)} m`);
});

test('o arco por tempo chega no alvo no tempo pedido', () => {
  const de = v(0, 2.6, -1);
  const alvo = v(0, 0, 6);
  const tempo = 0.5;
  const vel = new THREE.Vector3();

  assert.ok(arcoPorTempo(de, alvo, tempo, vel));

  const chegada = new THREE.Vector3(
    de.x + vel.x * tempo,
    de.y + vel.y * tempo - 0.5 * BALL.gravity * tempo * tempo,
    de.z + vel.z * tempo,
  );
  assert.ok(chegada.distanceTo(alvo) < 1e-6);
});

test('a altura na rede reconhece quem passa e quem nao passa', () => {
  // Saindo de z = -6 indo pro outro lado: cruza a rede em z = 0.
  const de = v(0, 1.5, -6);

  const porCima = new THREE.Vector3();
  arcoPorApice(de, v(0, 0, 6), 7, porCima);
  const alta = alturaAoCruzarRede(de, porCima);
  assert.ok(alta > COURT.netHeight, `devia passar por cima, cruzou a ${alta.toFixed(2)} m`);

  // Um lance raso e rapido bate na rede.
  const rasa = new THREE.Vector3();
  arcoPorTempo(de, v(0, 0, 6), 0.55, rasa);
  const baixa = alturaAoCruzarRede(de, rasa);
  assert.ok(baixa < COURT.netHeight, `devia bater na rede, cruzou a ${baixa.toFixed(2)} m`);

  // Bola indo pro proprio lado nunca cruza o plano.
  assert.ok(Number.isNaN(alturaAoCruzarRede(de, v(0, 5, -3))), 'nao devia cruzar');
});
