import * as THREE from 'three';
import { CAMERA, COLORS } from '../config';
import { Input } from './Input';
import { PerfMeter } from '../ui/PerfMeter';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/** Buffer de tela reaproveitado: o PerfMeter pede o tamanho todo quadro. */
const _bufSize = new THREE.Vector2();

/**
 * Laco principal e dono de todos os sistemas.
 *
 * A forma vem do Game do rpk.fps: `loop` chama `update(dt)` e `render()`, e
 * `update` e' publico de proposito — e' por ele que um teste avanca o tempo de
 * JOGO sem pagar rasterizacao.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;

  private input: Input;
  private perf = new PerfMeter(document.getElementById('perf')!);

  private state: GameState = 'menu';
  private lastTime = 0;
  private lastFrameDt = 0;
  private resolution = 1;

  constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(COLORS.sky);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      CAMERA.near,
      CAMERA.far,
    );
    this.camera.position.set(0, CAMERA.height, -CAMERA.distance);
    this.camera.lookAt(0, 1, 0);

    this.input = new Input(canvas);

    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.loop);
  }

  // ==================================================================
  // laco
  // ==================================================================

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);

    // Clamp de dt: voltar de uma aba em segundo plano nao pode teleportar todo
    // mundo. O medidor guarda o valor CRU — com o clamp, um quadro de 200 ms
    // apareceria como 50 e o F3 mentiria justamente quando importa.
    const cru = (now - this.lastTime) / 1000;
    this.lastFrameDt = cru;
    const dt = Math.min(cru, 1 / 20);
    this.lastTime = now;

    if (this.input.wasPressed('F3')) this.perf.toggle();

    if (this.state === 'playing') this.update(dt);

    this.render();
    this.input.endFrame();
  };

  /** Um passo de jogo. Publico: e' a porta de entrada dos testes. */
  update(_dt: number): void {
    // Fase 0: ainda nao ha' nada pra atualizar.
  }

  private render(): void {
    // O info do three zera sozinho a cada render(): ler ANTES do proximo passe.
    const alvo = this.renderer.getDrawingBufferSize(_bufSize);
    this.perf.sample(this.lastFrameDt, this.renderer.info, alvo.x, alvo.y);

    this.renderer.render(this.scene, this.camera);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.resolution);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.renderer.dispose();
  }
}
