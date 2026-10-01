import { COLORS } from '../config';
import type { Armazem } from '../match/salvar';
import { CATALOGO_DE_CORPOS } from './catalogoDeCorpos';

/**
 * Montar personagem: que pecas existem, quais fecham entre si, e como se
 * escolhe uma combinacao.
 *
 * Sem three.js de proposito — e' a parte que tem regra, e regra tem teste. A
 * malha de verdade e' montada em `montarCorpo.ts`, a partir do que sai daqui.
 *
 * As pecas sao as do pack da Quaternius (`scripts/preparar-corpos.mjs`): cada
 * personagem do pack vem em cabeca, tronco, pernas e pes presos ao mesmo
 * esqueleto, e por isso a cabeca de um serve no tronco de outro. Serve DENTRO
 * da familia: homem e mulher tem os mesmos ossos com outras proporcoes, e uma
 * perna de homem num esqueleto de mulher sai deformada.
 */

export type Familia = 'masculino' | 'feminino';
export const FAMILIAS: readonly Familia[] = ['masculino', 'feminino'];

export type Peca = 'cabeca' | 'tronco' | 'pernas' | 'pes';
export const PECAS: readonly Peca[] = ['cabeca', 'tronco', 'pernas', 'pes'];

/** Uma peca no catalogo: a malha, a faixa de altura que ela cobre, e o material que se pinta. */
export interface ParteDoCatalogo {
  readonly malha: string;
  readonly y: readonly [number, number];
  readonly materiais: readonly string[];
  readonly principal: string | null;
}

export interface FonteDoCatalogo {
  readonly arquivo: string;
  readonly partes: Readonly<Partial<Record<Peca | 'acessorio', ParteDoCatalogo>>>;
}

interface FamiliaDoCatalogo {
  readonly base: string;
  readonly fontes: Readonly<Record<string, FonteDoCatalogo>>;
}

export const CATALOGO: Readonly<Record<Familia, FamiliaDoCatalogo>> = CATALOGO_DE_CORPOS;

/**
 * Como um corpo e' feito.
 *
 * Cada peca guarda DE QUE PERSONAGEM DO PACK ela vem (`'punk'`, `'beach'`...),
 * e nao um indice: a lista pode crescer quando o pack ganhar gente, e um save
 * antigo continua apontando pra mesma peca.
 *
 * Cor `null` e' "a que veio no modelo".
 */
export interface Visual {
  familia: Familia;
  cabeca: string;
  tronco: string;
  pernas: string;
  pes: string;
  /** De quem vem o acessorio (hoje, so' a mochila do aventureiro), ou nenhum. */
  acessorio: string | null;
  pele: number;
  cabelo: number | null;
  camisa: number | null;
  calca: number | null;
}

/** Os tons de pele, do mais claro pro mais escuro. */
export const PELES: readonly { nome: string; cor: number }[] = [
  { nome: 'CLARA', cor: 0xf1c7a1 },
  { nome: 'MEDIA', cor: 0xd8a47a },
  { nome: 'MORENA', cor: 0xc68a5c },
  { nome: 'PARDA', cor: 0xa66a43 },
  { nome: 'ESCURA', cor: 0x6e4428 },
  { nome: 'NEGRA', cor: 0x4a2c1c },
];

export const CABELOS: readonly { nome: string; cor: number }[] = [
  { nome: 'PRETO', cor: 0x1f1a17 },
  { nome: 'CASTANHO', cor: 0x5a3a22 },
  { nome: 'RUIVO', cor: 0xa8461f },
  { nome: 'LOIRO', cor: 0xd9b25c },
  { nome: 'GRISALHO', cor: 0xc9c6c0 },
  { nome: 'ROSA', cor: 0xe0588f },
  { nome: 'AZUL', cor: 0x3a6fd8 },
  { nome: 'VERDE', cor: 0x2f9e55 },
];

export const CORES_DE_ROUPA: readonly { nome: string; cor: number }[] = [
  { nome: 'BRANCO', cor: 0xeeeeea },
  { nome: 'PRETO', cor: 0x26272b },
  { nome: 'CINZA', cor: 0x7d8288 },
  { nome: 'AREIA', cor: 0xd9c08c },
  { nome: 'MARROM', cor: 0x6b4a2e },
  { nome: 'VERMELHO', cor: 0xc8312b },
  { nome: 'LARANJA', cor: 0xe2672f },
  { nome: 'CORAL', cor: 0xf07b62 },
  { nome: 'AMARELO', cor: 0xf2c230 },
  { nome: 'LIMAO', cor: 0x9ccc2e },
  { nome: 'VERDE', cor: 0x2f9e55 },
  { nome: 'AZUL', cor: COLORS.home },
  { nome: 'JEANS', cor: 0x3a4a5e },
  { nome: 'ROXO', cor: 0x7b3fb4 },
  { nome: 'ROSA', cor: 0xe0588f },
  { nome: 'VINHO', cor: 0x7a1f35 },
];

/** O nome de cada personagem do pack, como o criador mostra. */
const NOMES: Readonly<Record<Familia, Readonly<Record<string, string>>>> = {
  masculino: {
    adventurer: 'AVENTUREIRO', beach: 'PRAIA', casual_2: 'CASUAL', casual_hoodie: 'MOLETOM',
    farmer: 'FAZENDEIRO', king: 'REI', punk: 'PUNK', spacesuit: 'ASTRONAUTA', suit: 'TERNO',
    swat: 'TATICO', worker: 'OPERARIO',
  },
  feminino: {
    adventurer: 'AVENTUREIRA', casual: 'CASUAL', formal: 'FESTA', medieval: 'MEDIEVAL',
    punk: 'PUNK', scifi: 'FUTURISTA', soldier: 'SOLDADO', suit: 'EXECUTIVA', witch: 'BRUXA',
    worker: 'OPERARIA',
  },
};

export function nomeDaFonte(familia: Familia, id: string): string {
  return NOMES[familia][id] ?? id.toUpperCase();
}

/** As escolhas de uma peca, na ordem do catalogo. */
export function opcoesDe(familia: Familia, peca: Peca): string[] {
  const fontes = CATALOGO[familia].fontes;
  return Object.keys(fontes).filter((id) => fontes[id]!.partes[peca]);
}

/** De quem da' pra tirar acessorio, nesta familia. */
export function acessoriosDe(familia: Familia): string[] {
  const fontes = CATALOGO[familia].fontes;
  return Object.keys(fontes).filter((id) => fontes[id]!.partes.acessorio);
}

export function parteDe(familia: Familia, id: string, peca: Peca | 'acessorio'): ParteDoCatalogo | null {
  return CATALOGO[familia].fontes[id]?.partes[peca] ?? null;
}

/**
 * Quanto a calca pode comecar acima do cano do sapato.
 *
 * A malha da calca so' vai ate' onde o sapato da' conta: a calca que entra
 * numa bota alta termina no meio da canela, e com um tenis baixo sobra um vao
 * sem malha nenhuma — a perna parece cortada. Dois centimetros e' o que os
 * pares do proprio pack folgam.
 */
export const FOLGA_DO_CANO = 0.02;

/**
 * Esta combinacao fecha?
 *
 * Tres juntas, de baixo pra cima: a calca precisa descer ate' o sapato, o
 * tronco ate' a calca, e a cabeca ate' o tronco. Na pratica so' a primeira
 * separa alguma coisa — e' onde o pack varia de verdade (bota de 53 cm, tenis
 * de 18) —, mas as tres sao conferidas pra uma peca nova do pack nao entrar
 * abrindo buraco no pescoco.
 */
export function encaixa(v: Visual): boolean {
  const cabeca = parteDe(v.familia, v.cabeca, 'cabeca');
  const tronco = parteDe(v.familia, v.tronco, 'tronco');
  const pernas = parteDe(v.familia, v.pernas, 'pernas');
  const pes = parteDe(v.familia, v.pes, 'pes');
  if (!cabeca || !tronco || !pernas || !pes) return false;
  return pernas.y[0] <= pes.y[1] + FOLGA_DO_CANO
    && tronco.y[0] <= pernas.y[1] + FOLGA_DO_CANO
    && cabeca.y[0] <= tronco.y[1] + FOLGA_DO_CANO;
}

/**
 * O jogador trocou uma peca e a combinacao abriu: conserta a OUTRA.
 *
 * A peca que ele escolheu fica — foi de proposito. A que nao fecha com ela
 * vira a do mesmo personagem do pack, que fecha por construcao (o par que veio
 * junto). So' se nem essa servir e' que entra a primeira da lista que serve.
 */
export function ajustar(v: Visual, mudou: Peca): Visual {
  if (encaixa(v)) return v;
  const fonte = v[mudou];
  for (const outra of PECAS) {
    if (outra === mudou) continue;
    const tentativa = { ...v, [outra]: fonte };
    if (parteDe(v.familia, fonte, outra) && encaixa(tentativa)) return tentativa;
  }
  for (const outra of PECAS) {
    if (outra === mudou) continue;
    for (const id of opcoesDe(v.familia, outra)) {
      const tentativa = { ...v, [outra]: id };
      if (encaixa(tentativa)) return tentativa;
    }
  }
  return { ...visualDaFonte(v.familia, fonte), pele: v.pele, cabelo: v.cabelo, camisa: v.camisa, calca: v.calca };
}

/** Um personagem do pack inteiro, como ele veio. */
export function visualDaFonte(familia: Familia, id: string): Visual {
  return {
    familia, cabeca: id, tronco: id, pernas: id, pes: id,
    acessorio: parteDe(familia, id, 'acessorio') ? id : null,
    pele: PELES[1]!.cor, cabelo: null, camisa: null, calca: null,
  };
}

/** Quem voce e' antes de mexer no criador: o operario do pack, de colete do time, como sempre foi. */
export const VISUAL_PADRAO: Readonly<Visual> = { ...visualDaFonte('masculino', 'worker'), camisa: COLORS.home };

/** Troca de familia: as pecas vao pras de mesmo nome, se houver, ou pra base. */
export function trocarFamilia(v: Visual, familia: Familia): Visual {
  if (v.familia === familia) return v;
  const base = CATALOGO[familia].base;
  const mesma = (peca: Peca): string => (parteDe(familia, v[peca], peca) ? v[peca] : base);
  const novo: Visual = {
    ...v, familia,
    cabeca: mesma('cabeca'), tronco: mesma('tronco'), pernas: mesma('pernas'), pes: mesma('pes'),
    acessorio: v.acessorio && parteDe(familia, v.acessorio, 'acessorio') ? v.acessorio : null,
  };
  return encaixa(novo) ? novo : ajustar(novo, 'tronco');
}

/** Uma chave por combinacao: o retrato pronto e' guardado por ela. */
export function chaveDoVisual(v: Visual): string {
  return [v.familia, v.cabeca, v.tronco, v.pernas, v.pes, v.acessorio ?? '-',
    v.pele, v.cabelo ?? '-', v.camisa ?? '-', v.calca ?? '-'].join('|');
}

const ehCor = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 0xffffff;

/**
 * Le um visual de fora (o save), ou devolve null se nao der pra confiar.
 *
 * Peca que nao existe mais — o pack mudou, ou o save foi editado — derruba o
 * visual inteiro pro padrao, e nao so' a peca: meia combinacao velha pode nem
 * fechar.
 */
export function lerVisual(x: unknown): Visual | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.familia !== 'masculino' && o.familia !== 'feminino') return null;
  const familia = o.familia;
  for (const peca of PECAS) {
    if (typeof o[peca] !== 'string' || !parteDe(familia, o[peca], peca)) return null;
  }
  const acessorio = o.acessorio === null ? null
    : typeof o.acessorio === 'string' && parteDe(familia, o.acessorio, 'acessorio') ? o.acessorio : undefined;
  if (acessorio === undefined || !ehCor(o.pele)) return null;
  const corOuNada = (c: unknown): number | null | undefined => (c === null ? null : ehCor(c) ? c : undefined);
  const cabelo = corOuNada(o.cabelo);
  const camisa = corOuNada(o.camisa);
  const calca = corOuNada(o.calca);
  if (cabelo === undefined || camisa === undefined || calca === undefined) return null;
  const v: Visual = {
    familia, cabeca: o.cabeca as string, tronco: o.tronco as string, pernas: o.pernas as string,
    pes: o.pes as string, acessorio, pele: o.pele, cabelo, camisa, calca,
  };
  return encaixa(v) ? v : null;
}

/**
 * Um corpo qualquer, que fecha: a CPU sem nome.
 *
 * `sorte` e' um gerador de 0 a 1 — o `Math.random` no jogo, um gerador com
 * semente no teste. Metade das vezes o corpo sai inteiro de um personagem do
 * pack (que e' o que parece gente); na outra metade, misturado.
 */
export function visualSorteado(sorte: () => number): Visual {
  const um = <T>(lista: readonly T[]): T => lista[Math.min(lista.length - 1, Math.floor(sorte() * lista.length))]!;
  const familia = um(FAMILIAS);
  const fontes = Object.keys(CATALOGO[familia].fontes);
  let v = visualDaFonte(familia, um(fontes));
  if (sorte() < 0.5) {
    for (const peca of PECAS) v = ajustar({ ...v, [peca]: um(opcoesDe(familia, peca)) }, peca);
  }
  v.acessorio = v.acessorio && sorte() < 0.5 ? v.acessorio : null;
  v.pele = um(PELES).cor;
  v.cabelo = sorte() < 0.4 ? um(CABELOS.slice(0, 5)).cor : null;
  v.camisa = sorte() < 0.5 ? um(CORES_DE_ROUPA).cor : null;
  v.calca = sorte() < 0.25 ? um(CORES_DE_ROUPA).cor : null;
  return v;
}

// ------------------------------------------------------------- o seu, salvo

const CHAVE_DO_JOGADOR = 'volei3d.jogador';

/** O corpo que voce montou, ou o padrao. Nunca joga excecao, como o save do circuito. */
export function carregarMeuVisual(armazem: Armazem | null): Visual {
  if (!armazem) return { ...VISUAL_PADRAO };
  try {
    const texto = armazem.getItem(CHAVE_DO_JOGADOR);
    return (texto && lerVisual(JSON.parse(texto))) || { ...VISUAL_PADRAO };
  } catch {
    return { ...VISUAL_PADRAO };
  }
}

export function guardarMeuVisual(armazem: Armazem | null, v: Visual): boolean {
  if (!armazem) return false;
  try {
    armazem.setItem(CHAVE_DO_JOGADOR, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
