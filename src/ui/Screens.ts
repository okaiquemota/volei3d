import { STORAGE_KEY } from '../config';

export type Dificuldade = 'facil' | 'normal' | 'dificil';

/**
 * Onde se joga.
 *
 * `areia` e' a quadra desenhada por codigo, que o jogo sempre teve. `quadra` e'
 * a pele de modelo por cima do MESMO campo — muda o desenho, nao as medidas.
 */
export type Cenario = 'areia' | 'quadra';

export interface Ajustes {
  dificuldade: Dificuldade;
  cenario: Cenario;
  /** Escala de resolucao, de 0.5 a 1. */
  resolucao: number;
}

const PADRAO: Ajustes = { dificuldade: 'normal', cenario: 'areia', resolucao: 1 };

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

  /**
   * A dificuldade e' um grupo de radios, e nao um <select>.
   *
   * Sao tres opcoes curtas: escondidas atras de um menu suspenso, escolher
   * custa dois cliques e ver as outras duas custa um. O CSS pinta os rotulos e
   * esconde as bolinhas, mas o estado continua sendo o do <input> — nao ha'
   * "qual esta' selecionado" guardado em dois lugares pra discordar.
   */
  private radiosDificuldade = Array.from(
    document.querySelectorAll<HTMLInputElement>('#opt-skill input[name="skill"]'),
  );
  private radiosCenario = Array.from(
    document.querySelectorAll<HTMLInputElement>('#opt-cenario input[name="cenario"]'),
  );
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

    for (const radio of this.radiosDificuldade) {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        this.ajustes.dificuldade = radio.value as Dificuldade;
        this.aplicar();
      });
    }

    for (const radio of this.radiosCenario) {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        this.ajustes.cenario = radio.value as Cenario;
        this.aplicar();
      });
    }

    this.sliderResolucao.addEventListener('input', () => {
      this.ajustes.resolucao = Number(this.sliderResolucao.value) / 100;
      this.aplicar();
    });

    this.sincronizarVeu();
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

    for (const radio of this.radiosDificuldade) {
      radio.checked = radio.value === this.ajustes.dificuldade;
    }
    for (const radio of this.radiosCenario) {
      radio.checked = radio.value === this.ajustes.cenario;
    }
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

  /**
   * Marca no <body> que ha' uma tela aberta, pro CSS apagar o HUD atras dela.
   *
   * As telas sao translucidas de proposito — a praia continua aparecendo atras.
   * Sem esta marca o placar e a dica de saque atravessam o veu e caem por cima
   * do "VOCE VENCEU". Fica centralizado aqui porque sao quatro metodos mexendo
   * em tres elementos: espalhar a conta pelos quatro e' garantir que um caminho
   * qualquer esqueca de desligar.
   */
  private sincronizarVeu(): void {
    const aberta = [this.menu, this.pausa, this.fim].some((el) => !el.classList.contains('hidden'));
    document.body.classList.toggle('tela-aberta', aberta);

    // Fechou tudo: o botao que acabou de ser clicado nao pode ficar com o foco.
    // Com ele focado, o ESPACO do primeiro salto apertaria o JOGAR de novo — e
    // e' o que deixa o Input tratar "foco num controle" como "a tecla e' dele".
    if (!aberta && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  mostrarMenu(visivel: boolean): void {
    this.menu.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  mostrarPausa(visivel: boolean): void {
    this.pausa.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  mostrarFim(vencedorEhVoce: boolean, home: number, away: number): void {
    this.tituloDoFim.textContent = vencedorEhVoce ? 'VOCE VENCEU' : 'CPU VENCEU';
    this.tituloDoFim.classList.toggle('away', !vencedorEhVoce);
    this.placarDoFim.textContent = `PLACAR FINAL ${home} x ${away}`;
    this.fim.classList.remove('hidden');
    this.sincronizarVeu();
  }

  esconderFim(): void {
    this.fim.classList.add('hidden');
    this.sincronizarVeu();
  }
}
