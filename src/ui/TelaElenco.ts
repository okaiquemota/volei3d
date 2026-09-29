import { DEFINICAO, ETAPAS, type Carreira, type Etapa, type Retrospecto } from '../match/Circuito';
import {
  ATRIBUTOS, DESCRICAO_DO_ATRIBUTO, NOME_DO_ATRIBUTO, elencoDaEtapa, estiloDe, geralEscrito,
  type Aparencia, type Personagem,
} from '../match/personagens';
import { corCss, el } from './dom';

/**
 * A FICHA de um personagem, e a tela que lista todos eles.
 *
 * So' desenha, como o `TelaCircuito`: o estado vem de fora, e o unico efeito
 * que sai daqui e' o clique no DESAFIAR, que volta por callback.
 */

const SVG = 'http://www.w3.org/2000/svg';

function forma(tag: string, atributos: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
  return e;
}

/**
 * O bonequinho, nas cores do personagem.
 *
 * Nao e' retrato: e' a MESMA divisao de cores do boneco 3D — capacete, pele,
 * camisa, colete com a faixa do capacete, calca — pra que quem olhou a ficha
 * reconheca o adversario do outro lado da rede sem ler o placar.
 */
export function desenharBoneco(a: Aparencia): SVGElement {
  const svg = forma('svg', { viewBox: '0 0 40 64', class: 'boneco', 'aria-hidden': 'true' });
  const cor = (x: number): string => corCss(x);

  svg.append(
    // bracos (manga da camisa) e maos
    forma('rect', { x: 5, y: 25, width: 6, height: 15, rx: 3, fill: cor(a.camisa) }),
    forma('rect', { x: 29, y: 25, width: 6, height: 15, rx: 3, fill: cor(a.camisa) }),
    forma('circle', { cx: 8, cy: 42, r: 2.6, fill: cor(a.pele) }),
    forma('circle', { cx: 32, cy: 42, r: 2.6, fill: cor(a.pele) }),
    // pernas e botas
    forma('rect', { x: 13, y: 41, width: 6.5, height: 16, rx: 2, fill: cor(a.calca) }),
    forma('rect', { x: 20.5, y: 41, width: 6.5, height: 16, rx: 2, fill: cor(a.calca) }),
    forma('rect', { x: 12, y: 56, width: 8, height: 4, rx: 1.5, fill: '#2a2b2e' }),
    forma('rect', { x: 20, y: 56, width: 8, height: 4, rx: 1.5, fill: '#2a2b2e' }),
    // tronco: camisa, colete por cima, faixa do colete
    forma('rect', { x: 10, y: 24, width: 20, height: 19, rx: 4, fill: cor(a.camisa) }),
    forma('rect', { x: 12.5, y: 24, width: 15, height: 18, rx: 2.5, fill: cor(a.colete) }),
    forma('rect', { x: 12.5, y: 33, width: 15, height: 2.2, fill: cor(a.capacete) }),
    // cabeca e capacete
    forma('circle', { cx: 20, cy: 16, r: 7, fill: cor(a.pele) }),
    forma('path', { d: 'M12.2 14.2 a7.8 7.8 0 0 1 15.6 0 z', fill: cor(a.capacete) }),
    forma('rect', { x: 11, y: 13.2, width: 18, height: 2.2, rx: 1, fill: cor(a.capacete) }),
  );
  if (a.bigode) svg.append(forma('rect', { x: 16.5, y: 19, width: 7, height: 1.8, rx: 0.9, fill: '#3b2415' }));
  return svg;
}

/** A faixa de cor da nota. Ler 10 barras iguais cansa; quatro tons se leem de relance. */
function faixa(nota: number): string {
  if (nota >= 9) return 'elite';
  if (nota >= 7) return 'alta';
  if (nota >= 4) return 'media';
  return 'baixa';
}

function textoDoRetrospecto(r: Retrospecto | null): string {
  if (!r || r.v + r.d === 0) return 'PRIMEIRO ENCONTRO';
  const v = `${r.v} ${r.v === 1 ? 'VITORIA' : 'VITORIAS'}`;
  const d = `${r.d} ${r.d === 1 ? 'DERROTA' : 'DERROTAS'}`;
  return `VOCE CONTRA ELE: ${v}, ${d}`;
}

export interface OpcoesDaFicha {
  /**
   * Voce contra ele. `null` e' "nunca jogaram"; ausente, a linha nao aparece
   * — fora do circuito nao ha' carreira pra contar.
   */
  retrospecto?: Retrospecto | null;
  /** Um botao no pe' da ficha. */
  acao?: { rotulo: string; aoClicar: () => void };
}

/**
 * A ficha: quem e', o estilo, o geral e as oito notas.
 *
 * O GERAL vai grande e sozinho porque e' a unica coisa que se compara de
 * relance entre dois personagens. As notas sao o porque dele.
 */
export function desenharFicha(p: Personagem, opcoes: OpcoesDaFicha = {}): HTMLElement {
  const ficha = el('article', 'ficha');
  ficha.style.setProperty('--cor', corCss(p.visual.colete));

  const quem = el('div', 'ficha-quem');
  quem.append(
    el('span', 'ficha-estilo', `${estiloDe(p)} · ${DEFINICAO[p.etapa].nome}`),
    el('h3', 'ficha-nome', p.nome),
    el('p', 'ficha-frase', p.frase),
  );

  const geral = el('div', 'ficha-geral');
  geral.append(el('b', '', geralEscrito(p)), el('span', '', 'GERAL'));

  const cabeca = el('div', 'ficha-cabeca');
  cabeca.append(desenharBoneco(p.visual), quem, geral);

  const notas = el('dl', 'ficha-notas');
  for (const a of ATRIBUTOS) {
    const nota = p.notas[a];
    const linha = el('div', `nota ${faixa(nota)}`);
    linha.title = DESCRICAO_DO_ATRIBUTO[a];

    const barra = el('span', 'barra');
    for (let i = 1; i <= 10; i++) barra.append(el('i', i <= nota ? 'cheio' : ''));

    const valor = el('dd');
    valor.append(barra, el('b', '', String(nota)));
    linha.append(el('dt', '', NOME_DO_ATRIBUTO[a]), valor);
    notas.append(linha);
  }

  ficha.append(cabeca, notas);

  if (opcoes.retrospecto !== undefined) {
    const r = opcoes.retrospecto;
    const linha = el('p', 'ficha-retrospecto', textoDoRetrospecto(r));
    // Quem esta' na frente no retrospecto aparece: rival que te ganha mais do
    // que perde tem que parecer ameaca.
    if (r && r.v > r.d) linha.classList.add('vantagem');
    if (r && r.d > r.v) linha.classList.add('desvantagem');
    ficha.append(linha);
  }

  if (opcoes.acao) {
    const { rotulo, aoClicar } = opcoes.acao;
    const botao = el('button', 'botao', rotulo);
    botao.type = 'button';
    botao.addEventListener('click', aoClicar);
    ficha.append(botao);
  }

  return ficha;
}

/**
 * A tela ADVERSARIOS: o elenco inteiro, uma etapa por vez.
 *
 * Lista a' esquerda, ficha a' direita. Vinte e quatro fichas empilhadas seriam
 * uma rolagem sem fim, e o que se quer aqui e' COMPARAR — clicar num nome e
 * no outro, com a ficha trocando no mesmo lugar.
 */
export class TelaElenco {
  private etapa: Etapa = 'municipal';
  private escolhido: string | null = null;
  private carreira: Carreira | null = null;

  constructor(
    private readonly abas: HTMLElement,
    private readonly lista: HTMLElement,
    private readonly fichaAlvo: HTMLElement,
    private readonly aoDesafiar: (p: Personagem) => void,
  ) {}

  mostrar(carreira: Carreira): void {
    this.carreira = carreira;
    this.desenhar();
  }

  private desenhar(): void {
    this.abas.replaceChildren(...ETAPAS.map((etapa) => {
      const aba = el('button', 'aba', DEFINICAO[etapa].nome);
      aba.type = 'button';
      aba.setAttribute('role', 'tab');
      aba.setAttribute('aria-selected', String(etapa === this.etapa));
      aba.addEventListener('click', () => {
        this.etapa = etapa;
        this.escolhido = null;
        this.desenhar();
      });
      return aba;
    }));

    // Do mais forte pro mais fraco, numerado: e' o ranking da etapa.
    const daEtapa = elencoDaEtapa(this.etapa);
    const escolhido = daEtapa.find((p) => p.id === this.escolhido) ?? daEtapa[0]!;

    this.lista.replaceChildren(...daEtapa.map((p, i) => {
      const item = el('button', 'item-elenco');
      item.type = 'button';
      item.setAttribute('aria-pressed', String(p === escolhido));
      const cor = el('i', 'cor');
      cor.style.background = corCss(p.visual.colete);
      item.append(
        el('span', 'pos', String(i + 1)),
        cor,
        el('span', 'n', p.nome),
        el('span', 'e', estiloDe(p)),
        el('b', 'g', geralEscrito(p)),
      );
      item.addEventListener('click', () => {
        this.escolhido = p.id;
        this.desenhar();
      });
      return item;
    }));

    // Aqui so' aparece o retrospecto que EXISTE: "primeiro encontro" faz
    // sentido antes de uma partida, e nao numa lista de quem voce nunca viu.
    this.fichaAlvo.replaceChildren(desenharFicha(escolhido, {
      retrospecto: this.carreira?.confrontos[escolhido.id],
      acao: { rotulo: 'DESAFIAR NUM AMISTOSO', aoClicar: () => this.aoDesafiar(escolhido) },
    }));
  }
}
