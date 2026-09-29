import { MATCH } from '../config';
import { elencoDaEtapa, geral, nivel, personagemPorId } from './personagens';

/**
 * O CIRCUITO: tres torneios em escada, e a carreira de quem joga eles.
 *
 * E' logica pura sobre dados simples — nada de classe, nada de three, nada de
 * DOM. Duas razoes, e a segunda e' a que manda:
 *
 * Tem teste. Chave de torneio erra calada: um adversario repetido, uma rodada
 * que nao avanca, um campeao que nao desbloqueia a etapa seguinte. Nenhum
 * desses quebra o jogo; todos deixam ele sem sentido.
 *
 * E todo estado aqui e' OBJETO PLANO, que vai e volta de JSON sem perder nada.
 * Um torneio pela metade tem que sobreviver a fechar a aba — e o que torna
 * isso trivial e' nunca ter guardado nada que o JSON nao saiba escrever.
 */

export type Etapa = 'municipal' | 'estadual' | 'mundial';
export const ETAPAS: readonly Etapa[] = ['municipal', 'estadual', 'mundial'];

/**
 * Onde se joga. Os mesmos valores do `Cenario` do menu, escritos de novo aqui
 * de proposito: esta e' logica pura, e importar da camada de tela pra ca'
 * inverteria a dependencia.
 */
export type Local = 'areia' | 'quadra' | 'estadio';

interface DefinicaoDaEtapa {
  nome: string;
  /**
   * O palco cresce com o que esta' em jogo: o municipal e' na praia, o
   * estadual no ginasio, o mundial no estadio com torcida. E' a unica
   * recompensa visual de subir de etapa — e reaproveita tres cenarios que ja'
   * existiam, em vez de pedir um quarto.
   */
  local: Local;
  onde: string;
  /** Pontos de ranking por partida vencida, e o bonus de levantar a taca. */
  porVitoria: number;
  porTitulo: number;
}

/**
 * A escada.
 *
 * Quem joga em cada etapa, e o quanto cada um joga, nao mora aqui: e' o
 * ELENCO (`personagens.ts`). Aqui fica so' o que e' do torneio — onde, e
 * quanto vale.
 */
export const DEFINICAO: Readonly<Record<Etapa, DefinicaoDaEtapa>> = {
  municipal: { nome: 'MUNICIPAL', local: 'areia', onde: 'NA PRAIA', porVitoria: 10, porTitulo: 30 },
  estadual: { nome: 'ESTADUAL', local: 'quadra', onde: 'NO GINASIO', porVitoria: 25, porTitulo: 80 },
  mundial: { nome: 'MUNDIAL', local: 'estadio', onde: 'NO ESTADIO', porVitoria: 60, porTitulo: 200 },
};

/** Vagas de CPU numa chave de oito. O elenco de cada etapa precisa de tantas. */
export const VAGAS_DA_CPU = 7;

export const VOCE_ID = 'voce';

/**
 * Um lugar na chave.
 *
 * Da CPU, o `id` e' o do PERSONAGEM, e a ficha dele nao e' copiada pra ca': e'
 * lida do elenco na hora. Assim um ajuste de nota vale ate' pro torneio que ja'
 * estava salvo no meio — e o save continua pequeno.
 */
export interface Jogador {
  id: string;
  nome: string;
}

export interface Confronto {
  a: Jogador;
  b: Jogador;
  vencedor: string | null;
  /** Placar de quem venceu primeiro. So' pra mostrar na chave. */
  placar: [number, number] | null;
}

export interface Torneio {
  etapa: Etapa;
  /** Quartas (4 jogos), semi (2), final (1). */
  rodadas: Confronto[][];
  rodada: number;
  eliminado: boolean;
  campeao: boolean;
  /** Estado do sorteio, e nao a semente inicial: ver `sortear`. */
  sorte: number;
}

export interface Carreira {
  ranking: number;
  titulos: Record<Etapa, number>;
  vitorias: number;
  derrotas: number;
  pontosFeitos: number;
  pontosSofridos: number;
  sequencia: number;
  melhorSequencia: number;
  liberadas: Etapa[];
  /**
   * Voce contra cada personagem, pelo id: vitorias e derrotas.
   *
   * E' o que faz um nome virar rival. Perder pra BIA REDE na semifinal e
   * reencontrar ela no torneio seguinte com "1 DERROTA" na ficha e' outra
   * partida — a mesma IA, com historia.
   */
  confrontos: Record<string, Retrospecto>;
}

export interface Retrospecto {
  v: number;
  d: number;
}

export const NOMES_DAS_RODADAS = ['QUARTAS DE FINAL', 'SEMIFINAL', 'FINAL'] as const;

export function novaCarreira(): Carreira {
  return {
    ranking: 0,
    titulos: { municipal: 0, estadual: 0, mundial: 0 },
    vitorias: 0,
    derrotas: 0,
    pontosFeitos: 0,
    pontosSofridos: 0,
    sequencia: 0,
    melhorSequencia: 0,
    liberadas: ['municipal'],
    confrontos: {},
  };
}

/**
 * O sorteio, com o ESTADO dentro do torneio.
 *
 * Guardar so' a semente inicial nao bastaria: o torneio e' salvo no meio, e ao
 * voltar o sorteio tem que continuar de onde parou, e nao recomecar — senao
 * recarregar a pagina mudaria quem ganhou os jogos que voce nao jogou.
 */
function sortear(t: { sorte: number }): number {
  t.sorte = (Math.imul(t.sorte, 1664525) + 1013904223) >>> 0;
  return t.sorte / 4294967296;
}

export function podeJogar(c: Carreira, etapa: Etapa): boolean {
  return c.liberadas.includes(etapa);
}

/**
 * Monta a chave de oito.
 *
 * Sete personagens do elenco da etapa, sorteados pela sorte do proprio
 * torneio, e ordenados pelo GERAL: voce e' o cabeca de chave 1, e os sete
 * entram do 2 (o mais forte) ao 8 (o mais fraco). O cruzamento e' o de chave de
 * verdade:
 *
 *   1x8  4x5  |  3x6  2x7
 *
 * Nao e' so' tradicao, e' a RAMPA: voce estreia contra o mais fraco, pega o
 * vencedor do meio na semi, e na final — se o favorito fizer o papel dele —
 * encontra o mais forte do torneio. A dificuldade sobe sozinha, sem nenhuma
 * regra especial pra isso.
 */
export function novoTorneio(etapa: Etapa, semente: number): Torneio {
  const t: Torneio = { etapa, rodadas: [], rodada: 0, eliminado: false, campeao: false, sorte: semente >>> 0 };

  // Embaralha o elenco da etapa pela sorte do torneio e pega sete.
  const pool = elencoDaEtapa(etapa);
  if (pool.length < VAGAS_DA_CPU) {
    throw new Error(`o elenco do ${etapa} tem ${pool.length} personagens, e a chave precisa de ${VAGAS_DA_CPU}`);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(sortear(t) * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  // Cabeca 2 e' o mais forte, cabeca 8 o mais fraco. O desempate pelo id so'
  // existe pra ordem nao depender do embaralhamento quando dois empatam.
  const escolhidos = pool.slice(0, VAGAS_DA_CPU)
    .sort((a, b) => geral(b) - geral(a) || a.id.localeCompare(b.id));

  const voce: Jogador = { id: VOCE_ID, nome: 'VOCE' };
  const cabeca: Jogador[] = [voce, ...escolhidos.map((p) => ({ id: p.id, nome: p.nome }))];

  const par = (x: number, y: number): Confronto =>
    ({ a: cabeca[x - 1]!, b: cabeca[y - 1]!, vencedor: null, placar: null });

  t.rodadas.push([par(1, 8), par(4, 5), par(3, 6), par(2, 7)]);
  return t;
}

/**
 * O nivel de um jogador da chave, de 0 a 1, lido do elenco.
 *
 * Um id que o elenco nao conhece (personagem apagado depois do save) conta
 * como mediano, e nao derruba a simulacao — mas o save ja' descarta torneio
 * assim ao carregar, entao isto e' so' a rede de baixo.
 */
function nivelDe(j: Jogador): number {
  const p = personagemPorId(j.id);
  return p ? nivel(p) : 0.5;
}

/** Contra quem voce joga agora. Null se o torneio acabou pra voce. */
export function adversarioAtual(t: Torneio): Jogador | null {
  if (t.eliminado || t.campeao) return null;
  const meu = t.rodadas[t.rodada]?.find((c) => c.a.id === VOCE_ID || c.b.id === VOCE_ID);
  if (!meu) return null;
  return meu.a.id === VOCE_ID ? meu.b : meu.a;
}

/**
 * Um jogo entre dois da CPU, decidido sem jogar.
 *
 * A chance e' logistica na diferenca de nivel (o GERAL levado a 0-1), como num
 * rating Elo: iguais tem 50%, e 0,3 de diferenca — 2,7 pontos de GERAL — da'
 * uns 90% pro mais forte. Tem que haver ZEBRA —
 * uma chave onde o favorito sempre passa e' uma chave previsivel desde o
 * sorteio — mas nao a ponto de a final ser loteria.
 */
function simular(t: Torneio, c: Confronto): void {
  const nivelA = nivelDe(c.a);
  const nivelB = nivelDe(c.b);
  const chanceDeA = 1 / (1 + Math.pow(10, (nivelB - nivelA) / 0.3));
  const aGanha = sortear(t) < chanceDeA;
  const vence = aGanha ? c.a : c.b;

  // O placar e' so' pra chave ter cara de chave: quanto maior a diferenca,
  // mais largo.
  const folga = Math.abs(nivelA - nivelB);
  const dele = Math.round(Math.min(MATCH.pointsToWin - 2, Math.max(3, 12 - folga * 14 + sortear(t) * 3)));
  c.vencedor = vence.id;
  c.placar = [MATCH.pointsToWin, dele];
}

/** O que aconteceu com voce, pra tela de resultado contar. */
export interface Desfecho {
  tipo: 'avancou' | 'eliminado' | 'campeao';
  /** Pontos de ranking ganhos NESTA partida, com o bonus de titulo se houver. */
  pontosGanhos: number;
  /** A etapa que passou a ficar aberta, se esta partida abriu uma. */
  liberou: Etapa | null;
}

/**
 * Voce acabou de jogar. Registra, simula o resto da rodada e anda a chave.
 *
 * Devolve COPIAS novas de torneio e carreira, em vez de mexer nas que
 * entraram. Quem chama decide se guarda — e um erro no meio nao deixa o
 * progresso salvo pela metade.
 */
export function registrarPartida(
  torneioAntes: Torneio,
  carreiraAntes: Carreira,
  voceVenceu: boolean,
  placar: { voce: number; ele: number },
): { torneio: Torneio; carreira: Carreira; desfecho: Desfecho } {
  const t: Torneio = structuredClone(torneioAntes);
  const c: Carreira = structuredClone(carreiraAntes);
  const def = DEFINICAO[t.etapa];

  const rodada = t.rodadas[t.rodada];
  const meu = rodada?.find((x) => x.a.id === VOCE_ID || x.b.id === VOCE_ID);
  if (!rodada || !meu || t.eliminado || t.campeao) {
    throw new Error('registrarPartida sem partida sua pra registrar');
  }

  const eleId = meu.a.id === VOCE_ID ? meu.b.id : meu.a.id;
  meu.vencedor = voceVenceu ? VOCE_ID : eleId;
  meu.placar = voceVenceu ? [placar.voce, placar.ele] : [placar.ele, placar.voce];

  // A carreira anda com o que aconteceu em quadra, venca ou perca.
  c.pontosFeitos += placar.voce;
  c.pontosSofridos += placar.ele;
  const contra = c.confrontos[eleId] ?? { v: 0, d: 0 };
  c.confrontos[eleId] = voceVenceu ? { v: contra.v + 1, d: contra.d } : { v: contra.v, d: contra.d + 1 };

  // Os outros jogos da rodada.
  for (const conf of rodada) if (conf !== meu) simular(t, conf);

  const desfecho: Desfecho = { tipo: 'avancou', pontosGanhos: 0, liberou: null };

  if (!voceVenceu) {
    c.derrotas++;
    c.sequencia = 0;
    t.eliminado = true;
    desfecho.tipo = 'eliminado';
    return { torneio: t, carreira: c, desfecho };
  }

  c.vitorias++;
  c.sequencia++;
  c.melhorSequencia = Math.max(c.melhorSequencia, c.sequencia);
  c.ranking += def.porVitoria;
  desfecho.pontosGanhos += def.porVitoria;

  const foiAFinal = t.rodada === NOMES_DAS_RODADAS.length - 1;
  if (foiAFinal) {
    t.campeao = true;
    c.titulos[t.etapa]++;
    c.ranking += def.porTitulo;
    desfecho.pontosGanhos += def.porTitulo;
    desfecho.tipo = 'campeao';

    // O titulo abre a etapa seguinte — so' na primeira vez, claro.
    const proxima = ETAPAS[ETAPAS.indexOf(t.etapa) + 1];
    if (proxima && !c.liberadas.includes(proxima)) {
      c.liberadas.push(proxima);
      desfecho.liberou = proxima;
    }
    return { torneio: t, carreira: c, desfecho };
  }

  // Monta a proxima rodada com os vencedores, na ordem da chave.
  const vencedores = rodada.map((conf) => (conf.a.id === conf.vencedor ? conf.a : conf.b));
  const seguinte: Confronto[] = [];
  for (let i = 0; i < vencedores.length; i += 2) {
    seguinte.push({ a: vencedores[i]!, b: vencedores[i + 1]!, vencedor: null, placar: null });
  }
  t.rodadas.push(seguinte);
  t.rodada++;

  return { torneio: t, carreira: c, desfecho };
}
