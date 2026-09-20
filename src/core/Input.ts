/**
 * Teclado e mouse. O jogo so' le' estado daqui; nada de listener espalhado.
 *
 * O pointer lock vale em UM lugar so', e a divisao explica o resto do arquivo.
 * Dentro da quadra a mira e' um ponto no CHAO, resolvido pela posicao ABSOLUTA
 * do cursor: travar o cursor ali so' atrapalharia. Fora da quadra nao ha' mira
 * nenhuma, e a camera gira com o movimento RELATIVO — ali travar e' o unico
 * jeito de girar sem fim, porque cursor solto para de andar na borda da tela.
 *
 * Por isso `pointerX/Y` (absoluto, pra mira) e `arrasteX/Y` (relativo, pra
 * camera) convivem: sao duas perguntas diferentes, nao duas versoes da mesma.
 *
 * O que ficou, e por que:
 *
 * - teclas por `event.code`, nunca por `key`: `key` muda com o layout, e num
 *   teclado ABNT ou AZERTY o WASD iria parar em outro lugar;
 * - `blur` e `visibilitychange` zeram TUDO. Sem isso, trocar de aba com a tecla
 *   apertada deixa o atleta correndo sozinho ate' a volta;
 * - `contextmenu` bloqueado: o botao direito e' o ataque forcado.
 */
/**
 * O foco esta' num controle de formulario?
 *
 * Botao, campo, radio, slider — qualquer coisa que o navegador ja' saiba
 * operar pelo teclado. Enquanto o jogo roda nada disso tem foco (o Screens
 * solta o botao assim que a ultima tela fecha), entao em quadra isto e' sempre
 * falso e nao custa nada.
 */
function focoEmControle(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLButtonElement || a instanceof HTMLInputElement
      || a instanceof HTMLSelectElement || a instanceof HTMLTextAreaElement;
}

export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();

  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();

  /** Posicao do ponteiro em pixels de tela. E' o que a mira projeta no chao. */
  pointerX = 0;
  pointerY = 0;
  /** Falso ate' o primeiro movimento: antes disso a mira usa o alvo padrao. */
  pointerMoved = false;

  /**
   * Quanto o ponteiro andou NESTE quadro, em pixels.
   *
   * Acumulado e zerado no `endFrame`, e nao lido do ultimo evento: um quadro
   * pode receber varios `mousemove`, e pegar so' o ultimo joga fora movimento
   * — a camera gira menos do que a mao andou, e o arrasto fica pesado.
   *
   * Com o ponteiro TRAVADO vem de `movementX/Y`, que e' o movimento cru do
   * mouse e continua chegando depois que o cursor "encostaria" na borda. Solto,
   * vem da diferenca de `clientX/Y`, que e' o que sobra quando o navegador
   * recusa a captura.
   */
  arrasteX = 0;
  arrasteY = 0;

  /**
   * Roda do mouse neste quadro, em PIXELS. Positivo = pra baixo (afastar).
   *
   * Pixels, e nao entalhes. Contar `Math.sign` por evento trata igual o clique
   * seco de um mouse de roda e o deslize continuo de um trackpad — e o trackpad
   * dispara dezenas de eventos por segundo, entao o zoom atravessaria a faixa
   * inteira num gesto. Em pixels, gesto grande anda muito e gesto pequeno anda
   * pouco, que e' o que a mao pediu nos dois casos.
   */
  roda = 0;

  /** Chamado quando a janela perde o foco — o jogo aproveita pra pausar. */
  onBlur: (() => void) | null = null;

  /**
   * Ha' uma tela aberta (menu, pausa, fim)?
   *
   * O Input nao sabe o que e' partida, e nao devia: quem sabe e' o Game, que
   * escreve aqui uma vez por quadro. O unico uso e' decidir de quem e' o TAB.
   */
  menuAberto = true;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    // Nao roubar atalho do navegador (Ctrl+R, Cmd+T...).
    if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') return;
    if (e.metaKey) return;

    /**
     * Com o foco num controle, a tecla e' DO CONTROLE.
     *
     * E' o mesmo criterio do `onMouseDown`, que so' conta clique no canvas. Sem
     * ele o jogo comia as setas antes de o navegador ver, e o grupo de
     * dificuldade — tres radios — nao andava com o teclado; o ESPACO tambem nao
     * apertava botao nenhum. Um menu que so' funciona com mouse e' um menu
     * quebrado pra metade de quem chega nele.
     */
    if (focoEmControle()) return;

    /**
     * Espaco e setas sao sempre do jogo (pular e correr); o TAB depende.
     *
     * Aberto um menu, o TAB e' do NAVEGADOR: e' o unico jeito de alcancar
     * "CONTINUAR" sem mouse, e travar ali foi exatamente o que aconteceu
     * enquanto o jogo engolia o TAB em qualquer estado. Fechado, ele volta a
     * ser "voltar pra minha quadra".
     */
    if (e.code === 'Space' || e.code.startsWith('Arrow')
        || (e.code === 'Tab' && !this.menuAberto)) e.preventDefault();

    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    /**
     * Travado, o cursor nao anda: `clientX/Y` congelam e so' `movementX/Y`
     * reporta. Sair daqui cedo tambem PRESERVA `pointerX/Y` onde o cursor
     * estava — e' pra la' que ele reaparece ao destravar, e e' de la' que a
     * mira do jogo parte antes do primeiro movimento dentro da quadra.
     */
    if (this.ponteiroTravado) {
      this.arrasteX += e.movementX;
      this.arrasteY += e.movementY;
      return;
    }

    this.arrasteX += e.clientX - this.pointerX;
    this.arrasteY += e.clientY - this.pointerY;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;

    // O primeiro movimento nao e' arrasto: e' o cursor aparecendo. Sem isto o
    // salto de (0,0) ate' onde o mouse estava vira um giro de tela inteira.
    if (!this.pointerMoved) {
      this.arrasteX = 0;
      this.arrasteY = 0;
    }
    this.pointerMoved = true;
  };

  private onMouseDown = (e: MouseEvent): void => {
    // So' conta clique no canvas: botao de HUD nao pode virar toque na bola.
    if (e.target !== this.canvas) return;
    this.buttons.add(e.button);
    this.buttonsPressed.add(e.button);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private onWheel = (e: WheelEvent): void => {
    // `preventDefault` exige passive:false. Sem ele, a roda rola a pagina atras
    // do canvas em vez de aproximar a camera.
    e.preventDefault();

    // `deltaMode` diz em que unidade o navegador mandou: 0 pixels, 1 linhas,
    // 2 paginas. Firefox usa linhas onde o Chrome usa pixels — sem converter,
    // o mesmo gesto zooma 16 vezes menos num dos dois.
    const porUnidade = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.roda += e.deltaY * porUnidade;
  };

  private onContextMenu = (e: Event): void => { e.preventDefault(); };

  private onWindowBlur = (): void => {
    this.clearAll();
    this.onBlur?.();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.clearAll();
      this.onBlur?.();
    }
  };

  private clearAll(): void {
    this.keys.clear();
    this.buttons.clear();
    this.pressedThisFrame.clear();
    this.buttonsPressed.clear();
    this.arrasteX = 0;
    this.arrasteY = 0;
    this.roda = 0;
  }

  /** O navegador esta' com o cursor capturado pelo canvas? */
  get ponteiroTravado(): boolean { return document.pointerLockElement === this.canvas; }

  /**
   * Pede a captura do cursor. Pode falhar, e falhar e' normal.
   *
   * O navegador so' concede depois de um gesto do usuario, recusa por um
   * segundo depois de um Esc, e nem existe em alguns contextos. Nenhum desses
   * casos e' erro: quem chama tem que continuar funcionando sem a captura — por
   * isso a promessa e' engolida, e nao propagada.
   */
  travarPonteiro(): void {
    if (this.ponteiroTravado) return;

    try {
      // `unadjustedMovement` tira a aceleracao do mouse do sistema, que e' o
      // que faz um giro de camera responder diferente do que a mao fez. So' o
      // Chrome tem; onde nao houver, a chamada cai no pedido simples.
      const pedido = this.canvas.requestPointerLock({ unadjustedMovement: true }) as unknown;
      if (pedido instanceof Promise) {
        pedido.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* sem captura */ } });
      }
    } catch {
      /* sem captura: o arrasto com botao ainda gira a camera */
    }
  }

  destravarPonteiro(): void {
    if (this.ponteiroTravado) document.exitPointerLock();
  }

  isDown(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressedThisFrame.has(code); }
  isMouseDown(button: number): boolean { return this.buttons.has(button); }
  wasMousePressed(button: number): boolean { return this.buttonsPressed.has(button); }

  /** Chamar no fim de cada quadro: zera os eventos de "aconteceu agora". */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.buttonsPressed.clear();
    this.arrasteX = 0;
    this.arrasteY = 0;
    this.roda = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
