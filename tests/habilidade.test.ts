import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AI_SKILL, type AiSkill } from '../src/config';
import { habilidadeDe } from '../src/match/habilidade';

/**
 * O que estes testes protegem:
 *
 * Os tres presets foram afinados a mao e medidos contra a quadra rodando. A
 * forca de um adversario do circuito tem que CAIR EXATAMENTE neles nos pontos
 * 0, 0,5 e 1 — senao o "adversario normal" do circuito joga diferente do
 * "normal" do amistoso, e ninguem sabe por que.
 */

const igual = (a: AiSkill, b: AiSkill): void => {
  for (const k of Object.keys(b) as Array<keyof AiSkill>) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} contra ${b[k]}`);
  }
};

test('nos pontos 0, 0,5 e 1 a forca E o preset', () => {
  igual(habilidadeDe(0), AI_SKILL.facil);
  igual(habilidadeDe(0.5), AI_SKILL.normal);
  igual(habilidadeDe(1), AI_SKILL.dificil);
});

test('a forca fica presa entre os extremos medidos', () => {
  igual(habilidadeDe(-3), AI_SKILL.facil);
  igual(habilidadeDe(7), AI_SKILL.dificil);
});

/**
 * Mais forca nunca piora nada.
 *
 * Cada campo tem um sentido: reacao e erros CAEM com a forca, chance de cortar
 * e defesa SOBEM. Se algum campo andasse ao contrario no meio da rampa, um
 * adversario "mais forte" poderia errar mais — e o circuito ficaria mais facil
 * justo na final.
 */
test('mais forca nunca piora nenhum atributo', () => {
  const sentido = (k: keyof AiSkill): number =>
    Math.sign(AI_SKILL.dificil[k] - AI_SKILL.facil[k]);

  for (let f = 0; f < 1; f += 0.05) {
    const antes = habilidadeDe(f);
    const depois = habilidadeDe(f + 0.05);
    for (const k of Object.keys(antes) as Array<keyof AiSkill>) {
      const s = sentido(k);
      if (s === 0) continue;
      assert.ok((depois[k] - antes[k]) * s >= -1e-9,
        `${k} anda ao contrario entre ${f.toFixed(2)} e ${(f + 0.05).toFixed(2)}`);
    }
  }
});
