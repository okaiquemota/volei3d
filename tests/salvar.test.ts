import { test } from 'node:test';
import assert from 'node:assert/strict';

import { novaCarreira, novoTorneio, registrarPartida } from '../src/match/Circuito';
import { carregar, guardar, progressoNovo, type Armazem } from '../src/match/salvar';

/**
 * O que estes testes protegem:
 *
 * Progresso salvo e' a unica parte do jogo que o jogador PERDE de verdade
 * quando quebra. Uma partida que da' errado se joga de novo; um circuito
 * apagado porque o formato mudou nao volta.
 */

/** Um `localStorage` de mentira, que da' pra quebrar de proposito. */
function armazem(inicial: Record<string, string> = {}): Armazem & { dados: Record<string, string> } {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k) => (k in dados ? dados[k]! : null),
    setItem: (k, v) => { dados[k] = v; },
  };
}

const CHAVE = 'volei3d.circuito';

test('guardar e carregar devolve o mesmo progresso', () => {
  const a = armazem();
  let torneio = novoTorneio('municipal', 5);
  let carreira = novaCarreira();
  ({ torneio, carreira } = registrarPartida(torneio, carreira, true, { voce: 15, ele: 8 }));

  assert.ok(guardar(a, { versao: 1, carreira, torneio }));
  const volta = carregar(a);
  assert.deepEqual(volta.carreira, carreira);
  assert.deepEqual(volta.torneio, torneio);
});

test('sem armazem nenhum, o jogo abre do zero e nao quebra', () => {
  assert.deepEqual(carregar(null), progressoNovo());
  assert.equal(guardar(null, progressoNovo()), false);
});

/** Aba anonima e cookie bloqueado: o armazem existe e JOGA ao ser tocado. */
test('armazem que joga excecao nao derruba nada', () => {
  const explode: Armazem = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  assert.deepEqual(carregar(explode), progressoNovo());
  assert.equal(guardar(explode, progressoNovo()), false);
});

test('dado podre vira progresso novo', () => {
  for (const lixo of ['{', 'null', '[]', '"texto"', '{"versao":2}', '{"versao":1,"carreira":7}']) {
    const p = carregar(armazem({ [CHAVE]: lixo }));
    assert.deepEqual(p.carreira, novaCarreira(), `lixo ${lixo} nao virou carreira nova`);
    assert.equal(p.torneio, null);
  }
});

/**
 * O formato CRESCE, e o save de antes tem que continuar valendo.
 *
 * Um save de uma versao que nao tinha `melhorSequencia` nem titulo do mundial
 * nao pode ser jogado fora: o que ele tem, fica; o que falta, entra zerado.
 */
test('save antigo, sem campos novos, continua valendo', () => {
  const antigo = JSON.stringify({
    versao: 1,
    carreira: { ranking: 140, vitorias: 9, derrotas: 2, titulos: { municipal: 2 }, liberadas: ['municipal', 'estadual'] },
    torneio: null,
  });
  const p = carregar(armazem({ [CHAVE]: antigo }));
  assert.equal(p.carreira.ranking, 140);
  assert.equal(p.carreira.vitorias, 9);
  assert.equal(p.carreira.titulos.municipal, 2);
  assert.equal(p.carreira.titulos.mundial, 0, 'campo novo nao entrou zerado');
  assert.equal(p.carreira.melhorSequencia, 0);
  assert.deepEqual(p.carreira.liberadas, ['municipal', 'estadual']);
});

test('numero invalido na carreira cai pro padrao, sem levar o resto junto', () => {
  const p = carregar(armazem({ [CHAVE]: JSON.stringify({
    versao: 1,
    carreira: { ranking: -50, vitorias: 'muitas', derrotas: 3, liberadas: ['municipal', 'lua'] },
    torneio: null,
  }) }));
  assert.equal(p.carreira.ranking, 0, 'ranking negativo passou');
  assert.equal(p.carreira.vitorias, 0, 'texto virou numero');
  assert.equal(p.carreira.derrotas, 3, 'o campo bom foi junto');
  assert.deepEqual(p.carreira.liberadas, ['municipal'], 'etapa inventada entrou');
});

/** Um save que perdeu o municipal deixaria o circuito sem porta de entrada. */
test('o municipal esta sempre aberto', () => {
  const p = carregar(armazem({ [CHAVE]: JSON.stringify({
    versao: 1, carreira: { liberadas: ['estadual'] }, torneio: null,
  }) }));
  assert.ok(p.carreira.liberadas.includes('municipal'));
  assert.ok(p.carreira.liberadas.includes('estadual'));
});

/** Torneio pela metade e' tudo ou nada: chave quebrada e' pior que chave nenhuma. */
test('torneio corrompido some, e a carreira fica', () => {
  const p = carregar(armazem({ [CHAVE]: JSON.stringify({
    versao: 1,
    carreira: { ranking: 30, liberadas: ['municipal'] },
    torneio: { etapa: 'municipal', rodadas: [[{ a: { id: 'voce' } }]], rodada: 5, sorte: 1 },
  }) }));
  assert.equal(p.torneio, null);
  assert.equal(p.carreira.ranking, 30);
});
