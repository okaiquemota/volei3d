import { DEFINICAO, ETAPAS, type Carreira, type Etapa, type Retrospecto } from '../match/Circuito';
import {
  ATRIBUTOS, DESCRICAO_DO_ATRIBUTO, NOME_DO_ATRIBUTO, elencoDaEtapa, estiloDe, geralEscrito,
  type Personagem,
} from '../match/personagens';
import { corCss, el } from './dom';
import { desenharRetrato } from './retratos';

/**
 * A FICHA de um personagem, e a tela que lista todos eles.
 *
 * So' desenha, como o `TelaCircuito`: o estado vem de fora, e o unico efeito
 * que sai daqui e' o clique no DESAFIAR, que volta por callback.
 */

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
 * O GERAL vai grande e sozinho, num bloco branco, porque e' a unica coisa que
 * se compara de relance entre dois personagens. As notas sao o porque dele.
 */
export function desenharFicha(p: Personagem, opcoes: OpcoesDaFicha = {}): HTMLElement {
  const ficha = el('article', 'ficha');
  ficha.style.setProperty('--cor', corCss(p.cor));

  const retrato = el('div', 'ficha-retrato');
  retrato.append(desenharRetrato(p.visual, 'busto'));

  const quem = el('div', 'ficha-quem');
  quem.append(
    el('span', 'ficha-estilo', `${estiloDe(p)} · ${DEFINICAO[p.etapa].nome}`),
    el('h3', 'ficha-nome', p.nome),
    el('p', 'ficha-frase', p.frase),
  );

  const geral = el('div', 'ficha-geral');
  geral.append(el('b', '', geralEscrito(p)), el('span', '', 'GERAL'));

  const cabeca = el('div', 'ficha-cabeca');
  cabeca.append(retrato, quem, geral);

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
    const botao = el('button', 'botao botao-principal', rotulo);
    botao.type = 'button';
    botao.addEventListener('click', aoClicar);
    ficha.append(botao);
  }

  return ficha;
}

/**
 * A tela ADVERSARIOS: o elenco inteiro, uma etapa por vez.
 *
 * Cartas a' esquerda, ficha a' direita. Vinte e quatro fichas empilhadas seriam
 * uma rolagem sem fim, e o que se quer aqui e' COMPARAR — passar de uma carta
 * pra outra com a ficha trocando no mesmo lugar. Por isso a ficha segue o
 * FOCO, e nao so' o clique: com as setas, andar pelas cartas ja' compara.
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

  /**
   * Anda uma etapa pra frente ou pra tras (Q/E).
   *
   * As cartas sao redesenhadas, e a que tinha o foco some junto: sem devolver
   * o foco a' primeira carta nova, a seta seguinte nao teria de onde partir.
   */
  trocarEtapa(passo: number): void {
    const i = ETAPAS.indexOf(this.etapa);
    const proxima = ETAPAS[Math.max(0, Math.min(ETAPAS.length - 1, i + passo))]!;
    if (proxima === this.etapa) return;
    this.etapa = proxima;
    this.escolhido = null;
    this.desenhar();
    (this.lista.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private desenhar(): void {
    this.abas.replaceChildren(...ETAPAS.map((etapa) => {
      const aba = el('button', 'aba', DEFINICAO[etapa].nome);
      aba.type = 'button';
      aba.setAttribute('role', 'tab');
      aba.setAttribute('aria-selected', String(etapa === this.etapa));
      aba.addEventListener('click', () => {
        if (etapa === this.etapa) return;
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
      const carta = el('button', 'carta');
      carta.type = 'button';
      carta.style.setProperty('--cor', corCss(p.cor));
      carta.style.setProperty('--i', String(i));
      carta.setAttribute('aria-pressed', String(p === escolhido));
      // A carta escolhida e' a selecao inicial da tela, e nao a primeira aba.
      if (p === escolhido) carta.dataset.principal = '';
      carta.setAttribute('aria-label', `${p.nome}, geral ${geralEscrito(p)}`);

      const rotulos = el('span', 'carta-rotulos');
      rotulos.append(el('span', 'n', p.nome), el('span', 'e', estiloDe(p)));
      carta.append(el('b', 'g', geralEscrito(p)), el('span', 'pos', `#${i + 1}`), desenharRetrato(p.visual, 'carta'), rotulos);

      const escolher = (): void => {
        if (this.escolhido === p.id) return;
        this.escolhido = p.id;
        for (const c of this.lista.children) {
          c.setAttribute('aria-pressed', String(c === carta));
          (c as HTMLElement).toggleAttribute('data-principal', c === carta);
        }
        this.desenharFicha(p);
      };
      carta.addEventListener('click', escolher);
      carta.addEventListener('focus', escolher);
      return carta;
    }));

    this.escolhido = escolhido.id;
    this.desenharFicha(escolhido);
  }

  private desenharFicha(p: Personagem): void {
    // Aqui so' aparece o retrospecto que EXISTE: "primeiro encontro" faz
    // sentido antes de uma partida, e nao numa lista de quem voce nunca viu.
    this.fichaAlvo.replaceChildren(desenharFicha(p, {
      retrospecto: this.carreira?.confrontos[p.id],
      acao: { rotulo: 'DESAFIAR NUM AMISTOSO', aoClicar: () => this.aoDesafiar(p) },
    }));
  }
}
