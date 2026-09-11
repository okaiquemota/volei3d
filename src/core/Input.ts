/**
 * Teclado e mouse. O jogo so' le' estado daqui; nada de listener espalhado.
 *
 * Vem do Input do rpk.fps SEM o pointer lock. La' a camera gira com o
 * movimento relativo do mouse, entao capturar o cursor e' obrigatorio — e
 * metade daquele arquivo e' o conserto de quando a captura falha. Aqui a mira
 * e' um ponto no CHAO, resolvido pela posicao absoluta do cursor: travar o
 * cursor so' atrapalharia, e tudo aquilo some.
 *
 * O que ficou, e por que:
 *
 * - teclas por `event.code`, nunca por `key`: `key` muda com o layout, e num
 *   teclado ABNT ou AZERTY o WASD iria parar em outro lugar;
 * - `blur` e `visibilitychange` zeram TUDO. Sem isso, trocar de aba com a tecla
 *   apertada deixa o atleta correndo sozinho ate' a volta;
 * - `contextmenu` bloqueado: o botao direito e' o ataque forcado.
 */
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
   * Isto NAO substitui `pointerX/Y`. A mira continua sendo posicao absoluta:
   * sem pointer lock, um ponto no chao se resolve pelo cursor onde ele esta',
   * nao por quanto ele andou.
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
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
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
