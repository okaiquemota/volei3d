import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AI_SKILL, ATRIBUTO, type AiSkill } from '../src/config';
import { CORPO_PADRAO, FONTE, fichaDe } from '../src/match/habilidade';
import { ATRIBUTOS, type Atributo, type Notas } from '../src/match/personagens';

/**
 * O que estes testes protegem:
 *
 * Os tres presets foram afinados a mao e medidos contra a quadra rodando. Uma
 * ficha de personagem tem que CAIR EXATAMENTE neles nas notas 1, 5 e 10 —
 * senao o "adversario 5 em tudo" joga diferente da CPU normal do amistoso, e
 * o elenco inteiro sai desafinado sem ninguem saber por que.
 */

const tudo = (nota: number): Notas =>
  Object.fromEntries(ATRIBUTOS.map((a) => [a, nota])) as Notas;

const igual = (a: AiSkill, b: AiSkill): void => {
  for (const k of Object.keys(b) as Array<keyof AiSkill>) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} contra ${b[k]}`);
  }
};

test('nas notas 1, 5 e 10 a ficha E o preset, e o corpo de 5 e o de sempre', () => {
  igual(fichaDe(tudo(1)).habilidade, AI_SKILL.facil);
  igual(fichaDe(tudo(5)).habilidade, AI_SKILL.normal);
  igual(fichaDe(tudo(10)).habilidade, AI_SKILL.dificil);

  assert.deepEqual(fichaDe(tudo(5)).corpo, CORPO_PADRAO);
  assert.deepEqual(fichaDe(tudo(1)).corpo, { velocidade: ATRIBUTO.velocidade[0], pulo: ATRIBUTO.pulo[0] });
  assert.deepEqual(fichaDe(tudo(10)).corpo, { velocidade: ATRIBUTO.velocidade[2], pulo: ATRIBUTO.pulo[2] });
});

test('a nota fica presa entre 1 e 10', () => {
  igual(fichaDe(tudo(-3)).habilidade, AI_SKILL.facil);
  igual(fichaDe(tudo(40)).habilidade, AI_SKILL.dificil);
});

/**
 * Nenhuma nota enfeite.
 *
 * Um atributo que nao mexe em nada seria o pior tipo de mentira da ficha: o
 * jogador escolhe desafiar o VELOCISTA pela velocidade, e ela nao existe.
 */
test('toda nota mexe em alguma coisa', () => {
  for (const a of ATRIBUTOS) {
    const baixo = fichaDe({ ...tudo(5), [a]: 1 });
    const alto = fichaDe({ ...tudo(5), [a]: 10 });
    assert.notDeepEqual(baixo, alto, `${a} nao muda nada na quadra`);
  }
});

/**
 * E cada nota mexe SO' no que e' dela.
 *
 * Subir a forca de alguem nao pode deixar ele mais rapido ou mais preciso. Se
 * deixasse, a ficha diria uma coisa e a quadra outra.
 */
test('cada nota mexe so no que e dela', () => {
  const base = fichaDe(tudo(5));
  for (const a of ATRIBUTOS) {
    const mexido = fichaDe({ ...tudo(5), [a]: 9 });
    for (const campo of Object.keys(FONTE) as Array<keyof AiSkill>) {
      if (FONTE[campo] === a) continue;
      assert.equal(mexido.habilidade[campo], base.habilidade[campo], `${a} mexeu em ${campo}`);
    }
    if (a !== 'velocidade') assert.equal(mexido.corpo.velocidade, base.corpo.velocidade, `${a} mexeu na corrida`);
    if (a !== 'pulo') assert.equal(mexido.corpo.pulo, base.corpo.pulo, `${a} mexeu no pulo`);
  }
});

/**
 * Nota mais alta nunca piora nada.
 *
 * Cada campo tem um sentido: reacao e erros CAEM, forca, defesa e chance de
 * cortar SOBEM. Se algum andasse ao contrario no meio da escala, subir a nota
 * de alguem poderia deixar ele pior — e o personagem "10 em reflexo" reagiria
 * mais devagar que o de 8.
 */
test('nota mais alta nunca piora nenhum numero', () => {
  const sentido = (k: keyof AiSkill): number => Math.sign(AI_SKILL.dificil[k] - AI_SKILL.facil[k]);

  for (const a of ATRIBUTOS) {
    for (let nota = 1; nota < 10; nota++) {
      const antes = fichaDe({ ...tudo(5), [a]: nota });
      const depois = fichaDe({ ...tudo(5), [a]: nota + 1 });
      for (const k of Object.keys(FONTE) as Array<keyof AiSkill>) {
        const s = sentido(k);
        assert.ok((depois.habilidade[k] - antes.habilidade[k]) * s >= -1e-9,
          `${k} anda ao contrario com ${a} entre ${nota} e ${nota + 1}`);
      }
      assert.ok(depois.corpo.velocidade >= antes.corpo.velocidade);
      assert.ok(depois.corpo.pulo >= antes.corpo.pulo);
    }
  }
});

test('a tabela FONTE so aponta pra atributos que existem', () => {
  const existentes = new Set<Atributo>(ATRIBUTOS);
  for (const [campo, a] of Object.entries(FONTE)) assert.ok(existentes.has(a), `${campo} aponta pra ${a}`);
});
