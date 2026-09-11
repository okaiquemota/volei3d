import { STORAGE_KEY } from '../config';

export type Dificuldade = 'facil' | 'normal' | 'dificil';

export interface Ajustes {
  dificuldade: Dificuldade;
  /** Escala de resolucao, de 0.5 a 1. */
  resolucao: number;
}

const PADRAO: Ajustes = { dificuldade: 'normal', resolucao: 1 };

function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao encontrado`);
  return el as T;
}

/**
 * Menu, pausa, fim de jogo e as opcoes.
 *
 * Tudo em DOM, como o Screens do rpk.fps. Os ajustes vao pro localStorage —
 * e' um jogo de navegador, e quem escolheu "dificil" nao devia escolher de
 * novo a cada aba nova.
 */
export class Screens {
  private menu = elemento('menu');
  private pausa = elemento('pause');
  private fim = elemento('gameover');
  private tituloDoFim = elemento('go-titulo');
  private placarDoFim = elemento('go-placar');

  private selDificuldade = elemento<HTMLSelectElement>('opt-skill');
  private sliderResolucao = elemento<HTMLInputElement>('opt-res');
  private valorResolucao = elemento('opt-res-valor');

  ajustes: Ajustes = { ...PADRAO };

  aoJogar: (() => void) | null = null;
  aoContinuar: (() => void) | null = null;
  aoSair: (() => void) | null = null;
  aoMudarAjustes: ((ajustes: Ajustes) => void) | null = null;

  constructor() {
    this.carregar();

    elemento('btn-jogar').addEventListener('click', () => this.aoJogar?.());
    elemento('btn-voltar').addEventListener('click', () => this.aoContinuar?.());
    elemento('btn-sair').addEventListener('click', () => this.aoSair?.());
    elemento('btn-denovo').addEventListener('click', () => this.aoJogar?.());

    this.selDificuldade.addEventListener('change', () => {
      this.ajustes.dificuldade = this.selDificuldade.value as Dificuldade;
      this.aplicar();
    });

    this.sliderResolucao.addEventListener('input', () => {
      this.ajustes.resolucao = Number(this.sliderResolucao.value) / 100;
      this.aplicar();
    });
  }

  private aplicar(): void {
    this.valorResolucao.textContent = `${Math.round(this.ajustes.resolucao * 100)}%`;
    this.salvar();
    this.aoMudarAjustes?.(this.ajustes);
  }

  private carregar(): void {
    try {
      const cru = localStorage.getItem(STORAGE_KEY);
      if (cru) Object.assign(this.ajustes, JSON.parse(cru) as Partial<Ajustes>);
    } catch {
      // localStorage pode estar bloqueado (aba anonima, cookies desligados).
      // Nao ter os ajustes salvos nao e' motivo pra nao abrir o jogo.
    }

    this.selDificuldade.value = this.ajustes.dificuldade;
    this.sliderResolucao.value = String(Math.round(this.ajustes.resolucao * 100));
    this.valorResolucao.textContent = `${Math.round(this.ajustes.resolucao * 100)}%`;
  }

  private salvar(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.ajustes));
    } catch {
      // idem
    }
  }

  mostrarMenu(visivel: boolean): void { this.menu.classList.toggle('hidden', !visivel); }
  mostrarPausa(visivel: boolean): void { this.pausa.classList.toggle('hidden', !visivel); }

  mostrarFim(vencedorEhVoce: boolean, home: number, away: number): void {
    this.tituloDoFim.textContent = vencedorEhVoce ? 'VOCE VENCEU' : 'CPU VENCEU';
    this.tituloDoFim.classList.toggle('away', !vencedorEhVoce);
    this.placarDoFim.textContent = `PLACAR FINAL ${home} x ${away}`;
    this.fim.classList.remove('hidden');
  }

  esconderFim(): void { this.fim.classList.add('hidden'); }
}
