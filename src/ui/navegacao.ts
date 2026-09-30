/**
 * Menu de jogo se anda com as SETAS.
 *
 * Tab e mouse continuam funcionando — sao do navegador e ninguem os tira —
 * mas quem joga de teclado espera o que todo jogo de console faz: setas movem
 * a selecao pelo espaco da tela, Enter confirma, Esc volta. E uma selecao so':
 * passar o mouse por cima de um item tambem o seleciona, pra nao existirem dois
 * "cursores" discordando.
 *
 * O movimento e' ESPACIAL, e nao a ordem do documento: da direita do bloco
 * grande do menu, a seta pra direita vai pro bloco que esta' a' direita dele,
 * seja qual for o HTML. E' a unica ordem que o jogador ve'.
 */

/** O que da' pra selecionar numa tela. */
const FOCAVEIS = 'button:not([disabled]), [tabindex="0"]';

/** Teclas proprias de uma tela (Q/E das abas, R do jogar de novo). */
export type TeclasDaTela = Record<string, () => void>;

function visivel(el: Element): boolean {
  return el.getClientRects().length > 0 && !el.closest('.hidden');
}

function centro(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Uma opcao de seletor anda pros lados com as setas, em vez de sair dela. */
export interface Passo { passo: number }
export const EVENTO_DE_PASSO = 'passo';

export class Navegacao {
  /** Ultima coisa que o jogador usou. So' o teclado ganha foco automatico. */
  private deTeclado = false;
  private teclas = new Map<string, TeclasDaTela>();
  /** O que estava selecionado em cada tela quando ela fechou. */
  private lembrado = new WeakMap<HTMLElement, HTMLElement>();

  constructor(private readonly telas: HTMLElement, private readonly telaAberta: () => HTMLElement | null) {
    window.addEventListener('keydown', this.aoTeclar);
    window.addEventListener('pointerdown', () => { this.deTeclado = false; }, true);
    window.addEventListener('pointermove', () => { this.deTeclado = false; }, true);

    // Passar o mouse seleciona. `pointerover` borbulha, entao um ouvinte so'
    // na raiz das telas cobre tudo, inclusive o que ainda vai ser desenhado.
    this.telas.addEventListener('pointerover', (e) => {
      const alvo = (e.target as Element).closest?.(FOCAVEIS);
      if (alvo instanceof HTMLElement && alvo !== document.activeElement && visivel(alvo)) {
        alvo.focus({ preventScroll: true });
      }
    });
  }

  /** Registra teclas extras pra uma tela, pelo id dela. */
  registrar(idDaTela: string, teclas: TeclasDaTela): void {
    this.teclas.set(idDaTela, teclas);
  }

  /**
   * Uma tela acabou de abrir. Veio do teclado? Entao a selecao ja' nasce no
   * item principal — Enter duas vezes atravessa o menu, como num console.
   *
   * Com atraso, e o do fim de jogo maior: o jogador estava apertando teclas
   * no meio do rally quando a tela subiu, e um ESPACO que ainda estava descendo
   * nao pode cair no JOGAR DE NOVO.
   */
  aoAbrir(tela: HTMLElement, atraso = 120): void {
    if (!this.deTeclado) return;
    window.setTimeout(() => {
      if (this.telaAberta() !== tela) return;
      if (document.activeElement && tela.contains(document.activeElement)) return;
      // Voltando pra uma tela, a selecao volta pra onde estava: sair de
      // ADVERSARIOS devolve ao bloco ADVERSARIOS, e nao ao primeiro do menu.
      const antes = this.lembrado.get(tela);
      const alvo = antes && tela.contains(antes) && visivel(antes) ? antes : this.principal(tela);
      alvo?.focus({ preventScroll: true });
    }, atraso);
  }

  /** A tela vai fechar: guarda o que estava selecionado nela. */
  aoFechar(tela: HTMLElement): void {
    const a = document.activeElement;
    if (a instanceof HTMLElement && tela.contains(a)) this.lembrado.set(tela, a);
  }

  private focaveis(tela: HTMLElement): HTMLElement[] {
    return [...tela.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(visivel);
  }

  private principal(tela: HTMLElement): HTMLElement | null {
    const marcados = [...tela.querySelectorAll<HTMLElement>('[data-principal]')].filter(visivel);
    return marcados.find((b) => !(b as HTMLButtonElement).disabled) ?? this.focaveis(tela)[0] ?? null;
  }

  private aoTeclar = (e: KeyboardEvent): void => {
    const tela = this.telaAberta();
    if (!tela) return;
    this.deTeclado = true;

    const extra = this.teclas.get(tela.id)?.[e.code];
    if (extra) {
      e.preventDefault();
      extra();
      return;
    }

    const ativo = document.activeElement instanceof HTMLElement && tela.contains(document.activeElement)
      ? document.activeElement : null;

    switch (e.code) {
      case 'ArrowUp': this.mover(e, tela, ativo, 0, -1); break;
      case 'ArrowDown': this.mover(e, tela, ativo, 0, 1); break;
      case 'ArrowLeft': this.mover(e, tela, ativo, -1, 0); break;
      case 'ArrowRight': this.mover(e, tela, ativo, 1, 0); break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space': {
        // Botao com foco o navegador ja' aperta sozinho. Sem foco, o Enter
        // vai pro principal da tela; o Espaco, nao — e' pulo, e quem acabou
        // de sair da quadra ainda pode estar com o dedo nele.
        if (ativo instanceof HTMLButtonElement) return;
        if (ativo?.dataset.opcao) {
          e.preventDefault();
          ativo.dispatchEvent(new CustomEvent<Passo>(EVENTO_DE_PASSO, { detail: { passo: 1 } }));
          return;
        }
        if (e.code === 'Space') return;
        e.preventDefault();
        this.principal(tela)?.click();
        break;
      }
      case 'Escape': {
        const voltar = [...tela.querySelectorAll<HTMLElement>('[data-voltar]')].find(visivel);
        if (!voltar) return;
        e.preventDefault();
        /**
         * No proximo quadro, e nao agora.
         *
         * O `Input` do jogo tambem viu este Esc. Se a pausa fechasse aqui, no
         * mesmo instante, o laco do jogo acordaria em "jogando" com o Esc
         * ainda marcado como apertado neste quadro — e pausaria de novo. O
         * laco roda antes deste callback e limpa a tecla no fim do quadro.
         */
        requestAnimationFrame(() => voltar.click());
        break;
      }
      default:
    }
  };

  private mover(e: KeyboardEvent, tela: HTMLElement, ativo: HTMLElement | null, dx: number, dy: number): void {
    e.preventDefault();

    // Opcao de seletor: pros lados muda o valor, pra cima e pra baixo sai dela.
    if (ativo?.dataset.opcao && dx !== 0) {
      ativo.dispatchEvent(new CustomEvent<Passo>(EVENTO_DE_PASSO, { detail: { passo: dx } }));
      return;
    }

    if (!ativo) {
      this.principal(tela)?.focus();
      return;
    }

    /**
     * O mais perto NA DIRECAO, com o desvio pro lado pesando mais que a
     * distancia. Sem o peso, a seta pra direita a partir do topo de uma coluna
     * iria pro item de baixo da coluna vizinha so' por ele estar um fio mais
     * perto em linha reta.
     */
    const a = centro(ativo.getBoundingClientRect());
    let melhor: HTMLElement | null = null;
    let melhorNota = Infinity;
    for (const c of this.focaveis(tela)) {
      if (c === ativo || c.contains(ativo) || ativo.contains(c)) continue;
      const b = centro(c.getBoundingClientRect());
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const frente = vx * dx + vy * dy;
      if (frente <= 4) continue;
      const lado = Math.abs(vx * dy - vy * dx);
      const nota = frente + lado * 2.2;
      if (nota < melhorNota) {
        melhorNota = nota;
        melhor = c;
      }
    }
    melhor?.focus();
    melhor?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
