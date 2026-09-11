import * as THREE from 'three';
import { PLAYER } from '../config';
import type { Input } from '../core/Input';
import { oposto } from '../world/Court';
import { Athlete } from './Athlete';

const _frente = new THREE.Vector3();
const _direita = new THREE.Vector3();
const _direcao = new THREE.Vector3();
const _paraABola = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raio = new THREE.Raycaster();
const _planoDoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pontoDoChao = new THREE.Vector3();

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

  camera: THREE.PerspectiveCamera | null = null;
  input: Input | null = null;

  override update(dt: number): void {
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
      _direita.crossVectors(_frente, THREE.Object3D.DEFAULT_UP).negate();
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
     * Buffer de toque.
     *
     * O clique dado um quadro antes da bola entrar no alcance nao pode se
     * perder: sem isso o jogo parece travado justamente quando o jogador
     * acertou o tempo. E' o irmao do jumpBuffer do rpk.fps.
     */
    const pediuToque = input.wasPressed('KeyE') || input.wasMousePressed(0);
    if (pediuToque) this.bufferDeToque = PLAYER.hitBuffer;
    else if (this.bufferDeToque > 0) this.bufferDeToque -= dt;
  }

  /** O toque em si entra na Fase 4; por ora so' o buffer e' mantido. */
  protected get querTocar(): boolean {
    return this.bufferDeToque > 0;
  }

  protected consumirToque(): void {
    this.bufferDeToque = 0;
  }

  protected get forcandoAtaque(): boolean {
    const input = this.input;
    return !!input && (input.isMouseDown(2) || input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
  }

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
