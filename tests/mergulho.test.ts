import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Motor } from '../src/players/Motor';
import { Hitter } from '../src/players/Hitter';
import type { Ball } from '../src/ball/Ball';
import { ATHLETE, HIT, MERGULHO } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * O mergulho e' uma TROCA — alcance agora, em troca de nao corrigir no voo e de
 * ficar caido depois. Se qualquer metade do custo vazar, ele deixa de ser um
 * recurso e vira o jeito normal de andar: um mergulho corrigivel e' so' uma
 * corrida mais rapida, e um mergulho sem tempo de levantar e' uma corrida mais
 * rapida que tambem alcanca mais.
 *
 * E o TEMPO DE VOO e' a janela em que o corpo esta' estendido — e' ele que a
 * camera lenta estica. Se ele encolher, o poder para de servir pro que foi
 * feito, e nada na tela denuncia isso.
 */

/** Um motor sem limite de area: aqui se mede o corpo, nao a quadra. */
const novoMotor = (): Motor => new Motor((posicao, out) => out.copy(posicao));

/** Roda `segundos` em quadros de 60 Hz. */
function correr(m: Motor, segundos: number): void {
  for (let i = 0; i < Math.round(segundos * 60); i++) m.update(1 / 60);
}

const LESTE = new THREE.Vector3(1, 0, 0);
const NORTE = new THREE.Vector3(0, 0, 1);

test('mergulhar arranca o corpo na direcao pedida e tira ele do chao', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);
  m.update(1 / 60);

  assert.equal(m.mergulhando, true);
  assert.equal(m.noChao, false);
  assert.ok(m.velocidadeHorizontal.x > MERGULHO.impulso * 0.9, `saiu a ${m.velocidadeHorizontal.x}`);
  assert.ok(Math.abs(m.velocidadeHorizontal.z) < 0.01, 'saiu torto');
});

test('o arranco SUBSTITUI a corrida: quem ja corria nao mergulha mais longe', () => {
  const parado = novoMotor();
  parado.mergulhar(LESTE);
  parado.update(1 / 60);

  const correndo = novoMotor();
  correndo.moverPara(LESTE);
  correr(correndo, 1);                       // ja' esta' na velocidade maxima
  assert.ok(correndo.velocidadeHorizontal.x > ATHLETE.moveSpeed * 0.95, 'o teste precisa da corrida cheia');
  correndo.mergulhar(LESTE);
  correndo.update(1 / 60);

  assert.ok(Math.abs(correndo.velocidadeHorizontal.x - parado.velocidadeHorizontal.x) < 0.01,
    'o mergulho somou a corrida em vez de substituir');
});

test('no voo o teclado nao manda: o corpo vai pra onde se jogou', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);
  m.update(1 / 60);

  // Tenta virar pro norte no meio do voo, quadro a quadro.
  for (let i = 0; i < 12; i++) { m.moverPara(NORTE); m.update(1 / 60); }

  assert.equal(m.mergulhando, true, 'o voo acabou antes do teste valer');
  assert.ok(Math.abs(m.velocidadeHorizontal.z) < 0.5, `corrigiu pro norte: ${m.velocidadeHorizontal.z}`);
  assert.ok(m.velocidadeHorizontal.x > MERGULHO.impulso * 0.6, 'perdeu o arranco no meio do voo');
});

test('o voo dura o que a config promete: e a janela que a camera lenta estica', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);

  const esperado = (2 * MERGULHO.impulsoVertical) / MERGULHO.gravidade;
  let voo = 0;
  for (let i = 0; i < 600; i++) {
    m.update(1 / 60);
    if (!m.mergulhando) break;
    voo += 1 / 60;
  }

  assert.ok(Math.abs(voo - esperado) < 0.05, `voou ${voo.toFixed(2)}s, esperado ${esperado.toFixed(2)}s`);
});

test('caiu, fica caido: nao corre e nao pula ate levantar', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);
  correr(m, 1);                              // voa e aterrissa

  assert.equal(m.mergulhando, false);
  assert.equal(m.levantando, true, 'levantou na hora');
  assert.equal(m.livre, false);

  m.moverPara(NORTE);
  m.pular();
  correr(m, 0.2);
  assert.equal(m.noChao, true, 'pulou caido');
  assert.ok(m.velocidadeHorizontal.length() < 0.5, 'correu caido');
});

test('passado o tempo de levantar, o corpo volta a obedecer', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);
  correr(m, 1 + MERGULHO.levantar);

  assert.equal(m.livre, true);
  m.moverPara(NORTE);
  correr(m, 0.5);
  assert.ok(m.velocidadeHorizontal.z > ATHLETE.moveSpeed * 0.9, 'nao voltou a correr');
});

test('nao da pra mergulhar de novo no ar nem caido', () => {
  const m = novoMotor();
  m.mergulhar(LESTE);
  m.update(1 / 60);

  const noAr = m.velocidadeHorizontal.clone();
  m.mergulhar(NORTE);                        // no meio do voo
  m.update(1 / 60);
  assert.ok(Math.abs(m.velocidadeHorizontal.z - noAr.z) < 0.5, 'mergulhou de novo no ar');

  correr(m, 1);                              // agora caido
  assert.equal(m.levantando, true);
  m.mergulhar(NORTE);
  m.update(1 / 60);
  assert.ok(m.velocidadeHorizontal.length() < 1, 'mergulhou caido');
});

test('sem direcao, mergulha pra FRENTE', () => {
  const m = novoMotor();
  m.encarar(NORTE);
  m.mergulhar(new THREE.Vector3(0, 0, 0));
  m.update(1 / 60);

  assert.equal(m.mergulhando, true, 'nao saiu do lugar');
  assert.ok(m.velocidadeHorizontal.z > MERGULHO.impulso * 0.9, `foi pra ${m.velocidadeHorizontal.z}`);
});

test('o corpo deita no mergulho e levanta depois', () => {
  const m = novoMotor();
  assert.equal(m.inclinacaoDoCorpo, 0);

  m.mergulhar(LESTE);
  correr(m, 0.3);
  assert.ok(m.inclinacaoDoCorpo > 0.9, `deitou so' ${m.inclinacaoDoCorpo.toFixed(2)}`);

  correr(m, 1 + MERGULHO.levantar);
  assert.ok(m.inclinacaoDoCorpo < 0.05, `continuou deitado em ${m.inclinacaoDoCorpo.toFixed(2)}`);
});

/**
 * A outra metade da troca: o alcance.
 *
 * Aqui nao ha' quadra nem rally — so' a pergunta que o mergulho existe pra
 * mudar de resposta: "da' pra tocar nesta bola?". Uma bola falsa basta, porque
 * `alcanca` e `qualidadeDoContato` so' leem posicao e velocidade.
 */
const bolaEm = (x: number, y: number, z: number, velocidade = 0): Ball => ({
  presa: false,
  posicao: new THREE.Vector3(x, y, z),
  velocidade: new THREE.Vector3(0, 0, velocidade),
} as unknown as Ball);

const ORIGEM = new THREE.Vector3(0, 0, 0);

test('o mergulho alcanca o que os pes nao alcancam', () => {
  const h = new Hitter();
  const longe = bolaEm(HIT.reachRadius + MERGULHO.alcanceExtra * 0.7, 0.5, 0);

  h.estendido = false;
  assert.equal(h.alcanca(longe, ORIGEM), false, 'de pe ja alcancava: o teste nao prova nada');

  h.estendido = true;
  assert.equal(h.alcanca(longe, ORIGEM), true, 'nem deitado alcancou');
});

test('deitado tambem alcanca mais pra BAIXO: a bola rasteira', () => {
  const h = new Hitter();
  // O corpo no meio do voo, uns 20 cm do chao, e a bola rente a areia.
  const alto = new THREE.Vector3(0, 0.2 + HIT.lowReach + 0.1, 0);
  const rasteira = bolaEm(0.3, 0, 0);

  h.estendido = false;
  assert.equal(h.alcanca(rasteira, alto), false);
  h.estendido = true;
  assert.equal(h.alcanca(rasteira, alto), true);
});

test('deitado NAO deixa o contato perto do corpo mais limpo', () => {
  const h = new Hitter();
  const perto = bolaEm(0.4, 0.5, 0);

  h.estendido = false;
  const dePe = h.qualidadeDoContato(perto, ORIGEM);
  h.estendido = true;
  const deitado = h.qualidadeDoContato(perto, ORIGEM);

  // Deitado amortece a velocidade, entao com a bola PARADA os dois tem que dar
  // exatamente o mesmo numero: o que o mergulho estica e' so' a faixa cara.
  assert.equal(deitado, dePe);
  assert.ok(dePe > 0.9, 'a bola de teste precisa estar na zona limpa');
});

test('deitado amortece a bola rapida — senao todo mergulho queimaria', () => {
  const h = new Hitter();
  const cortada = bolaEm(0.4, 0.5, 0, -22);

  h.estendido = false;
  const dePe = h.qualidadeDoContato(cortada, ORIGEM);
  h.estendido = true;
  const deitado = h.qualidadeDoContato(cortada, ORIGEM);

  assert.ok(deitado > dePe, `deitado ${deitado.toFixed(2)} nao amorteceu nada (de pe ${dePe.toFixed(2)})`);
});
