import { CONTROLE_DE_TOQUE } from '../config';
import type { Input } from '../core/Input';
import { lerJoystick, type Eixo } from '../core/joystick';

/**
 * O controle de TOQUE: joystick no polegar esquerdo, botoes no direito.
 *
 * Nao inventa acao nenhuma. Cada botao aperta uma TECLA do teclado
 * (`Input.apertar`), e o joystick escreve o eixo que o teclado ja' somava —
 * quem joga com o dedo passa pelo mesmo `Human` de quem joga com WASD. A mira
 * e a carga nem passam por aqui: o dedo na quadra e' o mouse (ver `Input`).
 *
 * O que fica de fora de proposito:
 *
 * - **Trocar de quadra assistida** (`[`, `]`, `TAB`). E' coisa de quem esta'
 *   passeando com teclado; no celular, andar ate' a quadra e' o caminho.
 * - **O F3.** Medidor de desempenho e' ferramenta de quem desenvolve.
 *
 * O desenho vive dentro do `#hud`, entao some junto com ele nas telas. Mas
 * `opacity: 0` nao impede clique: por isso o CSS tira os botoes do lugar com
 * `body.tela-aberta`, e nao so' deixa eles invisiveis.
 */

function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao encontrado`);
  return el as T;
}

type Contexto = 'quadra' | 'areia';

interface Estado {
  /** Jogando numa quadra, ou andando pela areia. */
  contexto: Contexto;
  /** Na quadra: pode sair (amistoso). Na areia: ha' quadra ao alcance. */
  podeTrocarDeLugar: boolean;
  /** Ja' esta' no enquadramento de longe (tatico)? Decide pra onde a camera vai. */
  cameraLonge: boolean;
}

const _eixo: Eixo = { x: 0, z: 0 };

export class ControleDeToque {
  private raiz = elemento('toque-controles');
  private base = elemento('joystick-base');
  private pino = elemento('joystick-pino');
  private zona = elemento('joystick-zona');
  private botaoLugar = elemento('btn-toque-lugar');

  private dedoDoJoystick: number | null = null;
  private centroX = 0;
  private centroY = 0;

  private contexto: Contexto | null = null;
  private cameraLonge = false;

  constructor(private input: Input) {
    this.zona.addEventListener('pointerdown', this.onJoystickDown);
    window.addEventListener('pointermove', this.onJoystickMove);
    window.addEventListener('pointerup', this.onJoystickUp);
    window.addEventListener('pointercancel', this.onJoystickUp);

    for (const botao of this.raiz.querySelectorAll<HTMLElement>('[data-tecla]')) {
      this.ligarBotao(botao);
    }

    const camera = elemento('btn-toque-camera');
    camera.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Sempre pro OUTRO enquadramento. A roda empurra em pixels; o valor passa
      // da faixa inteira, e o `CameraRig` corta no extremo.
      const sinal = this.cameraLonge ? -1 : 1;
      this.input.roda += sinal * CONTROLE_DE_TOQUE.rodaDoBotaoDeCamera;
    });

    // O Input zerou tudo (perdeu o foco, pausou): o desenho do joystick solta junto.
    this.input.onLimpar = () => this.soltarJoystick();

    // O dedo apareceu: liga o modo de toque inteiro (CSS troca os textos).
    const anterior = this.input.onToque;
    this.input.onToque = () => {
      anterior?.();
      document.body.classList.add('toque');
    };

    /**
     * Comeca ligado onde o ponteiro principal e' grosso (celular, tablet).
     *
     * Esperar o primeiro toque no canvas nao serve: o primeiro toque e' no
     * menu, e o jogador entraria na quadra sem controle nenhum na tela. Um
     * notebook com tela de toque tem ponteiro FINO (o mouse) e fica sem os
     * botoes ate' encostar o dedo no jogo.
     */
    if (window.matchMedia?.('(pointer: coarse)').matches) this.input.marcarToque();
  }

  /**
   * Uma vez por quadro, pelo `Game`. Mostra o que faz sentido onde se esta'.
   *
   * Escreve no DOM so' quando o contexto muda: este metodo roda todo quadro, e
   * mexer em classe todo quadro forca recalculo de estilo a toa.
   */
  atualizar(estado: Estado): void {
    this.cameraLonge = estado.cameraLonge;

    if (estado.contexto !== this.contexto) {
      this.contexto = estado.contexto;
      this.raiz.dataset.contexto = estado.contexto;
      this.botaoLugar.dataset.tecla = estado.contexto === 'quadra' ? 'KeyQ' : 'KeyE';
      this.botaoLugar.textContent = estado.contexto === 'quadra' ? 'SAIR' : 'ENTRAR';
    }
    this.botaoLugar.classList.toggle('hidden', !estado.podeTrocarDeLugar);
  }

  private ligarBotao(botao: HTMLElement): void {
    let teclas: string[] = [];
    let dedo: number | null = null;

    const soltar = (e: PointerEvent): void => {
      if (e.pointerId !== dedo) return;
      dedo = null;
      /**
       * `data-soltar-depois`: a tecla que tem que continuar apertada UM quadro
       * depois das outras.
       *
       * E' o FORCAR. No teclado ele e' o F segurado no instante em que o toque
       * (E) solta, e o `Human` le' os dois nesse quadro. Com o dedo isso pediria
       * uma terceira mao — entao o botao aperta os dois e solta o E primeiro.
       * Dois `requestAnimationFrame` garantem que um quadro do jogo rodou no
       * meio: o laco do jogo tambem vive no rAF, e um so' poderia cair antes
       * dele no mesmo quadro.
       */
      const depois = botao.dataset.soltarDepois;
      for (const t of teclas) if (t !== depois) this.input.soltar(t);
      if (depois && teclas.includes(depois)) {
        requestAnimationFrame(() => requestAnimationFrame(() => this.input.soltar(depois)));
      }
      teclas = [];
      botao.classList.remove('apertado');
    };

    botao.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.marcarToque();
      if (dedo !== null) return;
      dedo = e.pointerId;
      /**
       * As teclas sao lidas NA HORA do toque, e guardadas ate' soltar.
       *
       * O botao de lugar troca de tecla (Q na quadra, E na areia). Lendo de novo
       * ao soltar, um toque que saiu da quadra soltaria o E que nunca apertou e
       * deixaria o Q preso.
       */
      teclas = (botao.dataset.tecla ?? '').split(' ').filter(Boolean);
      for (const t of teclas) this.input.apertar(t);
      botao.classList.add('apertado');
      // Capturar o dedo: escorregar pra fora do botao continua sendo o mesmo
      // toque, e o `pointerup` chega aqui mesmo longe dele.
      try { botao.setPointerCapture(e.pointerId); } catch { /* sem captura, solta no up global */ }
    });
    botao.addEventListener('pointerup', soltar);
    botao.addEventListener('pointercancel', soltar);
    botao.addEventListener('lostpointercapture', soltar);
  }

  /**
   * Joystick FLUTUANTE: nasce onde o polegar encosta.
   *
   * Fixo, ele obrigaria o polegar a achar o centro de olho — e o olho esta' na
   * bola. Flutuando, qualquer ponto da metade esquerda serve de centro, e o
   * primeiro movimento ja' e' a direcao.
   */
  private onJoystickDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.input.marcarToque();
    if (this.dedoDoJoystick !== null) return;
    this.dedoDoJoystick = e.pointerId;
    this.centroX = e.clientX;
    this.centroY = e.clientY;
    this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.pino.style.transform = 'translate(0px, 0px)';
    this.raiz.classList.add('joystick-ativo');
  };

  private onJoystickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dedoDoJoystick) return;
    const raio = CONTROLE_DE_TOQUE.raioDoJoystick;
    const dx = e.clientX - this.centroX;
    const dy = e.clientY - this.centroY;
    lerJoystick(dx, dy, raio, CONTROLE_DE_TOQUE.zonaMorta, _eixo);
    this.input.eixoX = _eixo.x;
    this.input.eixoZ = _eixo.z;

    // O pino para na borda do circulo, mesmo com o polegar alem dela.
    const d = Math.hypot(dx, dy);
    const k = d > raio ? raio / d : 1;
    this.pino.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };

  private onJoystickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dedoDoJoystick) return;
    this.soltarJoystick();
  };

  private soltarJoystick(): void {
    this.dedoDoJoystick = null;
    this.input.eixoX = 0;
    this.input.eixoZ = 0;
    this.raiz.classList.remove('joystick-ativo');
  }
}
