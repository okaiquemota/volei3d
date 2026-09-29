import { MATCH } from '../config';

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
  /** Forca do adversario mais fraco e do mais forte da chave. Ver `habilidadeDe`. */
  forcaMin: number;
  forcaMax: number;
  /** Pontos de ranking por partida vencida, e o bonus de levantar a taca. */
  porVitoria: number;
  porTitulo: number;
}

/**
 * A escada.
 *
 * As faixas de forca SE SOBREPOEM de proposito: o favorito do municipal (0,40)
 * e' mais forte que o azarao do estadual (0,35). Sem sobreposicao, subir de
 * etapa seria um degrau — o primeiro jogo do estadual ficaria sempre mais
 * dificil que a final do municipal, e ganhar a final nao ensinaria nada sobre
 * o que vem depois.
 *
 * O mundial termina em 1,0, que e' o `dificil` inteiro. A final dele e' o
 * adversario mais forte que este jogo sabe fazer.
 */
export const DEFINICAO: Readonly<Record<Etapa, DefinicaoDaEtapa>> = {
  municipal: { nome: 'MUNICIPAL', local: 'areia', onde: 'NA PRAIA', forcaMin: 0.05, forcaMax: 0.40, porVitoria: 10, porTitulo: 30 },
  estadual: { nome: 'ESTADUAL', local: 'quadra', onde: 'NO GINASIO', forcaMin: 0.35, forcaMax: 0.70, porVitoria: 25, porTitulo: 80 },
  mundial: { nome: 'MUNDIAL', local: 'estadio', onde: 'NO ESTADIO', forcaMin: 0.65, forcaMax: 1.00, porVitoria: 60, porTitulo: 200 },
};

/**
 * Os adversarios. Inventados, e com apelido de praia.
 *
 * Nome de atleta de verdade aqui seria colocar gente real perdendo pra um
 * boneco de capacete. Vinte e quatro nomes pra sete vagas por torneio: da'
 * pra jogar os tres sem repetir quase ninguem.
 */
const NOMES = [
  'TATU', 'BIA REDE', 'NANDO SAQUE', 'KIKO MANCHETE', 'LU BLOQUEIO', 'DUDA SOL',
  'TITO ONDA', 'RAFA COCO', 'NINA PEIXINHO', 'BETO MARE', 'JUCA DUNA', 'LIA CONCHA',
  'DUDU FAROL', 'PEPE SALINA', 'MARI CORAL', 'GABI SIRI', 'ZECA JANGADA', 'TUCA MAROLA',
  'BRUNA BOIA', 'NICO BRISA', 'LECA AREIA', 'VINI RECIFE', 'DANI CAJU', 'GUTO VENTO',
] as const;

export const VOCE_ID = 'voce';

export interface Jogador {
  id: string;
  nome: string;
  /** De 0 a 1. Sem sentido pra voce: sua forca e' a sua mao. */
  forca: number;
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
 * Voce e' o cabeca de chave 1, e os sete da CPU entram por forca, do 2 (o mais
 * forte) ao 8 (o mais fraco). O cruzamento e' o de chave de verdade:
 *
 *   1x8  4x5  |  3x6  2x7
 *
 * Nao e' so' tradicao, e' a RAMPA: voce estreia contra o mais fraco, pega o
 * vencedor do meio na semi, e na final — se o favorito fizer o papel dele —
 * encontra o mais forte do torneio. A dificuldade sobe sozinha, sem nenhuma
 * regra especial pra isso.
 */
export function novoTorneio(etapa: Etapa, semente: number): Torneio {
  const def = DEFINICAO[etapa];
  const t: Torneio = { etapa, rodadas: [], rodada: 0, eliminado: false, campeao: false, sorte: semente >>> 0 };

  // Sete nomes do pool, embaralhados pela sorte do proprio torneio.
  const pool = [...NOMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(sortear(t) * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  const voce: Jogador = { id: VOCE_ID, nome: 'VOCE', forca: 0 };
  // Cabeca 2 e' o mais forte (forcaMax), cabeca 8 o mais fraco (forcaMin).
  const cpu: Jogador[] = pool.slice(0, 7).map((nome, i) => ({
    id: `cpu-${etapa}-${i}`,
    nome,
    forca: def.forcaMax - (def.forcaMax - def.forcaMin) * (i / 6),
  }));
  const cabeca = [voce, ...cpu];   // cabeca[0] = 1, cabeca[7] = 8

  const par = (x: number, y: number): Confronto =>
    ({ a: cabeca[x - 1]!, b: cabeca[y - 1]!, vencedor: null, placar: null });

  t.rodadas.push([par(1, 8), par(4, 5), par(3, 6), par(2, 7)]);
  return t;
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
 * A chance e' logistica na diferenca de forca, como num rating Elo: iguais tem
 * 50%, e 0,3 de diferenca da' uns 90% pro mais forte. Tem que haver ZEBRA —
 * uma chave onde o favorito sempre passa e' uma chave previsivel desde o
 * sorteio — mas nao a ponto de a final ser loteria.
 */
function simular(t: Torneio, c: Confronto): void {
  const chanceDeA = 1 / (1 + Math.pow(10, (c.b.forca - c.a.forca) / 0.3));
  const aGanha = sortear(t) < chanceDeA;
  const vence = aGanha ? c.a : c.b;
  const perde = aGanha ? c.b : c.a;

  // O placar e' so' pra chave ter cara de chave: quanto maior a diferenca,
  // mais largo.
  const folga = Math.abs(vence.forca - perde.forca);
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
