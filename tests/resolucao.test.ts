import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ESCALA_MINIMA, ResolucaoAutomatica } from '../src/core/ResolucaoAutomatica';

/**
 * O que estes testes protegem: a resolucao automatica tem que DESCER quando o
 * quadro pesa por pixel, NAO descer quando o peso e' do processador, SUBIR de
 * volta quando sobra — e nao ficar pulando de escala, que na tela e' a imagem
 * piscando de nitidez.
 *
 * A placa de video e' de mentira: o tempo dela cresce com a area (o quadrado
 * da escala), e o quadro so' sai no compasso de um monitor de 60 Hz.
 */
const VSYNC = 1 / 60;

interface Resultado {
  trocas: number[];
  /** A fracao do tempo, passado o primeiro segundo, em quadros abaixo de 55 qps. */
  lento: number;
}

function simular(
  r: ResolucaoAutomatica,
  segundos: number,
  gpu: (escala: number) => number,
  trabalho = 0.003,
): Resultado {
  const trocas: number[] = [];
  let t = 0;
  let lento = 0;
  let contado = 0;
  while (t < segundos) {
    const intervalo = Math.max(VSYNC, Math.ceil(gpu(r.escala) / VSYNC - 1e-9) * VSYNC, trabalho);
    if (r.amostrar(intervalo, Math.min(trabalho, intervalo))) trocas.push(t);
    t += intervalo;
    if (t > 1) {
      contado += intervalo;
      if (intervalo > 1 / 55) lento += intervalo;
    }
  }
  return { trocas, lento: lento / Math.max(contado, 1e-9) };
}

test('quadro pesado por pixel desce a escala, ate o quadro caber', () => {
  const r = new ResolucaoAutomatica();
  // 24 ms em 100%: nao cabe nos 16,7 do monitor, e cai pra 30 qps.
  const gpu = (e: number): number => 0.024 * e * e;
  const { lento } = simular(r, 120, gpu);
  assert.ok(r.escala < 1 && r.escala >= 0.7, `escala ${r.escala}`);
  assert.ok(lento < 0.05, `${(lento * 100).toFixed(0)}% do tempo abaixo de 55 qps`);
});

test('placa muito fraca desce rapido, e para no minimo', () => {
  const r = new ResolucaoAutomatica();
  const gpu = (e: number): number => 0.09 * e * e;
  let t = 0;
  while (r.escala > 0.6 && t < 10) { simular(r, 0.5, gpu); t += 0.5; }
  assert.ok(t <= 5, `levou ${t} s pra chegar em 60%`);
  simular(r, 20, gpu);
  assert.equal(r.escala, ESCALA_MINIMA);
});

test('com o processador ocupado, baixar resolucao nao ajuda: a escala fica', () => {
  const r = new ResolucaoAutomatica();
  // 30 ms de jogo por quadro e a placa sobrando.
  simular(r, 20, () => 0.004, 0.03);
  assert.equal(r.escala, 1);
});

test('com folga, a escala sobe de volta ate 100%', () => {
  const r = new ResolucaoAutomatica();
  r.reiniciar(0.6);
  simular(r, 25, () => 0.005);
  assert.equal(r.escala, 1);
});

test('um engasgo sozinho, ou a aba escondida, nao mexe na escala', () => {
  const r = new ResolucaoAutomatica();
  for (let i = 0; i < 60 * 30; i++) {
    // Um quadro de 200 ms a cada dois segundos (lixo coletado, um arquivo chegando)...
    r.amostrar(i % 120 === 0 ? 0.2 : VSYNC, 0.003);
    // ...e de vez em quando a aba some por 3 s.
    if (i % 600 === 0) r.amostrar(3, 0);
  }
  assert.equal(r.escala, 1);
});

/**
 * No limite — 100% quase cabe, 95% cabe —, a escala tenta subir de tempos em
 * tempos, e cada tentativa que falha dobra a espera. Em cinco minutos sao
 * poucas trocas, e quase nenhuma no fim.
 */
test('no limite, a escala nao fica pulando', () => {
  const r = new ResolucaoAutomatica();
  const gpu = (e: number): number => 0.0175 * e * e;
  const { trocas, lento } = simular(r, 300, gpu);
  assert.ok(trocas.length <= 20, `${trocas.length} trocas em 5 min`);
  assert.ok(trocas.filter((t) => t > 180).length <= 4, `${trocas.filter((t) => t > 180).length} trocas nos ultimos 2 min`);
  assert.ok(r.escala >= 0.9, `escala ${r.escala}: desceu demais`);
  assert.ok(lento < 0.03, `${(lento * 100).toFixed(1)}% do tempo abaixo de 55 qps`);
});

test('a cena que pesa depois de muito tempo bem nao herda a desconfianca', () => {
  const r = new ResolucaoAutomatica();
  // Primeiro uma cena leve por um bom tempo: fica em 100%.
  simular(r, 30, () => 0.005);
  assert.equal(r.escala, 1);
  // Depois pesa (o estadio): desce. E quando volta a ser leve, sobe logo.
  simular(r, 10, (e) => 0.03 * e * e);
  assert.ok(r.escala < 0.8, `escala ${r.escala}`);
  simular(r, 25, () => 0.005);
  assert.equal(r.escala, 1);
});

/**
 * Sem placa de video (o navegador desenhando na CPU), o quadro passa de 200 ms
 * — e mesmo assim e' o jogo, nao a aba escondida: a escala desce ate o fim.
 */
test('a 4 quadros por segundo, a escala ainda desce', () => {
  const r = new ResolucaoAutomatica();
  simular(r, 40, (e) => 0.3 * e * e, 0.004);
  assert.equal(r.escala, ESCALA_MINIMA);
});
