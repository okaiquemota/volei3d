import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLORS } from '../src/config';
import { ETAPAS, VAGAS_DA_CPU } from '../src/match/Circuito';
import {
  ATRIBUTOS, ELENCO, elencoDaEtapa, estiloDe, geral, personagemPorId,
} from '../src/match/personagens';

/**
 * O que estes testes protegem:
 *
 * O elenco e' a parte do jogo feita pra ser EDITADA a mao — e' ali que se cria
 * personagem e se afina nota. Estes testes conferem o que um ajuste costuma
 * quebrar sem avisar: uma nota fora da escala, um id repetido (o save guarda
 * pelo id), uma etapa que ficou sem gente pra encher a chave.
 */

test('ids e nomes sao unicos', () => {
  assert.equal(new Set(ELENCO.map((p) => p.id)).size, ELENCO.length, 'id repetido');
  assert.equal(new Set(ELENCO.map((p) => p.nome)).size, ELENCO.length, 'nome repetido');
  for (const p of ELENCO) assert.equal(personagemPorId(p.id), p);
  assert.equal(personagemPorId('ninguem'), null);
});

test('toda nota e inteira, de 1 a 10, e ninguem esquece nenhuma', () => {
  for (const p of ELENCO) {
    assert.deepEqual(Object.keys(p.notas).sort(), [...ATRIBUTOS].sort(), `${p.nome}: notas faltando ou sobrando`);
    for (const a of ATRIBUTOS) {
      const nota = p.notas[a];
      assert.ok(Number.isInteger(nota) && nota >= 1 && nota <= 10, `${p.nome}: ${a} = ${nota}`);
    }
    assert.ok(p.frase.length > 0 && p.frase.length <= 80, `${p.nome}: frase vazia ou longa demais pra ficha`);
  }
});

test('cada etapa tem gente pra encher a chave', () => {
  for (const etapa of ETAPAS) {
    const n = elencoDaEtapa(etapa).length;
    assert.ok(n >= VAGAS_DA_CPU, `${etapa} tem ${n}, a chave precisa de ${VAGAS_DA_CPU}`);
  }
});

/**
 * A escada, medida no elenco.
 *
 * A media de cada etapa sobe — senao o mundial seria mais facil que o
 * estadual — mas as faixas se SOBREPOEM: o melhor de uma etapa e' mais forte
 * que o pior da seguinte. Sem a sobreposicao, a estreia de cada etapa seria
 * sempre mais dura que a final da anterior, e subir seria um degrau.
 */
test('a media sobe de etapa em etapa, e as faixas se sobrepoem', () => {
  const faixas = ETAPAS.map((e) => {
    const gerais = elencoDaEtapa(e).map(geral);
    return {
      min: Math.min(...gerais),
      max: Math.max(...gerais),
      media: gerais.reduce((s, x) => s + x, 0) / gerais.length,
    };
  });
  for (let i = 1; i < faixas.length; i++) {
    const [antes, depois] = [faixas[i - 1]!, faixas[i]!];
    assert.ok(depois.media > antes.media, `${ETAPAS[i]} nao e mais forte que ${ETAPAS[i - 1]} na media`);
    assert.ok(antes.max > depois.min, `${ETAPAS[i - 1]} e ${ETAPAS[i]} nao se sobrepoem: subir virou degrau`);
  }
});

/**
 * O colete e' a cor do personagem, e azul e' o SEU time.
 *
 * Um adversario de colete azul seria voce do outro lado da rede. Cor sem
 * saturacao (branco, cinza, preto) nao tem matiz pra confundir e passa.
 */
test('nenhum colete e azul como o seu time', () => {
  const matiz = (hex: number): { h: number; s: number } => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    return { h: (h * 60 + 360) % 360, s };
  };

  const seu = matiz(COLORS.home).h;
  for (const p of ELENCO) {
    const { h, s } = matiz(p.visual.colete);
    if (s < 0.25) continue;
    const distancia = Math.min(Math.abs(h - seu), 360 - Math.abs(h - seu));
    assert.ok(distancia > 45, `${p.nome}: colete a ${distancia.toFixed(0)} graus do azul do seu time`);
  }
});

/** O apelido e' promessa: e o estilo, tirado das notas, tem que cumprir. */
test('o estilo sai das notas, e os apelidos cumprem', () => {
  const estilo = (id: string): string => estiloDe(personagemPorId(id)!);
  assert.equal(estilo('nando-saque'), 'SACADOR');
  assert.equal(estilo('kiko-manchete'), 'DEFENSOR');
  assert.equal(estilo('gabi-siri'), 'VELOCISTA');
  assert.equal(estilo('bia-rede'), 'ATACANTE');
  assert.equal(estilo('dudu-farol'), 'ESTRATEGISTA');
  assert.equal(estilo('juca-duna'), 'INICIANTE');
  assert.equal(estilo('vini-recife'), 'COMPLETO');

  // O estilo acompanha a nota, que e' o motivo de ele nao ser escrito a mao.
  const kiko = personagemPorId('kiko-manchete')!;
  assert.equal(estiloDe({ notas: { ...kiko.notas, forca: 10, pulo: 10 } }), 'ATACANTE');
});

test('o chefe do mundial e o mais forte do jogo', () => {
  const melhor = [...ELENCO].sort((a, b) => geral(b) - geral(a))[0]!;
  assert.equal(melhor.etapa, 'mundial');
});
