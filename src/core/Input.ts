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
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
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
  }

  isDown(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressedThisFrame.has(code); }
  isMouseDown(button: number): boolean { return this.buttons.has(button); }
  wasMousePressed(button: number): boolean { return this.buttonsPressed.has(button); }

  /** Chamar no fim de cada quadro: zera os eventos de "aconteceu agora". */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.buttonsPressed.clear();
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
  }
}
