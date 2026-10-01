import {
  CABELOS, CORES_DE_ROUPA, PECAS, PELES, acessoriosDe, ajustar, nomeDaFonte, opcoesDe, trocarFamilia,
  visualSorteado, type Familia, type Peca, type Visual,
} from '../players/corpos';
import { corCss, el, icone } from './dom';
import { EVENTO_DE_PASSO, type Passo } from './navegacao';

/**
 * MEU JOGADOR: o criador de personagem.
 *
 * So' a lista de escolhas. O boneco que muda a cada escolha nao mora aqui —
 * e' o proprio banhista, de pe' na areia ao lado da quadra, com a camera do
 * jogo de frente pra ele (`Game.abrirCriador`). E' o corpo de verdade, na luz
 * de verdade: o que se ve' aqui e' exatamente o que entra na quadra.
 *
 * Cada linha e' um seletor de setas, como os AJUSTES: setas pros lados mudam,
 * pra cima e pra baixo trocam de linha. Uma escolha que abre a combinacao (a
 * calca curta com o tenis baixo) conserta a OUTRA peca e avisa qual — o
 * jogador nunca ve' um corpo quebrado, e nunca perde a peca que escolheu.
 */

/** Uma linha: os valores possiveis agora, o atual, e como cada um se le'. */
interface Linha {
  chave: string;
  nome: string;
  valores: () => readonly unknown[];
  atual: (v: Visual) => unknown;
  rotulo: (valor: unknown) => string;
  /** A amostra de cor, nas linhas de cor. `null` e' "a que veio". */
  amostra?: (valor: unknown) => number | null;
  aplicar: (v: Visual, valor: unknown) => Visual;
}

const NOME_DA_PECA: Readonly<Record<Peca, string>> = { cabeca: 'CABECA', tronco: 'TRONCO', pernas: 'PERNAS', pes: 'PES' };
/** A peca com artigo, e se e' plural: pro aviso do conserto ler como frase. */
const NA_FRASE: Readonly<Record<Peca, [string, boolean]>> = {
  cabeca: ['A CABECA', false], tronco: ['O TRONCO', false], pernas: ['AS PERNAS', true], pes: ['OS PES', true],
};
/** O nome do acessorio pelo personagem de onde ele vem. Hoje so' ha' um. */
const NOME_DO_ACESSORIO: Readonly<Record<string, string>> = { adventurer: 'MOCHILA' };

const cores = (lista: readonly { cor: number }[]): readonly (number | null)[] => [null, ...lista.map((c) => c.cor)];
const nomeDaCor = (lista: readonly { nome: string; cor: number }[], original = 'ORIGINAL') => (valor: unknown): string =>
  (valor === null ? original : lista.find((c) => c.cor === valor)?.nome ?? '?');

export class TelaJogador {
  private v!: Visual;
  private readonly redesenhos = new Map<string, () => void>();
  private familiaDesenhada: Familia | null = null;

  constructor(
    private readonly lista: HTMLElement,
    private readonly aviso: HTMLElement,
    private readonly aoMudar: (v: Visual) => void,
  ) {}

  mostrar(v: Visual): void {
    this.v = { ...v };
    this.aviso.textContent = '';
    this.desenhar();
  }

  /** Um corpo qualquer, que fecha. Pra quem nao sabe por onde comecar. */
  sortear(): void {
    this.mudar(visualSorteado(Math.random), 'SORTEADO. GOSTOU? SE NAO, R DE NOVO.');
  }

  private linhas(): Linha[] {
    const familia = this.v.familia;
    const pecas: Linha[] = PECAS.map((peca) => ({
      chave: peca,
      nome: NOME_DA_PECA[peca],
      valores: () => opcoesDe(this.v.familia, peca),
      atual: (v) => v[peca],
      rotulo: (id) => nomeDaFonte(this.v.familia, id as string),
      aplicar: (v, id) => {
        const novo = ajustar({ ...v, [peca]: id }, peca);
        this.avisarConserto(v, novo, peca);
        return novo;
      },
    }));
    const acessorios = acessoriosDe(familia);
    return [
      {
        chave: 'familia',
        nome: 'CORPO',
        valores: () => ['masculino', 'feminino'],
        atual: (v) => v.familia,
        rotulo: (f) => (f === 'masculino' ? 'MASCULINO' : 'FEMININO'),
        aplicar: (v, f) => trocarFamilia(v, f as Familia),
      },
      ...pecas,
      {
        chave: 'acessorio',
        nome: 'ACESSORIO',
        valores: () => [null, ...acessorios],
        atual: (v) => v.acessorio,
        rotulo: (id) => (id === null ? 'NENHUM' : NOME_DO_ACESSORIO[id as string] ?? String(id).toUpperCase()),
        aplicar: (v, id) => ({ ...v, acessorio: id as string | null }),
      },
      {
        chave: 'pele',
        nome: 'PELE',
        valores: () => PELES.map((p) => p.cor),
        atual: (v) => v.pele,
        rotulo: nomeDaCor(PELES),
        amostra: (c) => c as number,
        aplicar: (v, c) => ({ ...v, pele: c as number }),
      },
      {
        chave: 'cabelo',
        nome: 'CABELO',
        valores: () => cores(CABELOS),
        atual: (v) => v.cabelo,
        rotulo: nomeDaCor(CABELOS),
        amostra: (c) => c as number | null,
        aplicar: (v, c) => ({ ...v, cabelo: c as number | null }),
      },
      {
        chave: 'camisa',
        nome: 'CAMISA',
        valores: () => cores(CORES_DE_ROUPA),
        atual: (v) => v.camisa,
        rotulo: nomeDaCor(CORES_DE_ROUPA),
        amostra: (c) => c as number | null,
        aplicar: (v, c) => ({ ...v, camisa: c as number | null }),
      },
      {
        chave: 'calca',
        nome: 'CALCA',
        valores: () => cores(CORES_DE_ROUPA),
        atual: (v) => v.calca,
        rotulo: nomeDaCor(CORES_DE_ROUPA),
        amostra: (c) => c as number | null,
        aplicar: (v, c) => ({ ...v, calca: c as number | null }),
      },
    ];
  }

  /** A troca consertou outra peca: diz qual, pra nao parecer que mudou sozinha. */
  private avisarConserto(antes: Visual, depois: Visual, mudou: Peca): void {
    const outras = PECAS.filter((p) => p !== mudou && antes[p] !== depois[p]);
    if (outras.length === 0) return;
    const frases = outras.map((p) => {
      const [nome, plural] = NA_FRASE[p];
      return `${nome} ${plural ? 'VIRARAM' : 'VIROU'} ${nomeDaFonte(depois.familia, depois[p])}`;
    });
    this.aviso.textContent = `${frases.join(' E ')} PRA FECHAR COM ${NA_FRASE[mudou][0]}.`;
  }

  private mudar(v: Visual, aviso: string | null): void {
    this.v = v;
    if (aviso !== null) this.aviso.textContent = aviso;
    this.aoMudar({ ...v });
    // Trocou de familia: as listas de peca sao outras, e a linha do acessorio
    // pode ter sumido. Redesenha tudo, mantendo a linha em foco.
    if (v.familia !== this.familiaDesenhada) this.desenhar();
    else for (const r of this.redesenhos.values()) r();
  }

  private desenhar(): void {
    const foco = (document.activeElement as HTMLElement | null)?.dataset?.opcao;
    this.familiaDesenhada = this.v.familia;
    this.redesenhos.clear();

    this.lista.replaceChildren(...this.linhas().map((l, i) => {
      const linha = el('div', 'opcao opcao-criador');
      linha.tabIndex = 0;
      linha.dataset.opcao = l.chave;
      linha.style.setProperty('--i', String(i));
      linha.setAttribute('role', 'group');
      linha.setAttribute('aria-label', l.nome);
      if (i === 0) linha.dataset.principal = '';

      const valor = el('span', 'seletor-valor');
      const conta = el('span', 'seletor-conta');
      const seta = (passo: number, nome: string): HTMLButtonElement => {
        const b = el('button', 'seletor-seta');
        b.type = 'button';
        b.tabIndex = -1;
        b.setAttribute('aria-label', passo < 0 ? 'anterior' : 'proximo');
        b.append(icone(nome));
        b.addEventListener('click', (e) => { e.stopPropagation(); andar(passo); });
        return b;
      };
      const seletor = el('div', 'seletor');
      seletor.append(seta(-1, 'esq'), valor, seta(1, 'dir'));
      linha.append(el('span', 'opcao-nome', l.nome), seletor, conta);

      const redesenhar = (): void => {
        const valores = l.valores();
        const atual = l.atual(this.v);
        const idx = Math.max(0, valores.indexOf(atual));
        const amostra = l.amostra?.(atual);
        const texto = el('span', '', l.rotulo(atual));
        if (l.amostra) {
          const chip = el('i', `amostra${amostra === null ? ' original' : ''}`);
          if (amostra !== null && amostra !== undefined) chip.style.setProperty('--c', corCss(amostra));
          valor.replaceChildren(chip, texto);
        } else {
          valor.replaceChildren(texto);
        }
        conta.textContent = `${idx + 1}/${valores.length}`;
        linha.classList.toggle('desligada', valores.length < 2);
      };

      /** As setas DAO A VOLTA: e' uma vitrine, e da ultima pra primeira e' um passo. */
      const andar = (passo: number): void => {
        const valores = l.valores();
        if (valores.length < 2) return;
        const idx = Math.max(0, valores.indexOf(l.atual(this.v)));
        const proximo = valores[(idx + passo + valores.length) % valores.length];
        this.aviso.textContent = '';
        this.mudar(l.aplicar(this.v, proximo), null);
      };

      linha.addEventListener(EVENTO_DE_PASSO, (e) => andar((e as CustomEvent<Passo>).detail.passo));
      linha.addEventListener('click', () => andar(1));
      linha.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); andar(1); }
      });

      this.redesenhos.set(l.chave, redesenhar);
      redesenhar();
      return linha;
    }));

    if (foco) (this.lista.querySelector(`[data-opcao="${foco}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  }
}
