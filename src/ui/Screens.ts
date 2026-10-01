import { STORAGE_KEY } from '../config';
import {
  DEFINICAO, ETAPAS, NOMES_DAS_RODADAS, adversarioAtual,
  type Carreira, type Desfecho, type Etapa, type Torneio,
} from '../match/Circuito';
import type { Personagem } from '../match/personagens';
import { chip, el, icone } from './dom';
import { EVENTO_DE_PASSO, Navegacao, type Passo } from './navegacao';
import { desenharCarreira, desenharChave, desenharEtapas } from './TelaCircuito';
import { TelaElenco } from './TelaElenco';
import { TelaJogador } from './TelaJogador';
import { desenharRetrato } from './retratos';
import { VISUAL_PADRAO, type Visual } from '../players/corpos';

export type Dificuldade = 'facil' | 'normal' | 'dificil';

/**
 * Onde se joga.
 *
 * `areia` e' a quadra desenhada por codigo, que o jogo sempre teve. `quadra` e'
 * a pele de modelo por cima do MESMO campo — muda o desenho, nao as medidas.
 */
export type Cenario = 'areia' | 'quadra' | 'estadio';

export interface Ajustes {
  dificuldade: Dificuldade;
  cenario: Cenario;
  /** Escala de resolucao, de 0.5 a 1 — ou `auto`, que o jogo ajusta sozinho. */
  resolucao: number | 'auto';
}

const PADRAO: Ajustes = { dificuldade: 'normal', cenario: 'areia', resolucao: 'auto' };

const rotuloDaResolucao = (v: number | 'auto'): string => (v === 'auto' ? 'AUTO' : `${Math.round(v * 100)}%`);

/** O que o menu mostra da carreira: o perfil e o bloco do circuito. */
export interface Progresso {
  carreira: Carreira;
  torneio: Torneio | null;
}

/** O placar da pausa, visto do SEU lado. */
export interface PlacarDaPausa {
  voce: number;
  ele: number;
  adversario: string;
  /** "AMISTOSO", ou a etapa e a rodada do circuito. */
  rotulo: string;
}

/**
 * Uma opcao da tela AJUSTES: os valores em ordem, e como cada um se le'.
 *
 * Seletor de setas e nao lista: sao poucas escolhas curtas, e o seletor e' o
 * que anda com o teclado sem virar um formulario. A ajuda muda com o VALOR
 * quando o valor muda o jogo (cenario), e e' uma so' quando nao muda.
 */
interface Opcao {
  chave: keyof Ajustes;
  nome: string;
  valores: readonly (string | number)[];
  rotulo: (v: string | number) => string;
  ajuda: (v: string | number) => string;
}

const NOME_DA_DIFICULDADE: Record<Dificuldade, string> = { facil: 'FACIL', normal: 'NORMAL', dificil: 'DIFICIL' };
const NOME_DO_CENARIO: Record<Cenario, string> = { areia: 'AREIA', quadra: 'QUADRA', estadio: 'ESTADIO' };

const OPCOES: readonly Opcao[] = [
  {
    chave: 'dificuldade',
    nome: 'DIFICULDADE',
    valores: ['facil', 'normal', 'dificil'],
    rotulo: (v) => NOME_DA_DIFICULDADE[v as Dificuldade],
    ajuda: () => 'Vale pro amistoso contra a CPU. Contra um personagem do elenco, valem as notas dele — e no circuito, sempre as notas.',
  },
  {
    chave: 'cenario',
    nome: 'CENARIO',
    valores: ['areia', 'quadra', 'estadio'],
    rotulo: (v) => NOME_DO_CENARIO[v as Cenario],
    ajuda: (v) => ({
      areia: 'A praia com tres quadras. Da\' pra sair da sua, andar pela areia e assistir as outras.',
      quadra: 'Uma quadra so\', modelada, com piso e rede de verdade.',
      estadio: 'A quadra no meio de um estadio, com torcida nas arquibancadas.',
    } as Record<string, string>)[v as string] + ' No circuito, cada etapa tem o seu.',
  },
  {
    chave: 'resolucao',
    nome: 'RESOLUCAO',
    valores: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 'auto'],
    rotulo: (v) => rotuloDaResolucao(v as number | 'auto'),
    ajuda: (v) => (v === 'auto'
      ? 'O jogo escolhe sozinho, entre 50% e 100%: baixa quando o quadro pesa e sobe quando sobra. O F3 mostra a escala do momento.'
      : 'Menos resolucao, mais quadros por segundo. Vale na hora — o F3 mostra a diferenca.'),
  },
];

function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao encontrado`);
  return el as T;
}

/**
 * Menu, sub-telas, pausa, fim de jogo e as opcoes.
 *
 * Tudo em DOM. Os ajustes vao pro localStorage — e' um jogo de navegador, e
 * quem escolheu "dificil" nao devia escolher de novo a cada aba nova.
 *
 * Duas familias de tela. As do JOGO (menu, circuito, chave, adversarios,
 * pausa, fim) abrem e fecham por ordem do `Game`, que sabe o estado. As
 * SUB-TELAS (ajustes, como jogar) sao so' daqui: abrem por cima de quem as
 * chamou, e o VOLTAR devolve a ela — o Game nem fica sabendo.
 */
export class Screens {
  private raiz = elemento('screens');
  private menu = elemento('menu');
  private pausa = elemento('pause');
  private fim = elemento('gameover');
  private tituloDoFim = elemento('go-titulo');
  private rotuloDoFim = elemento('go-rotulo');
  private placarDoFim = elemento('go-placar');
  private extraDoFim = elemento('go-extra');
  private botaoDeNovo = elemento('btn-denovo');
  private botaoDoCircuito = elemento('btn-go-circuito');
  private botaoDoMenu = elemento('btn-fim-menu');
  private placarDaPausa = elemento('pausa-placar');

  private circuito = elemento('circuito');
  private carreira = elemento('carreira');
  private etapas = elemento('etapas');
  private chave = elemento('chave');
  private chaveTitulo = elemento('chave-titulo');
  private chaveRodada = elemento('chave-rodada');
  private chaveArvore = elemento('chave-arvore');
  private chaveProximo = elemento('chave-proximo');
  private elenco = elemento('elenco');
  private jogador = elemento('jogador');
  private retratoDoBloco = elemento('tile-jogador-retrato');
  private telaJogador = new TelaJogador(
    elemento('criador-opcoes'),
    elemento('criador-aviso'),
    (v) => this.aoMudarJogador?.(v),
  );
  private telaElenco = new TelaElenco(
    elemento('elenco-abas'),
    elemento('elenco-lista'),
    elemento('elenco-ficha'),
    (p) => this.aoDesafiar?.(p),
  );

  private perfil = elemento('perfil');
  private descDoAmistoso = elemento('tile-amistoso-desc');
  private descDosAjustes = elemento('tile-ajustes-desc');
  private statusDoCircuito = elemento('tile-circuito-status');
  private ajudaDasOpcoes = elemento('opcoes-ajuda');
  private linhasDasOpcoes = new Map<keyof Ajustes, () => void>();

  /** A sub-tela aberta, e a tela que ela cobriu. */
  private subtela: { tela: HTMLElement; origem: HTMLElement; botao: HTMLElement | null } | null = null;

  private readonly telas: HTMLElement[];
  /** A tela aberta da ultima vez, pra saber qual acabou de fechar. */
  private abertaAntes: HTMLElement | null = null;
  private readonly nav: Navegacao;

  ajustes: Ajustes = { ...PADRAO };

  /** De onde o menu le' a carreira. O Game liga; sem ele, o perfil some. */
  progresso: (() => Progresso) | null = null;
  /** O seu corpo, do criador: o retrato do perfil e do VS. O Game liga. */
  meuVisual: () => Visual = () => VISUAL_PADRAO;

  /** AMISTOSO no menu: contra a CPU sem nome, na dificuldade escolhida. */
  aoJogar: (() => void) | null = null;
  /** JOGAR DE NOVO no fim do amistoso: o mesmo adversario de antes. */
  aoJogarDeNovo: (() => void) | null = null;
  aoContinuar: (() => void) | null = null;
  aoSair: (() => void) | null = null;
  /** MENU PRINCIPAL no fim do amistoso. */
  aoIrProMenu: (() => void) | null = null;
  aoMudarAjustes: ((ajustes: Ajustes) => void) | null = null;

  /** Abriu a tela do circuito, pelo menu. */
  aoAbrirCircuito: (() => void) | null = null;
  /** Escolheu uma etapa: comeca um torneio, ou continua o que esta' andando. */
  aoEscolherEtapa: ((etapa: Etapa) => void) | null = null;
  aoAbandonarTorneio: (() => void) | null = null;
  /** Na chave: vai pra quadra jogar a proxima. */
  aoJogarPartidaDoCircuito: (() => void) | null = null;
  /** Depois do fim de uma partida do circuito: de volta pra chave. */
  aoSeguirNoCircuito: (() => void) | null = null;
  /** Saiu da tela do circuito pro menu principal. */
  aoVoltarDoCircuito: (() => void) | null = null;

  /** Abriu a tela de adversarios, pelo menu. */
  aoAbrirElenco: (() => void) | null = null;
  aoVoltarDoElenco: (() => void) | null = null;
  /** DESAFIAR na ficha: amistoso contra aquele personagem. */
  aoDesafiar: ((p: Personagem) => void) | null = null;

  /** MEU JOGADOR: abriu o criador, mudou uma escolha, girou o boneco, voltou. */
  aoAbrirJogador: (() => void) | null = null;
  aoMudarJogador: ((v: Visual) => void) | null = null;
  aoGirarJogador: ((radianos: number) => void) | null = null;
  aoVoltarDoJogador: (() => void) | null = null;

  constructor() {
    this.telas = [...this.raiz.querySelectorAll<HTMLElement>('.tela')];
    this.nav = new Navegacao(this.raiz, () => this.telaAberta());
    this.carregar();
    this.montarOpcoes();
    this.montarControles();

    const ligar = (id: string, fazer: () => void): void => {
      elemento(id).addEventListener('click', fazer);
    };
    ligar('btn-jogar', () => this.aoJogar?.());
    ligar('btn-voltar', () => this.aoContinuar?.());
    ligar('btn-sair', () => this.aoSair?.());
    ligar('btn-denovo', () => this.aoJogarDeNovo?.());
    ligar('btn-fim-menu', () => this.aoIrProMenu?.());
    ligar('btn-adversarios', () => this.aoAbrirElenco?.());
    ligar('btn-elenco-voltar', () => this.aoVoltarDoElenco?.());
    ligar('btn-circuito', () => this.aoAbrirCircuito?.());
    ligar('btn-circuito-voltar', () => this.aoVoltarDoCircuito?.());
    ligar('btn-chave-jogar', () => this.aoJogarPartidaDoCircuito?.());
    ligar('btn-chave-voltar', () => this.aoAbrirCircuito?.());
    ligar('btn-go-circuito', () => this.aoSeguirNoCircuito?.());
    ligar('btn-jogador', () => this.aoAbrirJogador?.());
    ligar('btn-jogador-voltar', () => this.aoVoltarDoJogador?.());
    ligar('btn-jogador-sortear', () => this.telaJogador.sortear());
    this.ligarGiroDoBoneco();

    // As sub-telas: quem as abre diz qual, e o VOLTAR de dentro devolve.
    for (const botao of this.raiz.querySelectorAll<HTMLElement>('[data-tela]')) {
      botao.addEventListener('click', () => this.abrirSubtela(botao.dataset.tela!, botao));
    }
    for (const id of ['ajustes', 'comojogar']) {
      elemento(id).querySelector('[data-voltar]')?.addEventListener('click', () => this.voltarDaSubtela());
    }

    // Q/E giram de 45 graus: tres toques e o boneco esta' de costas.
    this.nav.registrar('jogador', {
      KeyQ: () => this.aoGirarJogador?.(-Math.PI / 4),
      KeyE: () => this.aoGirarJogador?.(Math.PI / 4),
      KeyR: () => this.telaJogador.sortear(),
    });
    this.nav.registrar('elenco', {
      KeyQ: () => this.telaElenco.trocarEtapa(-1),
      KeyE: () => this.telaElenco.trocarEtapa(1),
    });
    // O R do "jogar de novo" mora aqui, e nao no laco do jogo: com o botao em
    // foco o `Input` ignora teclas, e o R ficava mudo justamente quando o
    // botao que ele aperta estava selecionado.
    this.nav.registrar('gameover', {
      KeyR: () => { if (!this.botaoDeNovo.classList.contains('hidden')) this.botaoDeNovo.click(); },
    });

    this.sincronizarVeu();
  }

  // ---------------------------------------------------------------- ajustes

  private aplicar(): void {
    this.salvar();
    this.atualizarMenu();
    this.aoMudarAjustes?.(this.ajustes);
  }

  private carregar(): void {
    try {
      const cru = localStorage.getItem(STORAGE_KEY);
      if (cru) Object.assign(this.ajustes, JSON.parse(cru) as Partial<Ajustes>);
      // Um numero que nao e' escala (save mexido a mao) nao pode virar tela de 0 pixel.
      const r = this.ajustes.resolucao;
      if (r !== 'auto' && !(typeof r === 'number' && r >= 0.5 && r <= 1)) this.ajustes.resolucao = PADRAO.resolucao;
    } catch {
      // localStorage pode estar bloqueado (aba anonima, cookies desligados).
      // Nao ter os ajustes salvos nao e' motivo pra nao abrir o jogo.
    }
  }

  private salvar(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.ajustes));
    } catch {
      // idem
    }
  }

  /**
   * As linhas da tela AJUSTES.
   *
   * O estado e' `this.ajustes` e mais nada: a linha so' DESENHA o valor atual e
   * pede o proximo. Nao ha' um "qual esta' marcado" guardado no DOM pra
   * discordar do que vai pro localStorage.
   */
  private montarOpcoes(): void {
    const lista = elemento('opcoes');
    lista.replaceChildren(...OPCOES.map((o, i) => {
      const linha = el('div', 'opcao');
      linha.tabIndex = 0;
      linha.dataset.opcao = o.chave;
      linha.style.setProperty('--i', String(i));
      linha.setAttribute('role', 'group');
      linha.setAttribute('aria-label', o.nome);

      const valor = el('span', 'seletor-valor');
      const pontos = el('span', 'seletor-pontos');
      const seta = (passo: number, nome: string): HTMLButtonElement => {
        const b = el('button', 'seletor-seta');
        b.type = 'button';
        b.tabIndex = -1;
        b.setAttribute('aria-label', passo < 0 ? 'anterior' : 'proximo');
        b.append(icone(nome));
        b.addEventListener('click', (e) => { e.stopPropagation(); andar(passo, false); });
        return b;
      };
      const seletor = el('div', 'seletor');
      seletor.append(seta(-1, 'esq'), valor, seta(1, 'dir'));
      linha.append(el('span', 'opcao-nome', o.nome), seletor, pontos);

      const desenhar = (): void => {
        const atual = this.ajustes[o.chave];
        const idx = Math.max(0, o.valores.indexOf(atual));
        valor.textContent = o.rotulo(atual);
        pontos.replaceChildren(...o.valores.map((_, j) => el('i', j === idx ? 'ativo' : '')));
        if (document.activeElement === linha) this.ajudaDasOpcoes.textContent = o.ajuda(atual);
      };

      /** Setas param nas pontas; Enter e clique dao a volta. */
      const andar = (passo: number, darAVolta: boolean): void => {
        const n = o.valores.length;
        const idx = Math.max(0, o.valores.indexOf(this.ajustes[o.chave]));
        const proximo = darAVolta ? (idx + passo + n) % n : Math.max(0, Math.min(n - 1, idx + passo));
        if (proximo === idx) return;
        (this.ajustes as unknown as Record<string, string | number>)[o.chave] = o.valores[proximo]!;
        desenhar();
        this.aplicar();
      };

      linha.addEventListener(EVENTO_DE_PASSO, (e) => andar((e as CustomEvent<Passo>).detail.passo, false));
      linha.addEventListener('click', () => andar(1, true));
      linha.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); andar(1, true); }
      });
      linha.addEventListener('focus', () => { this.ajudaDasOpcoes.textContent = o.ajuda(this.ajustes[o.chave]); });

      this.linhasDasOpcoes.set(o.chave, desenhar);
      desenhar();
      return linha;
    }));
    this.ajudaDasOpcoes.textContent = 'Escolha uma opcao pra ver o que ela muda.';
  }

  /**
   * COMO JOGAR mostra as mesmas teclas da faixa do HUD — copiadas dela, e nao
   * escritas de novo: duas listas de teclas a mao sao uma lista certa e outra
   * que ficou pra tras.
   */
  private montarControles(): void {
    const alvo = elemento('controles');
    for (const grupo of elemento('manual').querySelectorAll('.grupo-teclas')) {
      alvo.append(grupo.cloneNode(true));
    }
  }

  // ------------------------------------------------------------ o menu

  /**
   * O perfil e os textos dos blocos. Barato, entao roda toda vez que o menu
   * aparece: a carreira mudou no torneio, os ajustes mudaram na sub-tela.
   */
  private atualizarMenu(): void {
    const { dificuldade, cenario, resolucao } = this.ajustes;
    this.descDoAmistoso.textContent =
      `Contra a CPU · ${NOME_DA_DIFICULDADE[dificuldade]} · ${NOME_DO_CENARIO[cenario]}`;
    this.descDosAjustes.textContent =
      `${NOME_DA_DIFICULDADE[dificuldade]} · ${NOME_DO_CENARIO[cenario]} · ${rotuloDaResolucao(resolucao)}`;
    this.retratoDoBloco.replaceChildren(desenharRetrato(this.meuVisual(), 'carta'));

    const p = this.progresso?.();
    this.perfil.classList.toggle('hidden', !p);
    if (!p) return;
    const c = p.carreira;
    const titulos = ETAPAS.reduce((n, e) => n + c.titulos[e], 0);

    const retrato = el('div', 'perfil-retrato');
    retrato.append(desenharRetrato(this.meuVisual(), 'rosto'));
    const numeros = el('div', 'perfil-numeros');
    for (const [rotulo, valor] of [['RANKING', c.ranking], ['TITULOS', titulos], ['V-D', `${c.vitorias}-${c.derrotas}`]] as const) {
      const n = el('span', '', rotulo);
      n.append(el('b', '', String(valor)));
      numeros.append(n);
    }
    this.perfil.replaceChildren(retrato, el('span', 'perfil-nome', 'VOCE'), numeros);

    const t = p.torneio;
    if (t && !t.eliminado && !t.campeao) {
      this.statusDoCircuito.replaceChildren(
        chip(`CONTINUAR · ${DEFINICAO[t.etapa].nome} · ${NOMES_DAS_RODADAS[t.rodada]}`, '', 'play'));
    } else if (titulos > 0) {
      this.statusDoCircuito.replaceChildren(chip(`${titulos} ${titulos === 1 ? 'TITULO' : 'TITULOS'}`, 'escuro', 'trofeu'));
    } else {
      this.statusDoCircuito.replaceChildren(chip('COMECE PELO MUNICIPAL', 'escuro', 'play'));
    }
  }

  // ---------------------------------------------------------- sub-telas

  private abrirSubtela(id: string, botao: HTMLElement | null): void {
    const tela = elemento(id);
    const origem = this.telaAberta();
    if (!origem || origem === tela) return;
    origem.classList.add('hidden');
    tela.classList.remove('hidden');
    this.subtela = { tela, origem, botao };
    // A migalha diz de onde se veio: COMO JOGAR abre do menu e da pausa.
    const migalha = tela.querySelector('.migalha');
    if (migalha) migalha.textContent = origem === this.pausa ? 'PAUSA' : 'MENU';
    tela.scrollTop = 0;
    this.sincronizarVeu();
  }

  private voltarDaSubtela(): void {
    const s = this.subtela;
    if (!s) return;
    this.subtela = null;
    s.tela.classList.add('hidden');
    s.origem.classList.remove('hidden');
    if (s.origem === this.menu) this.atualizarMenu();
    this.sincronizarVeu();
    // A selecao volta pro bloco que abriu a sub-tela, e nao pro comeco.
    s.botao?.focus({ preventScroll: true });
  }

  /** Fechar uma tela do jogo fecha a sub-tela que estiver por cima dela. */
  private fecharSubtelaDe(origem: HTMLElement): void {
    if (this.subtela?.origem !== origem) return;
    this.subtela.tela.classList.add('hidden');
    this.subtela = null;
  }

  // ----------------------------------------------------------- o veu

  /** A tela de cima. Uma de cada vez: sub-tela esconde quem ela cobre. */
  private telaAberta(): HTMLElement | null {
    return this.telas.find((t) => !t.classList.contains('hidden')) ?? null;
  }

  /**
   * Marca no <body> que ha' uma tela aberta, pro CSS apagar o HUD e acender o
   * veu. Centralizado aqui porque sao muitos caminhos mexendo em muitas telas,
   * e espalhar a conta e' garantir que um caminho qualquer esqueca de
   * desligar.
   */
  private sincronizarVeu(atraso?: number): void {
    const aberta = this.telaAberta();
    document.body.classList.toggle('tela-aberta', aberta !== null);
    // No criador o veu sai: o boneco e' o assunto da tela, e o escuro por cima
    // dele escondia justamente a cor que se esta' escolhendo.
    document.body.classList.toggle('veu-livre', aberta === this.jogador);
    if (this.abertaAntes && this.abertaAntes !== aberta) this.nav.aoFechar(this.abertaAntes);
    this.abertaAntes = aberta;

    // Fechou tudo: o botao que acabou de ser clicado nao pode ficar com o foco.
    // Com ele focado, o ESPACO do primeiro salto apertaria o JOGAR de novo — e
    // e' o que deixa o Input tratar "foco num controle" como "a tecla e' dele".
    if (!aberta) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    // Foco que ficou numa tela que fechou nao serve mais pra nada.
    if (document.activeElement instanceof HTMLElement && !aberta.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this.nav.aoAbrir(aberta, atraso);
  }

  // ----------------------------------------------------- telas do jogo

  mostrarMenu(visivel: boolean): void {
    if (!visivel) this.fecharSubtelaDe(this.menu);
    if (visivel) this.atualizarMenu();
    this.menu.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  /** A pausa, com o placar de quem esta' jogando. `null` e' quem esta' na areia. */
  mostrarPausa(visivel: boolean, placar: PlacarDaPausa | null = null): void {
    if (!visivel) this.fecharSubtelaDe(this.pausa);
    if (visivel) {
      if (placar) {
        const linha = (classe: string, nome: string, pontos: number): HTMLElement => {
          const l = el('div', `pausa-linha ${classe}`);
          l.append(el('span', 'n', nome), el('span', '', String(pontos)));
          return l;
        };
        this.placarDaPausa.replaceChildren(
          el('span', 'pausa-meta', placar.rotulo),
          linha('home', 'VOCE', placar.voce),
          linha('away', placar.adversario, placar.ele),
        );
      } else {
        this.placarDaPausa.replaceChildren();
      }
    }
    this.pausa.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  /**
   * O texto do botao de sair da pausa muda no circuito, e diz o preco.
   *
   * Sair no meio de uma partida de torneio conta como derrota — senao bastaria
   * pausar e sair toda vez que o placar apertasse. Um botao que custa uma
   * eliminacao tem que dizer isso ANTES de ser apertado.
   */
  rotuloDeSair(noCircuito: boolean): void {
    elemento('btn-sair').textContent = noCircuito ? 'DESISTIR (CONTA COMO DERROTA)' : 'SAIR PRO MENU';
  }

  /** O placar grande do fim: VOCE x ELE, o vencedor aceso. */
  private desenharPlacarDoFim(voce: number, ele: number, adversario: string): void {
    const venci = voce > ele;
    this.placarDoFim.replaceChildren(
      el('span', 'fim-nome home', 'VOCE'),
      el('span', `fim-num ${venci ? '' : 'perdeu'}`, String(voce)),
      el('span', 'fim-traco'),
      el('span', `fim-num ${venci ? 'perdeu' : ''}`, String(ele)),
      el('span', 'fim-nome away', adversario),
    );
  }

  private abrirFim(tipo: 'vitoria' | 'derrota' | 'campeao'): void {
    this.fim.classList.toggle('derrota', tipo === 'derrota');
    this.fim.classList.toggle('campeao', tipo === 'campeao');
    this.fim.querySelector('.confete')?.remove();
    if (tipo === 'campeao') this.fim.prepend(confete());
    this.fim.classList.remove('hidden');
    this.sincronizarVeu(700);
  }

  /** O fim de um amistoso. O placar vem do SEU lado: voce pode jogar fora de casa. */
  mostrarFim(vencedorEhVoce: boolean, voce: number, ele: number, adversario = 'CPU'): void {
    this.rotuloDoFim.textContent = `AMISTOSO CONTRA ${adversario}`;
    this.tituloDoFim.textContent = vencedorEhVoce ? 'VITORIA' : 'DERROTA';
    this.desenharPlacarDoFim(voce, ele, adversario);
    this.extraDoFim.classList.add('hidden');
    this.botaoDeNovo.classList.remove('hidden');
    this.botaoDoMenu.classList.remove('hidden');
    this.botaoDoCircuito.classList.add('hidden');
    this.abrirFim(vencedorEhVoce ? 'vitoria' : 'derrota');
  }

  /**
   * O fim de uma partida do CIRCUITO.
   *
   * Nao ha' "jogar de novo" aqui, e isso e' regra, nao esquecimento: repetir a
   * partida que se perdeu apagaria a derrota, e um torneio onde perder nao
   * custa nada nao e' torneio. Nem MENU: o unico caminho e' seguir — pra
   * proxima rodada, ou pra fora dela.
   */
  mostrarFimDoCircuito(
    adversario: string,
    voce: number,
    ele: number,
    desfecho: Desfecho,
    etapa: Etapa,
  ): void {
    const titulos = { avancou: 'VITORIA', eliminado: 'ELIMINADO', campeao: 'CAMPEAO!' } as const;
    this.rotuloDoFim.textContent = `CIRCUITO · ${DEFINICAO[etapa].nome}`;
    this.tituloDoFim.textContent = titulos[desfecho.tipo];
    this.desenharPlacarDoFim(voce, ele, adversario);

    const chips: HTMLElement[] = [];
    if (desfecho.pontosGanhos > 0) chips.push(chip(`+${desfecho.pontosGanhos} PONTOS DE RANKING`, 'ouro', 'estrela'));
    if (desfecho.tipo === 'campeao') chips.push(chip(`CAMPEAO DO ${DEFINICAO[etapa].nome}`, '', 'trofeu'));
    if (desfecho.liberou) chips.push(chip(`${DEFINICAO[desfecho.liberou].nome} LIBERADO`, '', 'play'));
    chips.forEach((c, i) => c.style.setProperty('--i', String(i)));
    this.extraDoFim.replaceChildren(...chips);
    this.extraDoFim.classList.toggle('hidden', chips.length === 0);

    this.botaoDoCircuito.textContent = desfecho.tipo === 'avancou' ? 'PROXIMA RODADA' : 'VOLTAR AO CIRCUITO';
    this.botaoDeNovo.classList.add('hidden');
    this.botaoDoMenu.classList.add('hidden');
    this.botaoDoCircuito.classList.remove('hidden');
    this.abrirFim(desfecho.tipo === 'eliminado' ? 'derrota' : desfecho.tipo === 'campeao' ? 'campeao' : 'vitoria');
  }

  mostrarCircuito(visivel: boolean, carreira?: Carreira, torneio?: Torneio | null): void {
    if (visivel && carreira) {
      desenharCarreira(this.carreira, carreira);
      desenharEtapas(
        this.etapas, carreira, torneio ?? null,
        (e) => this.aoEscolherEtapa?.(e),
        () => this.aoAbandonarTorneio?.(),
      );
    }
    this.circuito.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  mostrarChave(visivel: boolean, torneio?: Torneio, carreira?: Carreira): void {
    if (visivel && torneio) {
      desenharChave(this.chaveArvore, this.chaveProximo, this.chaveTitulo, this.chaveRodada, torneio, this.meuVisual(), carreira);
      // Sem adversario (campeao ou eliminado) nao ha' partida pra jogar.
      elemento('btn-chave-jogar').classList.toggle('hidden', adversarioAtual(torneio) === null);
    }
    this.chave.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  /** A tela ADVERSARIOS. A carreira entra pro retrospecto de cada ficha. */
  mostrarElenco(visivel: boolean, carreira?: Carreira): void {
    if (visivel && carreira) this.telaElenco.mostrar(carreira);
    this.elenco.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  /** MEU JOGADOR. Quem posa e' o Game; daqui sai so' a lista de escolhas. */
  mostrarJogador(visivel: boolean, v?: Visual): void {
    if (visivel && v) this.telaJogador.mostrar(v);
    this.jogador.classList.toggle('hidden', !visivel);
    this.sincronizarVeu();
  }

  /**
   * Arrastar na metade vazia da tela gira o boneco, como um provador de jogo.
   * So' fora do painel: arrastar em cima de uma linha e' clicar nela.
   */
  private ligarGiroDoBoneco(): void {
    let x: number | null = null;
    this.jogador.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('.painel, .rodape, .cabecalho')) return;
      x = e.clientX;
      this.jogador.setPointerCapture(e.pointerId);
    });
    this.jogador.addEventListener('pointermove', (e) => {
      if (x === null) return;
      this.aoGirarJogador?.((e.clientX - x) * 0.012);
      x = e.clientX;
    });
    const soltar = (): void => { x = null; };
    this.jogador.addEventListener('pointerup', soltar);
    this.jogador.addEventListener('pointercancel', soltar);
  }

  esconderFim(): void {
    this.fim.classList.add('hidden');
    this.fim.querySelector('.confete')?.remove();
    this.sincronizarVeu();
  }
}

/**
 * O confete do campeao: tirinhas nas cores do festival, caindo em loop.
 *
 * Atraso NEGATIVO em cada uma: a tela abre com o ar ja' cheio, e nao com todas
 * nascendo juntas no alto como uma cortina.
 */
function confete(): HTMLElement {
  const cores = ['#ff2e88', '#ff9e1f', '#ffcf3f', '#29e7ff', '#ffffff', '#8a5cff'];
  const caixa = el('div', 'confete');
  for (let i = 0; i < 44; i++) {
    const t = el('i');
    const d = 2.6 + Math.random() * 2.2;
    t.style.left = `${Math.random() * 100}%`;
    t.style.setProperty('--c', cores[i % cores.length]!);
    t.style.setProperty('--d', `${d.toFixed(2)}s`);
    t.style.setProperty('--atraso', `${(-Math.random() * d).toFixed(2)}s`);
    t.style.setProperty('--x', `${((Math.random() - 0.5) * 24).toFixed(1)}vw`);
    t.style.setProperty('--r', `${Math.round(360 + Math.random() * 720)}deg`);
    caixa.append(t);
  }
  return caixa;
}
