import type { Etapa } from './Circuito';
import { visualDaFonte, CABELOS, type Familia, type Visual } from '../players/corpos';

/**
 * O ELENCO: os adversarios do circuito, cada um com nome, cara e ficha.
 *
 * ======================================================================
 *  COMO CRIAR OU AFINAR UM PERSONAGEM
 * ======================================================================
 *
 * E' so' mexer na lista `ELENCO`, la' embaixo. Nada mais precisa mudar: o
 * circuito sorteia dali, a ficha na tela le dali, e a IA joga com o que estiver
 * escrito. Os testes (`npm test`) conferem o que costuma escapar — nota fora
 * de 1 a 10, id repetido, etapa com menos de sete nomes.
 *
 * Cada atributo e' uma nota de 1 a 10. O 5 e' a CPU no NORMAL; o 1, a CPU no
 * FACIL; o 10, a CPU no DIFICIL. Entao "forca 5" quer dizer "bate tao forte
 * quanto a CPU normal", e um personagem com 5 em tudo e' a CPU normal com nome.
 *
 *   FORCA       velocidade da cortada e do ataque, e o gosto por cortar
 *   SAQUE       o saque: 1 e' balao alto, 10 e' o arco mais raso que passa
 *   VELOCIDADE  corrida: 5,6 m/s na nota 1, 6,5 (a sua) na 5, 7,4 na 10
 *   PULO        altura do salto: 0,62 m na 1, 0,85 (o seu) na 5, 1,08 na 10
 *   REFLEXO     quanto demora pra reagir a' sua batida, e pra sacar
 *   DEFESA      quanto a cortada que chega pesa no toque dele
 *   PRECISAO    o erro de mira: 1 espalha 2 m, 10 espalha meio metro
 *   LEITURA     onde ele ACHA que a bola cai, se larga bola fora, e se arma
 *               a jogada em dois toques em vez de devolver de primeira
 *
 * O que cada nota vira, em numero, esta' em `habilidade.ts` (a tabela
 * `FONTE`) e em `config.ts` (`AI_SKILL` e `ATRIBUTO`).
 *
 * O GERAL e' a media das oito notas. E' ele que decide o cabeca de chave e
 * quem ganha os jogos simulados — nao e' uma nota a mais pra escrever.
 *
 * A `etapa` diz em que torneio o personagem joga. Cada etapa precisa de pelo
 * menos SETE (sao sete vagas de CPU numa chave de oito); com mais que isso,
 * sobra gente de fora a cada torneio, e o sorteio varia.
 */

export type Atributo =
  | 'forca' | 'saque' | 'velocidade' | 'pulo'
  | 'reflexo' | 'defesa' | 'precisao' | 'leitura';

/** Na ordem em que aparecem na ficha: primeiro o corpo, depois a cabeca. */
export const ATRIBUTOS: readonly Atributo[] = [
  'forca', 'saque', 'velocidade', 'pulo', 'reflexo', 'defesa', 'precisao', 'leitura',
];

export const NOME_DO_ATRIBUTO: Readonly<Record<Atributo, string>> = {
  forca: 'FORCA',
  saque: 'SAQUE',
  velocidade: 'VELOCIDADE',
  pulo: 'PULO',
  reflexo: 'REFLEXO',
  defesa: 'DEFESA',
  precisao: 'PRECISAO',
  leitura: 'LEITURA',
};

/** O que a nota faz, numa linha. E' o que a ficha mostra ao passar o mouse. */
export const DESCRICAO_DO_ATRIBUTO: Readonly<Record<Atributo, string>> = {
  forca: 'Velocidade da cortada, e o quanto ele procura cortar',
  saque: 'Do balao alto (1) ao arco mais raso que passa a rede (10)',
  velocidade: 'Corrida: 5,6 m/s na nota 1, 6,5 (a sua) na 5, 7,4 na 10',
  pulo: 'Altura do salto: 0,62 m na nota 1, 0,85 (o seu) na 5, 1,08 na 10',
  reflexo: 'Quanto demora pra reagir a sua batida, e pra sacar',
  defesa: 'Quanto a cortada que chega estraga o toque dele',
  precisao: 'Erro de mira: 2 m na nota 1, meio metro na 10',
  leitura: 'Onde ele acha que a bola cai, se larga bola fora, e se arma a jogada',
};

export type Notas = Record<Atributo, number>;

export interface Personagem {
  /** Unico, e nunca muda: o save guarda a chave pelo id, nao pelo nome. */
  id: string;
  nome: string;
  etapa: Etapa;
  /** Uma linha de quem ele e'. Aparece na ficha. */
  frase: string;
  notas: Notas;
  /**
   * A cor DELE: a da carta, a da ficha e, quase sempre, a da camisa. E' o que
   * faz o personagem ser reconhecivel de longe. NUNCA azul — azul e' o seu time.
   */
  cor: number;
  /** O corpo, montado com as pecas do pack (`players/corpos.ts`). */
  visual: Visual;
}

// Tons de pele e cores de roupa, pra lista abaixo ficar legivel.
const PELE = { clara: 0xf1c7a1, morena: 0xc68a5c, parda: 0xa66a43, escura: 0x6e4428, negra: 0x4a2c1c } as const;
const COR = {
  laranja: 0xe2672f, vermelho: 0xc8312b, vinho: 0x7a1f35, rosa: 0xe0588f, roxo: 0x7b3fb4,
  verde: 0x2f9e55, limao: 0x9ccc2e, amarelo: 0xf2c230, dourado: 0xc9a13a, branco: 0xeeeeea,
  preto: 0x26272b, cinza: 0x7d8288, areia: 0xd9c08c, marrom: 0x6b4a2e, coral: 0xf07b62,
  jeans: 0x3a4a5e,
} as const;

/** Monta as notas na ordem da ficha, pra cada linha do elenco caber numa linha. */
function n(
  forca: number, saque: number, velocidade: number, pulo: number,
  reflexo: number, defesa: number, precisao: number, leitura: number,
): Notas {
  return { forca, saque, velocidade, pulo, reflexo, defesa, precisao, leitura };
}

/** O cabelo pelo nome, pra lista ficar legivel. */
const CABELO = Object.fromEntries(CABELOS.map((c) => [c.nome, c.cor])) as Record<string, number>;

/**
 * Um corpo: o personagem do pack de onde vem a roupa, o tom de pele, e o que
 * muda dele — camisa de outra cor, cabelo, ou pecas de outros personagens.
 */
function corpo(familia: Familia, fonte: string, pele: number, muda: Partial<Visual> = {}): Visual {
  return { ...visualDaFonte(familia, fonte), pele, ...muda };
}
const homem = (fonte: string, pele: number, muda?: Partial<Visual>): Visual => corpo('masculino', fonte, pele, muda);
const mulher = (fonte: string, pele: number, muda?: Partial<Visual>): Visual => corpo('feminino', fonte, pele, muda);

/**
 * Os vinte e quatro, e a galera.
 *
 * Os nomes sao inventados e com apelido de praia — nome de atleta de verdade
 * aqui seria colocar gente real perdendo pra um boneco. E o apelido e'
 * promessa: quem se chama SAQUE tem que sacar bem.
 *
 * O corpo sai do pack, de quem combina: o JUCA "de chinelo" e' o de praia, o
 * campeao e' o rei, quem le' a quadra toda veio de astronauta. Alguns misturam
 * pecas de mais de um — e' o mesmo criador que o jogador usa.
 *
 * As faixas de GERAL se sobrepoem entre etapas DE PROPOSITO: o favorito do
 * municipal (TUCA, 4,1) e' mais forte que o azarao do estadual (BETO, 4,0), e
 * a favorita do estadual (MARI, 6,8) mais forte que a azarona do mundial (NINA,
 * 6,6). Sem isso, subir de etapa seria um degrau, e ganhar a final de uma nao
 * ensinaria nada sobre a estreia da outra.
 *
 *                                    FOR SAQ VEL PUL REF DEF PRE LEI
 */
export const ELENCO: readonly Personagem[] = [
  // ---------------------------------------------------------------- MUNICIPAL
  {
    id: 'juca-duna', nome: 'JUCA DUNA', etapa: 'municipal',
    frase: 'Primeiro torneio da vida. Veio de chinelo.',
    notas: n(2, 1, 2, 2, 2, 2, 2, 2),
    cor: COR.limao, visual: homem('beach', PELE.clara, { camisa: COR.limao }),
  },
  {
    id: 'pepe-salina', nome: 'PEPE SALINA', etapa: 'municipal',
    frase: 'Joga de oculos escuros e reclama do sol o jogo inteiro.',
    notas: n(2, 3, 2, 2, 2, 3, 3, 2),
    cor: COR.branco, visual: homem('casual_2', PELE.morena, { camisa: COR.branco, cabelo: CABELO.PRETO }),
  },
  {
    id: 'rafa-coco', nome: 'RAFA COCO', etapa: 'municipal',
    frase: 'Bate como quem abre coco. Pra onde a bola vai, nem ele sabe.',
    notas: n(6, 3, 2, 3, 2, 1, 1, 2),
    cor: COR.marrom, visual: homem('farmer', PELE.parda),
  },
  {
    id: 'tatu', nome: 'TATU', etapa: 'municipal',
    frase: 'Cava toda bola na areia. Nao ataca, mas nao desiste de nenhuma.',
    notas: n(2, 2, 3, 1, 3, 6, 2, 3),
    cor: COR.areia, visual: homem('adventurer', PELE.escura),
  },
  {
    id: 'lia-concha', nome: 'LIA CONCHA', etapa: 'municipal',
    frase: 'Nao bate forte. Nao precisa: poe a bola onde quer.',
    notas: n(2, 3, 3, 2, 3, 3, 6, 4),
    cor: COR.coral, visual: mulher('casual', PELE.clara, { camisa: COR.coral, cabelo: CABELO.LOIRO }),
  },
  {
    id: 'duda-sol', nome: 'DUDA SOL', etapa: 'municipal',
    frase: 'Corre a quadra inteira. Chega em tudo, e chega sem plano.',
    notas: n(3, 2, 7, 3, 4, 3, 2, 3),
    cor: COR.amarelo, visual: mulher('punk', PELE.morena, { camisa: COR.amarelo, cabelo: CABELO.ROSA }),
  },
  {
    id: 'nando-saque', nome: 'NANDO SAQUE', etapa: 'municipal',
    frase: 'Saque viagem que queima a mao. Depois do saque, reza.',
    notas: n(3, 8, 2, 3, 3, 2, 4, 3),
    cor: COR.vermelho, visual: homem('punk', PELE.parda, { camisa: COR.vermelho }),
  },
  {
    id: 'tuca-marola', nome: 'TUCA MAROLA', etapa: 'municipal',
    frase: 'Nao tem ponto fraco. Tambem nao tem ponto forte. Ganha assim.',
    notas: n(4, 4, 4, 4, 4, 4, 4, 5),
    cor: COR.verde, visual: homem('casual_hoodie', PELE.negra, { camisa: COR.verde }),
  },
  // A galera: gente de verdade, pela Ficha da Galera, com as notas que deu pra si.
  {
    id: 'stefany-hallal', nome: 'STEFANY HALLAL', etapa: 'municipal',
    frase: 'Recebo bem no meio.',
    notas: n(6, 5, 5, 1, 3, 5, 6, 1),
    cor: COR.cinza, visual: mulher('suit', PELE.clara, { camisa: COR.cinza, cabelo: CABELO.CASTANHO }),
  },

  // ----------------------------------------------------------------- ESTADUAL
  {
    id: 'beto-mare', nome: 'BETO MARE', etapa: 'estadual',
    frase: 'Joga no ritmo da mare: devagar, e sempre voltando.',
    notas: n(3, 4, 3, 3, 4, 5, 5, 5),
    cor: COR.cinza, visual: homem('beach', PELE.clara, { cabeca: 'adventurer', tronco: 'casual_2', camisa: COR.cinza }),
  },
  {
    id: 'kiko-manchete', nome: 'KIKO MANCHETE', etapa: 'estadual',
    frase: 'A manchete mais limpa do estado. Ataque? Quase nunca.',
    notas: n(3, 4, 5, 3, 7, 8, 4, 6),
    cor: COR.laranja, visual: homem('swat', PELE.morena, { camisa: COR.laranja }),
  },
  {
    id: 'gabi-siri', nome: 'GABI SIRI', etapa: 'estadual',
    frase: 'Anda de lado mais rapido do que de frente.',
    notas: n(4, 4, 8, 5, 6, 5, 4, 4),
    cor: COR.coral, visual: mulher('adventurer', PELE.parda, { camisa: COR.coral, cabelo: CABELO.RUIVO }),
  },
  {
    id: 'bia-rede', nome: 'BIA REDE', etapa: 'estadual',
    frase: 'Mora em cima da rede. Bola alta ali e ponto dela.',
    notas: n(7, 4, 5, 8, 5, 3, 5, 4),
    cor: COR.roxo, visual: mulher('soldier', PELE.escura, { camisa: COR.roxo }),
  },
  {
    id: 'nico-brisa', nome: 'NICO BRISA', etapa: 'estadual',
    frase: 'Joga leve, de toque, e coloca a bola onde voce nao esta.',
    notas: n(3, 5, 5, 5, 5, 5, 8, 7),
    cor: COR.branco, visual: homem('suit', PELE.clara, { camisa: COR.branco, calca: COR.areia, cabelo: CABELO.LOIRO }),
  },
  {
    id: 'dani-caju', nome: 'DANI CAJU', etapa: 'estadual',
    frase: 'Metade dos pontos dela sai do saque. A outra metade, do seu nervoso.',
    notas: n(5, 9, 5, 5, 5, 4, 6, 5),
    cor: COR.amarelo, visual: mulher('formal', PELE.morena, { camisa: COR.amarelo }),
  },
  {
    id: 'zeca-jangada', nome: 'ZECA JANGADA', etapa: 'estadual',
    frase: 'Pesado e lento. Mas quando bate, a areia treme.',
    notas: n(8, 6, 3, 6, 4, 6, 5, 6),
    cor: COR.marrom, visual: homem('worker', PELE.negra, { cabeca: 'farmer', tronco: 'beach', camisa: COR.dourado }),
  },
  {
    id: 'mari-coral', nome: 'MARI CORAL', etapa: 'estadual',
    frase: 'Duas vezes campea estadual. Faz tudo bem, e sabe disso.',
    notas: n(6, 7, 6, 6, 7, 7, 7, 8),
    cor: COR.rosa, visual: mulher('suit', PELE.parda, { camisa: COR.rosa }),
  },
  // A galera: gente de verdade, pela Ficha da Galera, com as notas que deu pra si.
  {
    id: 'kaique-mota', nome: 'KAIQUE MOTA', etapa: 'estadual',
    frase: 'O importante e participar.',
    notas: n(4, 6, 5, 4, 8, 7, 5, 4),
    cor: COR.roxo, visual: homem('suit', PELE.clara, { camisa: COR.roxo, cabelo: CABELO.PRETO }),
  },

  // ------------------------------------------------------------------ MUNDIAL
  {
    id: 'nina-peixinho', nome: 'NINA PEIXINHO', etapa: 'mundial',
    frase: 'Se joga em tudo. Tem mais areia na roupa do que na quadra.',
    notas: n(4, 5, 8, 5, 8, 10, 6, 7),
    cor: COR.verde, visual: mulher('worker', PELE.clara, { camisa: COR.verde, calca: COR.preto }),
  },
  {
    id: 'bruna-boia', nome: 'BRUNA BOIA', etapa: 'mundial',
    frase: 'O saque mais rapido do circuito. Recebe-lo ja e meio ponto.',
    notas: n(8, 10, 6, 7, 6, 5, 7, 6),
    cor: COR.laranja, visual: mulher('scifi', PELE.morena, { camisa: COR.laranja }),
  },
  {
    id: 'dudu-farol', nome: 'DUDU FAROL', etapa: 'mundial',
    frase: 'Enxerga a quadra toda. Le o seu ataque antes de voce.',
    notas: n(5, 6, 6, 6, 8, 7, 8, 10),
    cor: COR.branco, visual: homem('spacesuit', PELE.escura),
  },
  {
    id: 'tito-onda', nome: 'TITO ONDA', etapa: 'mundial',
    frase: 'Sobe como onda grande. Quando ele desce, a bola ja caiu.',
    notas: n(9, 7, 7, 10, 7, 5, 6, 6),
    cor: COR.coral, visual: homem('swat', PELE.parda, { cabeca: 'casual_hoodie', tronco: 'adventurer', camisa: COR.coral }),
  },
  {
    id: 'guto-vento', nome: 'GUTO VENTO', etapa: 'mundial',
    frase: 'Ninguem viu ele correr. So viram ele chegar.',
    notas: n(6, 6, 10, 8, 9, 7, 6, 7),
    cor: COR.limao, visual: homem('casual_hoodie', PELE.morena, { cabeca: 'beach', pernas: 'casual_2', camisa: COR.limao }),
  },
  {
    id: 'leca-areia', nome: 'LECA AREIA', etapa: 'mundial',
    frase: 'Mira na linha e acerta a linha. Toda vez.',
    notas: n(7, 8, 7, 7, 8, 7, 10, 9),
    cor: COR.areia, visual: mulher('medieval', PELE.clara, { camisa: COR.vinho, cabelo: CABELO.LOIRO }),
  },
  {
    id: 'lu-bloqueio', nome: 'LU BLOQUEIO', etapa: 'mundial',
    frase: 'Ataca do alto, defende de perto e nao da bola de graca.',
    notas: n(10, 8, 7, 10, 8, 8, 8, 8),
    cor: COR.vermelho, visual: mulher('witch', PELE.negra, { camisa: COR.vermelho }),
  },
  {
    id: 'vini-recife', nome: 'VINI RECIFE', etapa: 'mundial',
    frase: 'Campeao mundial. Ninguem lembra da ultima vez que ele perdeu.',
    notas: n(10, 9, 9, 9, 10, 9, 9, 10),
    cor: COR.dourado, visual: homem('king', PELE.parda),
  },
];

const POR_ID = new Map(ELENCO.map((p) => [p.id, p]));

export function personagemPorId(id: string): Personagem | null {
  return POR_ID.get(id) ?? null;
}

/** Os da etapa, do mais forte pro mais fraco. */
export function elencoDaEtapa(etapa: Etapa): Personagem[] {
  return ELENCO.filter((p) => p.etapa === etapa).sort((a, b) => geral(b) - geral(a));
}

/** A media das oito notas. */
export function geral(p: Pick<Personagem, 'notas'>): number {
  return ATRIBUTOS.reduce((s, a) => s + p.notas[a], 0) / ATRIBUTOS.length;
}

/**
 * O geral levado pra escala de 0 a 1 do circuito.
 *
 * E' nessa escala que a simulacao dos jogos da CPU faz a conta de quem ganha:
 * nota 1 em tudo da' 0, nota 10 em tudo da' 1.
 */
export function nivel(p: Pick<Personagem, 'notas'>): number {
  return (geral(p) - 1) / 9;
}

/** O geral como a ficha escreve: uma casa, com virgula. */
export function geralEscrito(p: Pick<Personagem, 'notas'>): string {
  return geral(p).toFixed(1).replace('.', ',');
}

export type Estilo =
  | 'ATACANTE' | 'SACADOR' | 'VELOCISTA' | 'DEFENSOR' | 'ESTRATEGISTA' | 'COMPLETO' | 'INICIANTE';

/**
 * O estilo de jogo, TIRADO das notas — nunca escrito a mao.
 *
 * Escrito a mao, o rotulo mentiria no primeiro ajuste de nota: alguem sobe a
 * defesa do atacante e a ficha continua dizendo ATACANTE. Tirado das notas, ele
 * acompanha.
 *
 * Cada estilo e' a soma de duas notas (o SACADOR e o VELOCISTA, de uma so'
 * contada duas vezes, pra competir na mesma escala). Ganha o maior; se ele nao
 * se destaca do segundo por pelo menos 2, ninguem se destaca — e ai' depende
 * do nivel: igual em tudo e bom e' COMPLETO, igual em tudo e fraco e' INICIANTE.
 * Chamar de "completo" quem tem 2 em tudo seria elogio que a ficha nao sustenta.
 */
export function estiloDe(p: Pick<Personagem, 'notas'>): Estilo {
  const t = p.notas;
  const somas: Array<[Estilo, number]> = [
    ['ATACANTE', t.forca + t.pulo],
    ['SACADOR', t.saque * 2],
    ['VELOCISTA', t.velocidade * 2],
    ['DEFENSOR', t.defesa + t.reflexo],
    ['ESTRATEGISTA', t.precisao + t.leitura],
  ];
  somas.sort((a, b) => b[1] - a[1]);
  if (somas[0]![1] - somas[1]![1] >= 2) return somas[0]![0];
  return geral(p) < 3 ? 'INICIANTE' : 'COMPLETO';
}
