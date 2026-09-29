import { AI_SKILL, ATHLETE, ATRIBUTO, type AiSkill } from '../config';
import type { Atributo, Notas } from './personagens';

/**
 * De notas de 1 a 10 pra numeros de jogo.
 *
 * A IA tinha tres degraus — facil, normal, dificil — e agora cada adversario e'
 * uma FICHA: oito notas, cada uma mexendo no seu pedaco. Um sacador de 9 com
 * forca 3 saca de viagem e corta fraco; nenhum dos tres presets fazia isso.
 *
 * A conta passa PELO `normal`, em vez de ir numa reta do facil ao dificil. Nao
 * e' capricho: os tres presets foram afinados a mao e medidos (o teto da defesa
 * em 0,4, por exemplo, custou uma quadra congelada pra descobrir), e uma reta
 * direta cruzaria o meio num ponto que ninguem testou. Assim a nota 5 E' o
 * normal, campo por campo, e os testes conferem isso.
 *
 * A nota e' presa em [1, 10]. Os presets sao os extremos medidos; extrapolar
 * alem deles poderia dar atraso negativo ou erro de mira negativo, que o resto
 * do codigo nao espera.
 */

/** O que muda no CORPO. A cabeca e' a `AiSkill`; isto e' perna. */
export interface Corpo {
  /** Corrida, em m/s. */
  velocidade: number;
  /** Altura do pulo, em metros. */
  pulo: number;
}

/** O corpo de sempre: o seu, e o de toda CPU sem nome. */
export const CORPO_PADRAO: Readonly<Corpo> = {
  velocidade: ATHLETE.moveSpeed,
  pulo: ATHLETE.jumpHeight,
};

/**
 * Qual nota manda em cada numero da IA.
 *
 * O tipo exige TODOS os campos da `AiSkill`: um campo novo na IA que ninguem
 * ligou a atributo nenhum nao compila, em vez de ficar parado no valor de um
 * preset sem ninguem perceber.
 *
 * Tres notas mandam em mais de um numero, e cada par tem motivo:
 * - FORCA e' a batida e o GOSTO pela batida: quem crava forte procura a
 *   cortada (`spikeChance`).
 * - REFLEXO e' reagir e nao enrolar: o tempo parado antes do saque vai junto.
 * - LEITURA e' ler a bola (onde cai, se cai fora) e ler a jogada (armar em dois
 *   toques em vez de devolver de primeira).
 */
export const FONTE: Readonly<Record<keyof AiSkill, Atributo>> = {
  attackForce: 'forca',
  spikeChance: 'forca',
  forcaDoSaque: 'saque',
  reactionDelay: 'reflexo',
  serveDelay: 'reflexo',
  defesa: 'defesa',
  aimError: 'precisao',
  positionError: 'leitura',
  margemDeFora: 'leitura',
  chanceDeArmar: 'leitura',
};

/** Uma nota de 1 a 10, pelas ancoras das notas 1, 5 e 10. */
export function naEscala(nota: number, ancoras: readonly [number, number, number]): number {
  const [em1, em5, em10] = ancoras;
  const x = Math.min(ATRIBUTO.maximo, Math.max(ATRIBUTO.minimo, nota));
  return x <= 5
    ? em1 + (em5 - em1) * ((x - 1) / 4)
    : em5 + (em10 - em5) * ((x - 5) / 5);
}

export interface Ficha {
  habilidade: AiSkill;
  corpo: Corpo;
}

/** Tudo o que as notas de um personagem viram em quadra. */
export function fichaDe(notas: Notas): Ficha {
  const habilidade = {} as AiSkill;
  for (const campo of Object.keys(FONTE) as Array<keyof AiSkill>) {
    habilidade[campo] = naEscala(notas[FONTE[campo]], [
      AI_SKILL.facil[campo], AI_SKILL.normal[campo], AI_SKILL.dificil[campo],
    ]);
  }

  return {
    habilidade,
    corpo: {
      velocidade: naEscala(notas.velocidade, ATRIBUTO.velocidade),
      pulo: naEscala(notas.pulo, ATRIBUTO.pulo),
    },
  };
}
