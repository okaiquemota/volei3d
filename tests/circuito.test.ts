import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFINICAO, ETAPAS, VOCE_ID, adversarioAtual, novaCarreira, novoTorneio, podeJogar,
  registrarPartida, type Carreira, type Torneio,
} from '../src/match/Circuito';

/**
 * O que estes testes protegem:
 *
 * Chave de torneio erra calada. Um adversario repetido, uma rodada que nao
 * anda, um titulo que nao abre a etapa seguinte, um progresso que muda ao
 * recarregar a pagina — nenhum deles da' erro, e todos tiram o sentido do
 * circuito. Sao exatamente os defeitos que so' aparecem depois de uma hora de
 * jogo, que e' quando ninguem esta' olhando o codigo.
 */

const GANHEI = { voce: 15, ele: 9 };
const PERDI = { voce: 11, ele: 15 };

/** Joga o torneio inteiro ganhando tudo. */
function ganharTudo(t: Torneio, c: Carreira): { torneio: Torneio; carreira: Carreira } {
  let torneio = t;
  let carreira = c;
  while (adversarioAtual(torneio)) {
    ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  }
  return { torneio, carreira };
}

test('a chave tem oito, sem ninguem repetido, e voce esta nela', () => {
  const t = novoTorneio('municipal', 42);
  const quartas = t.rodadas[0]!;
  assert.equal(quartas.length, 4);

  const ids = quartas.flatMap((c) => [c.a.id, c.b.id]);
  const nomes = quartas.flatMap((c) => [c.a.nome, c.b.nome]);
  assert.equal(new Set(ids).size, 8, 'jogador repetido na chave');
  assert.equal(new Set(nomes).size, 8, 'nome repetido na chave');
  assert.ok(ids.includes(VOCE_ID));
});

/**
 * A RAMPA, que e' o que faz o torneio ter forma.
 *
 * Voce estreia contra o mais fraco e, com os favoritos passando, pega o mais
 * forte na final. Se a chave cruzasse errado, a final poderia ser o jogo mais
 * facil do torneio.
 */
test('voce estreia contra o mais fraco e a forca sobe rodada a rodada', () => {
  for (const etapa of ETAPAS) {
    const t = novoTorneio(etapa, 7);
    const estreia = adversarioAtual(t)!;
    assert.ok(Math.abs(estreia.forca - DEFINICAO[etapa].forcaMin) < 1e-9,
      `${etapa}: estreia contra forca ${estreia.forca}, esperado ${DEFINICAO[etapa].forcaMin}`);

    // Da' pra testar a rampa sem depender de zebra: a MEDIA das forcas que
    // voce enfrenta, em muitas chaves, tem que subir a cada rodada.
    const soma = [0, 0, 0];
    const N = 200;
    for (let s = 0; s < N; s++) {
      let torneio = novoTorneio(etapa, s);
      let carreira = novaCarreira();
      for (let r = 0; r < 3; r++) {
        soma[r]! += adversarioAtual(torneio)!.forca;
        if (r < 2) ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
      }
    }
    const [q, sf, f] = soma.map((x) => x / N) as [number, number, number];
    assert.ok(q < sf && sf < f, `${etapa}: forca media ${q.toFixed(2)} / ${sf.toFixed(2)} / ${f.toFixed(2)} nao sobe`);
  }
});

test('ganhar tres vezes e ser campeao, e cada rodada e um adversario novo', () => {
  let torneio = novoTorneio('municipal', 3);
  let carreira = novaCarreira();
  const vistos = new Set<string>();

  for (let r = 0; r < 3; r++) {
    const ele = adversarioAtual(torneio)!;
    assert.ok(!vistos.has(ele.id), 'o mesmo adversario duas vezes');
    vistos.add(ele.id);
    const saida = registrarPartida(torneio, carreira, true, GANHEI);
    ({ torneio, carreira } = saida);
    assert.equal(saida.desfecho.tipo, r < 2 ? 'avancou' : 'campeao');
  }

  assert.ok(torneio.campeao);
  assert.equal(adversarioAtual(torneio), null, 'campeao ainda tem adversario');
  assert.equal(carreira.titulos.municipal, 1);
});

test('perder elimina, e ninguem mais aparece pra jogar', () => {
  const { torneio, carreira, desfecho } = registrarPartida(novoTorneio('estadual', 5), novaCarreira(), false, PERDI);
  assert.equal(desfecho.tipo, 'eliminado');
  assert.ok(torneio.eliminado);
  assert.equal(adversarioAtual(torneio), null);
  assert.equal(carreira.derrotas, 1);
  assert.throws(() => registrarPartida(torneio, carreira, true, GANHEI), 'jogou depois de eliminado');
});

/** A escada: o titulo abre a proxima, e so' ele. */
test('so o titulo abre a etapa seguinte, e abre uma vez so', () => {
  let carreira = novaCarreira();
  assert.ok(podeJogar(carreira, 'municipal'));
  assert.ok(!podeJogar(carreira, 'estadual'));

  // Chegar a' final e perder NAO abre nada.
  let torneio = novoTorneio('municipal', 11);
  for (let r = 0; r < 2; r++) ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  ({ carreira } = registrarPartida(torneio, carreira, false, PERDI));
  assert.ok(!podeJogar(carreira, 'estadual'), 'vice abriu a etapa seguinte');

  // Ganhar abre, e o desfecho conta que abriu.
  torneio = novoTorneio('municipal', 12);
  for (let r = 0; r < 2; r++) ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  const saida = registrarPartida(torneio, carreira, true, GANHEI);
  assert.equal(saida.desfecho.liberou, 'estadual');
  assert.ok(podeJogar(saida.carreira, 'estadual'));

  // Ganhar de novo nao "libera" outra vez.
  const bis = ganharTudo(novoTorneio('municipal', 13), saida.carreira);
  assert.deepEqual(bis.carreira.liberadas, ['municipal', 'estadual']);
});

test('os pontos de ranking batem com a tabela', () => {
  const { carreira } = ganharTudo(novoTorneio('mundial', 1), novaCarreira());
  const d = DEFINICAO.mundial;
  assert.equal(carreira.ranking, d.porVitoria * 3 + d.porTitulo);
});

test('sequencia e placar acumulado da carreira', () => {
  let torneio = novoTorneio('municipal', 21);
  let carreira = novaCarreira();
  ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  assert.equal(carreira.sequencia, 2);

  ({ carreira } = registrarPartida(torneio, carreira, false, PERDI));
  assert.equal(carreira.sequencia, 0, 'derrota nao zerou a sequencia');
  assert.equal(carreira.melhorSequencia, 2, 'derrota apagou o recorde');
  assert.equal(carreira.pontosFeitos, 15 + 15 + 11);
  assert.equal(carreira.pontosSofridos, 9 + 9 + 15);
});

/**
 * O teste que decide se o progresso salvo presta.
 *
 * O torneio e' salvo no meio (em JSON) e retomado. Os jogos da CPU que voce nao
 * jogou tem que dar o MESMO resultado que dariam sem a volta pelo JSON — senao
 * recarregar a pagina muda quem esta' na sua semifinal.
 */
test('salvar no meio e continuar da o mesmo torneio', () => {
  const semente = 987654;
  const direto = ganharTudo(novoTorneio('estadual', semente), novaCarreira());

  let torneio = novoTorneio('estadual', semente);
  let carreira = novaCarreira();
  for (let r = 0; r < 3; r++) {
    // A volta pelo JSON a cada rodada: exatamente o que o localStorage faz.
    torneio = JSON.parse(JSON.stringify(torneio));
    carreira = JSON.parse(JSON.stringify(carreira));
    ({ torneio, carreira } = registrarPartida(torneio, carreira, true, GANHEI));
  }

  assert.deepEqual(torneio, direto.torneio);
  assert.deepEqual(carreira, direto.carreira);
});

test('registrar nao mexe no que entrou', () => {
  const t = novoTorneio('municipal', 77);
  const c = novaCarreira();
  const antesT = JSON.stringify(t);
  const antesC = JSON.stringify(c);
  registrarPartida(t, c, true, GANHEI);
  assert.equal(JSON.stringify(t), antesT, 'o torneio de entrada mudou');
  assert.equal(JSON.stringify(c), antesC, 'a carreira de entrada mudou');
});

/** Zebra existe, mas nao manda. */
test('o favorito ganha quase sempre, mas nao sempre', () => {
  let favoritoPassou = 0;
  let total = 0;
  for (let s = 0; s < 400; s++) {
    const { torneio } = registrarPartida(novoTorneio('municipal', s), novaCarreira(), true, GANHEI);
    for (const c of torneio.rodadas[0]!) {
      if (c.a.id === VOCE_ID) continue;
      const favorito = c.a.forca >= c.b.forca ? c.a : c.b;
      if (c.vencedor === favorito.id) favoritoPassou++;
      total++;
    }
  }
  const taxa = favoritoPassou / total;
  assert.ok(taxa > 0.55, `favorito so passa ${(taxa * 100).toFixed(0)}% das vezes: a chave virou loteria`);
  assert.ok(taxa < 0.97, `favorito passa ${(taxa * 100).toFixed(0)}%: nao existe zebra`);
});
