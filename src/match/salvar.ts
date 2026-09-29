import { ETAPAS, VOCE_ID, novaCarreira, type Carreira, type Retrospecto, type Torneio } from './Circuito';
import { personagemPorId } from './personagens';

/**
 * O progresso do circuito, guardado no navegador.
 *
 * Tres coisas podem dar errado aqui, e nenhuma pode derrubar o jogo:
 *
 *   o ARMAZEM some    aba anonima, cookie bloqueado, cota cheia — o
 *                     `localStorage` existe e JOGA excecao ao ser tocado.
 *   o DADO apodrece   JSON cortado, editado a mao, de uma versao antiga.
 *   o FORMATO cresce  um campo novo na carreira, e um save de antes dele.
 *
 * Nos tres casos o jogo abre. No primeiro, sem salvar; no segundo, do zero; no
 * terceiro, completando o que falta com o padrao — perder o progresso de
 * alguem porque o codigo ganhou um campo seria o pior jeito de atualizar.
 *
 * O armazem entra por parametro, e nao como `window.localStorage` direto, pra
 * ter teste: no Node nao ha' `localStorage`, e e' justamente o caso de falha
 * que mais precisa ser testado.
 */

/** O minimo do `Storage` que isto usa. O `localStorage` do navegador serve. */
export interface Armazem {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export interface Progresso {
  versao: 1;
  carreira: Carreira;
  /** O torneio em andamento, ou null se nao ha' nenhum. */
  torneio: Torneio | null;
}

const CHAVE = 'volei3d.circuito';

export function progressoNovo(): Progresso {
  return { versao: 1, carreira: novaCarreira(), torneio: null };
}

/**
 * Le o progresso. NUNCA joga excecao: o pior caso e' comecar do zero.
 */
export function carregar(armazem: Armazem | null): Progresso {
  if (!armazem) return progressoNovo();

  let texto: string | null;
  try {
    texto = armazem.getItem(CHAVE);
  } catch {
    return progressoNovo();
  }
  if (!texto) return progressoNovo();

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return progressoNovo();
  }

  return sanear(bruto);
}

/** Grava. Devolve se deu certo, pra quem chama poder avisar — e nunca joga. */
export function guardar(armazem: Armazem | null, p: Progresso): boolean {
  if (!armazem) return false;
  try {
    armazem.setItem(CHAVE, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * Transforma o que veio do disco num progresso valido.
 *
 * A carreira e' COMPLETADA com o padrao, campo por campo: um save de antes de
 * um campo existir continua valendo, com o campo novo zerado. O torneio e'
 * tudo ou nada — uma chave pela metade e' pior do que chave nenhuma, porque o
 * jogo tentaria continuar um torneio que nao fecha.
 */
function sanear(bruto: unknown): Progresso {
  if (!objeto(bruto) || bruto.versao !== 1) return progressoNovo();

  const padrao = novaCarreira();
  const salva = objeto(bruto.carreira) ? bruto.carreira : {};

  const numero = (k: keyof Carreira): number => {
    const v = salva[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : (padrao[k] as number);
  };

  const titulosSalvos = objeto(salva.titulos) ? salva.titulos : {};
  const titulos = { ...padrao.titulos };
  for (const e of ETAPAS) {
    const v = titulosSalvos[e];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) titulos[e] = v;
  }

  // Etapa liberada tem que ser etapa que existe. E o municipal esta' sempre
  // aberto: um save que perdeu ele deixaria o circuito sem porta de entrada.
  const liberadas = Array.isArray(salva.liberadas)
    ? ETAPAS.filter((e) => (salva.liberadas as unknown[]).includes(e))
    : [];
  if (!liberadas.includes('municipal')) liberadas.unshift('municipal');

  const carreira: Carreira = {
    ranking: numero('ranking'),
    titulos,
    vitorias: numero('vitorias'),
    derrotas: numero('derrotas'),
    pontosFeitos: numero('pontosFeitos'),
    pontosSofridos: numero('pontosSofridos'),
    sequencia: numero('sequencia'),
    melhorSequencia: numero('melhorSequencia'),
    liberadas,
    confrontos: confrontosValidos(salva.confrontos),
  };

  const torneio = torneioValido(bruto.torneio) ? (bruto.torneio as Torneio) : null;
  return { versao: 1, carreira, torneio };
}

/**
 * O retrospecto contra cada personagem, so' com o que e' numero de verdade.
 *
 * Id que o elenco nao conhece mais FICA: nao atrapalha nada, e se o
 * personagem voltar, a historia volta com ele.
 */
function confrontosValidos(x: unknown): Record<string, Retrospecto> {
  const saida: Record<string, Retrospecto> = {};
  if (!objeto(x)) return saida;
  const contagem = (n: unknown): number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  for (const [id, r] of Object.entries(x)) {
    if (objeto(r)) saida[id] = { v: contagem(r.v), d: contagem(r.d) };
  }
  return saida;
}

function objeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function torneioValido(t: unknown): boolean {
  if (!objeto(t)) return false;
  if (!ETAPAS.includes(t.etapa as never)) return false;
  if (!Array.isArray(t.rodadas) || t.rodadas.length === 0) return false;
  if (typeof t.rodada !== 'number' || t.rodada < 0 || t.rodada >= t.rodadas.length) return false;
  if (typeof t.sorte !== 'number') return false;
  // Toda rodada tem que ter confrontos com dois jogadores de verdade.
  return t.rodadas.every((r: unknown) => Array.isArray(r) && r.length > 0 && r.every((c: unknown) =>
    objeto(c) && jogadorValido(c.a) && jogadorValido(c.b)));
}

/**
 * Voce, ou um personagem que o elenco CONHECE.
 *
 * E' o que descarta os torneios de antes dos personagens (a CPU ali era
 * "cpu-municipal-3", sem ficha nenhuma), e os de um personagem apagado do
 * elenco depois do save. Continuar uma chave com um adversario sem ficha seria
 * jogar contra ninguem — melhor perder o torneio em andamento que isso. A
 * carreira fica.
 */
function jogadorValido(j: unknown): boolean {
  if (!objeto(j) || typeof j.id !== 'string' || typeof j.nome !== 'string') return false;
  return j.id === VOCE_ID || personagemPorId(j.id) !== null;
}

/**
 * O `localStorage` do navegador, se ele deixar ser tocado.
 *
 * So' LER a propriedade ja' pode jogar excecao em alguns navegadores com
 * cookie bloqueado — por isso o `try` em volta do acesso, e nao so' do uso.
 */
export function armazemDoNavegador(): Armazem | null {
  try {
    const a = window.localStorage;
    const teste = '__volei3d_teste__';
    a.setItem(teste, '1');
    a.removeItem(teste);
    return a;
  } catch {
    return null;
  }
}
