import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Tempo } from '../src/core/Tempo';
import { TEMPO } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * Um recurso que drena e recarrega erra em silencio. Gastar em tempo de JOGO em
 * vez de tempo de relogio faz a barra durar tres vezes mais do que promete, e
 * ninguem descobre isso olhando — so' cronometrando. E tremer no fim da barra
 * (liga, esvazia, desliga, recarrega um fio, liga de novo) e' um quadro de
 * mundo lento no meio de um toque, que parece travamento.
 */

/** Roda `segundos` de relogio em quadros de 60 Hz. Devolve as escalas vistas. */
function correr(t: Tempo, segundos: number, querLento: boolean): number[] {
  const escalas: number[] = [];
  for (let i = 0; i < Math.round(segundos * 60); i++) escalas.push(t.passo(1 / 60, querLento));
  return escalas;
}

test('parado, o tempo do jogo e o tempo do relogio', () => {
  const t = new Tempo();
  assert.equal(t.passo(1 / 60, false), 1);
  assert.equal(t.ativo, false);
  assert.equal(t.fracao, 1);
});

test('a barra cheia dura o que promete, em segundos de RELOGIO', () => {
  const t = new Tempo();
  // Um fio a menos que a duracao: ainda tem carga, ainda esta' lento.
  correr(t, TEMPO.duracao - 0.1, true);
  assert.equal(t.ativo, true, 'desligou cedo');
  assert.ok(t.fracao > 0 && t.fracao < 0.1, `sobrou ${t.fracao}`);

  correr(t, 0.2, true);
  assert.equal(t.ativo, false, 'nao desligou no fim');
});

test('esvaziou, so volta depois de soltar — senao o poder pisca', () => {
  const t = new Tempo();
  // Segura muito alem do fim: a barra recarrega sozinha e cruza o minimo.
  correr(t, TEMPO.duracao + TEMPO.recarga * 0.5, true);
  assert.ok(t.fracao > TEMPO.minimoParaLigar, 'o teste precisa cruzar o minimo pra valer');
  assert.equal(t.ativo, false, 'religou sozinho com o dedo preso');

  // Soltar destrava, e o pedido seguinte pega.
  t.passo(1 / 60, false);
  assert.equal(t.passo(1 / 60, true), TEMPO.escala);
});

test('ligado, o mundo anda na escala; o quadro que esvazia ainda e lento', () => {
  const t = new Tempo();
  const escalas = correr(t, TEMPO.duracao, true);
  assert.ok(escalas.every((e) => e === TEMPO.escala), 'algum quadro saiu em velocidade cheia');
});

test('recarrega no tempo prometido, e nao passa de cheia', () => {
  const t = new Tempo();
  correr(t, TEMPO.duracao, true);
  assert.equal(t.fracao, 0);

  correr(t, TEMPO.recarga / 2, false);
  assert.ok(Math.abs(t.fracao - 0.5) < 0.02, `metade da recarga deu ${t.fracao}`);

  correr(t, TEMPO.recarga, false);
  assert.equal(t.fracao, 1, 'passou de cheia');
});

test('nao liga com a barra abaixo do minimo', () => {
  const t = new Tempo();
  correr(t, TEMPO.duracao, true);

  // Um fio de recarga: existe carga, mas nao a suficiente pra ligar.
  correr(t, TEMPO.recarga * (TEMPO.minimoParaLigar * 0.5), false);
  assert.ok(t.fracao > 0, 'o teste precisa de alguma carga pra valer');
  assert.equal(t.passo(1 / 60, true), 1);
  assert.equal(t.ativo, false);
});

test('o minimo vale so pra LIGAR: quem ja esta lento desce ate o zero sem piscar', () => {
  const t = new Tempo();
  const escalas = correr(t, TEMPO.duracao, true);
  // Se o minimo valesse pra manter, haveria um 1 no meio da corrida.
  assert.equal(escalas.indexOf(1), -1);
});

test('soltar desliga na hora, e a recarga comeca no mesmo quadro', () => {
  const t = new Tempo();
  correr(t, 1, true);
  const antes = t.fracao;
  assert.equal(t.passo(1 / 60, false), 1);
  assert.equal(t.ativo, false);
  assert.ok(t.fracao > antes, 'nao voltou a carregar');
});

test('zerar devolve a barra cheia e desligada', () => {
  const t = new Tempo();
  correr(t, 1, true);
  t.zerar();
  assert.equal(t.fracao, 1);
  assert.equal(t.ativo, false);
});
