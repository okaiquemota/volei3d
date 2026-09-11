import * as THREE from 'three';
import { ATAQUE, PLAYER } from '../config';
import type { Input } from '../core/Input';
import { oposto } from '../world/Court';
import { Athlete } from './Athlete';
import type { Acao } from './Hitter';

const _frente = new THREE.Vector3();
const _direita = new THREE.Vector3();
const _direcao = new THREE.Vector3();
const _paraABola = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raio = new THREE.Raycaster();
const _planoDoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pontoDoChao = new THREE.Vector3();
const _alvoDoToque = new THREE.Vector3();

/**
 * O jogador humano.
 *
 * Controles:
 *   WASD / setas ......... correr, relativo a' camera
 *   Espaco ............... pular
 *   Mouse ................ mirar (um ponto no CHAO, nao uma direcao)
 *   Clique esq. / E ...... tocar na bola
 *   Clique dir. / Shift .. forcar o ataque por cima da rede
 */
export class Human extends Athlete {
  /** Ultimo ponto mirado, ja' limitado ao campo adversario. */
  readonly pontoDeMira = new THREE.Vector3();

  private bufferDeToque = 0;

  /** Carga do ataque, de 0 a 1. Sobe enquanto o botao esta' segurado. */
  private carga = 0;
  private carregando = false;
  /** Soltou o botao e ainda nao bateu: a intencao vale enquanto o buffer durar. */
  private ataquePendente = false;
  /** Pediu levantamento no botao direito e ainda nao bateu. */
  private levantarPendente = false;

  camera: THREE.PerspectiveCamera | null = null;
  input: Input | null = null;

  override update(dt: number): void {
    this.hitter.update(dt);
    this.atualizarMira();
    this.atualizarMovimento();
    this.atualizarAcoes(dt);

    this.motor.update(dt);
    this.sincronizarVisual(dt);
  }

  private atualizarMovimento(): void {
    const input = this.input;
    if (!input) return;

    const x = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
            - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const z = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
            - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);

    // Movimento relativo a' CAMERA, nao ao corpo: com a camera fixa em relacao
    // a' quadra, "pra frente" e' sempre pra rede, e o controle nao inverte
    // quando o atleta vira pra pegar uma bola lateral.
    if (this.camera) {
      this.camera.getWorldDirection(_frente);
      _frente.y = 0;
      _frente.normalize();
      /**
       * `cross(frente, cima)` JA' e' a direita da tela — nao inverta.
       *
       * Com a camera olhando pra -Z (o caso canonico) a conta devolve +X, que
       * e' a direita. Com a nossa camera, que fica atras do jogador Home e
       * olha pra +Z, ela devolve -X — e -X e' mesmo a direita de quem olha
       * naquela direcao. Um negate() aqui troca o A com o D, e como o D passa
       * a andar pra esquerda o erro parece "o controle esta' espelhado" em vez
       * de "a conta esta' errada".
       */
      _direita.crossVectors(_frente, THREE.Object3D.DEFAULT_UP);
    } else {
      _frente.set(0, 0, 1);
      _direita.set(1, 0, 0);
    }

    _direcao.set(0, 0, 0)
      .addScaledVector(_frente, z)
      .addScaledVector(_direita, x);
    this.motor.moverPara(_direcao);

    // Encara a bola quando ela esta' do meu lado; senao, encara a rede. E' o
    // que faz o atleta "prestar atencao" na jogada sem custar input nenhum.
    if (this.bolaNoMeuLado()) {
      _paraABola.subVectors(this.ball.posicao, this.motor.posicao);
      this.motor.encarar(_paraABola);
    } else {
      this.motor.encarar(this.direcaoParaRede(_paraABola));
    }
  }

  private atualizarAcoes(dt: number): void {
    const input = this.input;
    if (!input) return;

    if (input.wasPressed('Space')) this.motor.pular();

    /**
     * Dois botoes, duas intencoes — e o esquerdo faz as duas coisas que o
     * jogador mais faz.
     *
     *   ESQUERDO (ou E)  joga a bola. Toque rapido arma no proprio campo;
     *                    SEGURAR carrega e manda por cima da rede.
     *   DIREITO          levanta: sobe a bola no proprio campo, de proposito.
     *
     * A versao anterior tinha o ataque no direito e o passe no esquerdo, e
     * errava em dois pontos. O jogador precisava trocar de dedo pra decidir
     * entre passar e atacar, o que e' uma decisao de MIRA e nao de botao; e
     * levantar de proposito nao existia — dependia da altura em que a bola
     * chegava.
     *
     * Agora a carga E' a intencao: quem so' encosta passa, quem segura ataca.
     */
    const segurandoOToque = input.isMouseDown(0) || input.isDown('KeyE');

    if (segurandoOToque) {
      this.carregando = true;
      this.carga = Math.min(1, this.carga + dt / ATAQUE.tempoDeCarga);
    }

    const soltouOToque = this.carregando && !segurandoOToque;
    if (soltouOToque) {
      this.carregando = false;
      /**
       * A INTENCAO de atacar sobrevive a' soltada.
       *
       * No quadro em que se solta o botao ja' subiu; se o alvo dependesse do
       * botao, o ataque viraria passe manso bem na hora de bater. A intencao
       * dura o que durar o buffer.
       */
      this.ataquePendente = this.carga >= ATAQUE.cargaMinimaParaAtacar || this.segurandoModificador;
    }

    // O levantamento nao carrega: e' um toque de armacao, sai na hora.
    const pediuLevantar = input.wasMousePressed(2);
    if (pediuLevantar) this.levantarPendente = true;

    /**
     * Buffer de toque.
     *
     * O clique dado um quadro antes da bola entrar no alcance nao pode se
     * perder: sem isso o jogo parece travado justamente quando o jogador
     * acertou o tempo. E' o irmao do jumpBuffer do rpk.fps.
     */
    if (soltouOToque || pediuLevantar) {
      this.bufferDeToque = PLAYER.hitBuffer;
    } else if (this.bufferDeToque > 0) {
      this.bufferDeToque -= dt;
      // Buffer vencido sem tocar na bola: a carga e a intencao morrem junto,
      // senao o proximo toque herda a forca de um ataque que nao aconteceu.
      if (this.bufferDeToque <= 0) this.esquecerAtaque();
    }

    if (this.bufferDeToque <= 0) return;

    if (this.sacando) {
      if (this.hitter.sacar(this.ball, this.court, this, this.pontoDeMira, this.carga)) {
        this.bufferDeToque = 0;
        this.esquecerAtaque();
      }
      return;
    }

    if (!this.rally.rallyVivo) return;
    if (!this.hitter.alcanca(this.ball, this.motor.posicao)) return;

    const acao = this.escolherAcao();
    this.escolherAlvo(acao, _alvoDoToque);

    if (this.hitter.bater(this.ball, this.court, this, acao, _alvoDoToque, this.carga)) {
      this.bufferDeToque = 0;
      this.esquecerAtaque();
    }
  }

  private esquecerAtaque(): void {
    this.carga = 0;
    this.ataquePendente = false;
    this.levantarPendente = false;
  }

  /**
   * A acao sai do contexto, com uma excecao: atacar de pe' vira `ataque`.
   *
   * Sem isso, forcar o ataque com os pes no chao devolvia "levantamento" — o
   * solver de apice, um arco de 6 metros mirado longe. Ia por cima da rede,
   * mas em camera lenta.
   */
  private escolherAcao(): Acao {
    /**
     * Levantar e' a unica acao que o jogador PEDE contra o contexto.
     *
     * Bola na canela ou na cabeca, tanto faz: pedindo levantamento, ela sobe.
     * E' o toque que monta a jogada, e depender da altura em que a bola chegou
     * pra poder montar deixaria a decisao nas maos do adversario.
     */
    if (this.levantarPendente && !this.precisaCruzarARede()) return 'levantamento';

    const contextual = this.hitter.escolherAcao(this.ball, this.motor.posicao, this.motor.noChao);
    if (contextual === 'cortada') return 'cortada';
    return this.vaiAtacar(contextual) ? 'ataque' : contextual;
  }

  /** O toque vai cruzar a rede? */
  private vaiAtacar(acao: Acao): boolean {
    // Levantar pedido explicitamente NUNCA cruza — a nao ser no ultimo toque
    // permitido, onde ficar com a bola e' ponto do adversario.
    if (this.levantarPendente) return this.precisaCruzarARede();
    return acao === 'cortada' || this.forcandoAtaque || this.precisaCruzarARede();
  }

  /**
   * Pra onde mandar a bola.
   *
   * Cortada, terceiro toque ou botao de ataque segurado => campo adversario,
   * na mira do mouse. Qualquer outra coisa => armacao no proprio campo.
   *
   * Isso e' o que faz os dois primeiros toques montarem a jogada sozinhos: o
   * jogador nao precisa decidir "passar ou atacar" a cada toque, so' quando
   * quiser quebrar o padrao.
   */
  private escolherAlvo(acao: Acao, out: THREE.Vector3): THREE.Vector3 {
    if (this.vaiAtacar(acao)) return out.copy(this.pontoDeMira);

    const profundidade = acao === 'manchete' ? PLAYER.bumpSetupDepth : PLAYER.setSetupDepth;
    return this.alvoDeArmacao(profundidade, out);
  }

  private get forcandoAtaque(): boolean {
    return this.ataquePendente;
  }

  /**
   * Shift continua forcando o ataque, mesmo com carga baixa.
   *
   * E' a valvula pra quando a bola chega em cima e nao ha' tempo de segurar:
   * o toque sai fraco, mas sai por cima da rede em vez de armar no proprio
   * campo, que naquele momento seria perder o ponto.
   */
  private get segurandoModificador(): boolean {
    const input = this.input;
    return !!input && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
  }

  /** Carga atual, de 0 a 1. O HUD e o marcador de mira leem daqui. */
  get forcaDoAtaque(): number { return this.carregando ? this.carga : 0; }
  get carregandoAtaque(): boolean { return this.carregando; }

  /**
   * A mira e' um ponto no CHAO, resolvido pela posicao do cursor.
   *
   * Por isso este jogo nao usa pointer lock: com o cursor preso so' existe
   * movimento relativo, e "onde eu quero que a bola caia" vira um acumulador
   * que o jogador tem que administrar. Com o cursor solto, o ponto e' onde ele
   * esta' olhando.
   */
  private atualizarMira(): void {
    if (!this.camera || !this.input || !this.input.pointerMoved) {
      this.alvoPadrao(this.pontoDeMira);
      return;
    }

    _ndc.set(
      (this.input.pointerX / window.innerWidth) * 2 - 1,
      -(this.input.pointerY / window.innerHeight) * 2 + 1,
    );
    _raio.setFromCamera(_ndc, this.camera);

    _planoDoChao.constant = -this.court.floorY;
    if (_raio.ray.intersectPlane(_planoDoChao, _pontoDoChao)) {
      this.court.limitarMira(_pontoDoChao, oposto(this.side), 0.4, this.pontoDeMira);
    } else {
      this.alvoPadrao(this.pontoDeMira);
    }
  }
}
