import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lerCarga } from '../src/players/carga';
import { ATAQUE } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * A barra de forca e' a unica coisa no jogo que o jogador controla com o TEMPO
 * do dedo, e a leitura dela e' a diferenca entre um ataque e uma bola torta.
 * Se a zona escorregar meio quadro, ninguem percebe olhando — so' sentindo que
 * "a barra nao faz nada", que e' exatamente de onde ela veio.
 */

test('sem carga nenhuma nao ha forca, e a batida sai torta', () => {
  const r = lerCarga(0);
  assert.equal(r.forca, 0);
  assert.equal(r.erro, ATAQUE.erroApressado);
  assert.equal(r.naZona, false);
  assert.equal(r.passou, false);
});

test('a zona da forca cheia e mira limpa, do comeco ao topo', () => {
  for (const f of [ATAQUE.zonaIdeal, (ATAQUE.zonaIdeal + 1) / 2, 1]) {
    const r = lerCarga(f);
    assert.equal(r.forca, 1, `forca em ${f}`);
    assert.equal(r.erro, 0, `erro em ${f}`);
    assert.equal(r.naZona, true, `zona em ${f}`);
  }
});

test('um quadro antes da zona ainda NAO e a zona', () => {
  const r = lerCarga(ATAQUE.zonaIdeal - 1e-6);
  assert.equal(r.naZona, false);
  assert.ok(r.forca < 1);
  assert.ok(r.erro > 0);
});

test('passar da zona tira forca e poe erro, os dois crescendo com o excesso', () => {
  const pouco = lerCarga(1 + (ATAQUE.cargaMaxima - 1) * 0.25);
  const muito = lerCarga(ATAQUE.cargaMaxima);

  assert.equal(pouco.passou, true);
  assert.ok(pouco.forca < 1 && pouco.forca > muito.forca, 'a forca cai e continua caindo');
  assert.ok(muito.erro > pouco.erro && pouco.erro > 0, 'o erro cresce e continua crescendo');
  assert.equal(+muito.forca.toFixed(6), ATAQUE.perdaAoPassar);
  assert.equal(+muito.erro.toFixed(6), ATAQUE.erroAoPassar);
});

test('segurar alem do teto nao piora mais: o golpe ja saiu la', () => {
  const noTeto = lerCarga(ATAQUE.cargaMaxima);
  const alem = lerCarga(ATAQUE.cargaMaxima * 3);
  assert.deepEqual(alem, noTeto);
});

test('a forca so cresce ate a zona, e nunca passa de 1', () => {
  let anterior = -1;
  for (let f = 0; f <= ATAQUE.zonaIdeal; f += 0.05) {
    const { forca } = lerCarga(f);
    assert.ok(forca >= anterior, `forca caiu em ${f}`);
    assert.ok(forca <= 1, `forca passou de 1 em ${f}`);
    anterior = forca;
  }
});
