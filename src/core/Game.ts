import * as THREE from 'three';
import { CAMERA, COLORS, MATCH } from '../config';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { PerfMeter } from '../ui/PerfMeter';
import { Ball } from '../ball/Ball';
import { Human } from '../players/Human';
import type { EstadoDoRally } from '../players/Athlete';
import { descartarGeometriasDeAtleta } from '../players/buildAthlete';
import { Court, type Side } from '../world/Court';
import { construirQuadra, type Colisores } from '../world/buildCourt';
import { setMaxAnisotropy } from '../world/textures';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/** Buffer de tela reaproveitado: o PerfMeter pede o tamanho todo quadro. */
const _bufSize = new THREE.Vector2();

/**
 * Laco principal e dono de todos os sistemas.
 *
 * A forma vem do Game do rpk.fps: `loop` chama `update(dt)` e `render()`, e
 * `update` e' publico de proposito — e' por ele que um teste avanca o tempo de
 * JOGO sem pagar rasterizacao, o que aqui importa ainda mais que la': um rally
 * inteiro roda em milissegundos.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;

  private input: Input;
  private perf = new PerfMeter(document.getElementById('perf')!);

  readonly court = new Court();
  readonly colisores: Colisores;
  readonly ball: Ball;
  readonly player: Human;
  readonly rig: CameraRig;

  /** Tudo que precisa de dispose no fim. */
  private descartaveis: Array<{ dispose(): void }> = [];

  private state: GameState = 'menu';
  private lastTime = 0;
  private lastFrameDt = 0;
  private resolution = 1;

  constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap e' deprecado no r185 e cai em PCFShadowMap sozinho,
    // avisando no console a cada atualizacao de sombra. Usar o real.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // A anisotropia precisa estar definida ANTES de criar as texturas — elas
    // nascem em construirQuadra, logo abaixo.
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene.background = new THREE.Color(COLORS.sky);
    /**
     * A nevoa usa a MESMA cor do ceu — se destoar, a borda da areia recorta do
     * ceu como adesivo (a licao e' do rpk.fps, onde a parede do fundo fazia
     * isso). Comeca longe: a 60 m nao ha' bruma nenhuma pra ver numa praia ao
     * sol, ela existe aqui so' pra fazer a areia terminar em vez de ser
     * cortada.
     */
    this.scene.fog = new THREE.Fog(COLORS.sky, 60, 175);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      CAMERA.near,
      CAMERA.far,
    );

    const quadra = construirQuadra(this.court);
    this.scene.add(quadra.root);
    this.colisores = quadra.colisores;
    this.descartaveis.push(...quadra.descartaveis);

    this.input = new Input(canvas);

    this.ball = new Ball(this.court, this.colisores);
    this.scene.add(this.ball.mesh);
    this.descartaveis.push(this.ball);

    /**
     * Ate' o Match existir (Fase 5), o rally e' um estado de mentirinha: sempre
     * vivo, zero toques. E' o bastante pra mexer e tocar na bola.
     */
    const rallyProvisorio: EstadoDoRally = {
      toquesDoLado: (_lado: Side) => 0,
      maxToques: MATCH.maxTouches,
      rallyVivo: true,
    };

    this.player = new Human('VOCE', 'home', COLORS.home, this.court, this.ball, rallyProvisorio);
    this.player.camera = this.camera;
    this.player.input = this.input;
    this.scene.add(this.player.objeto);
    this.descartaveis.push(this.player);

    this.criarLuzes();

    this.rig = new CameraRig(this.camera, this.court, 'home');

    this.rig.alvo = this.player.objeto;
    this.rig.bola = this.ball.mesh;
    this.rig.encaixar();

    // Ate' haver saque (Fase 5), a bola comeca parada no alto do lado Home.
    this.ball.teleportar(this.court.pontoDaQuadra('home', 0, 0.5).setY(3));

    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.loop);
  }

  /**
   * Sol e luz do ceu.
   *
   * Sao DUAS, e continuam sendo duas pra sempre. No three, entrar ou sair uma
   * luz da cena — inclusive com `visible = false` — invalida os programas de
   * shader de todos os materiais, e a recompilacao trava o quadro. Se um dia
   * precisar apagar alguma, use `intensity = 0`.
   */
  private criarLuzes(): void {
    const ceu = new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 1.1);
    this.scene.add(ceu);

    const sol = new THREE.DirectionalLight(COLORS.sunLight, 2.6);
    // Mesma direcao do prototipo: Euler(52, -35, 0) apontando pra frente.
    const direcao = new THREE.Vector3(0, 0, 1)
      .applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-35), 0))
      .negate();
    sol.position.copy(direcao).multiplyScalar(30);
    sol.castShadow = true;

    /**
     * O frustum da sombra cobre a quadra e a zona livre, e mais nada.
     *
     * E' o ajuste que decide se a sombra tem resolucao: esticar o frustum pra
     * cobrir area vazia gasta o mapa inteiro em areia sem nada em cima.
     */
    const alcance = this.court.halfLengthFree + 2;
    sol.shadow.camera.left = -alcance;
    sol.shadow.camera.right = alcance;
    sol.shadow.camera.top = alcance;
    sol.shadow.camera.bottom = -alcance;
    sol.shadow.camera.near = 1;
    sol.shadow.camera.far = 80;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0008;

    this.scene.add(sol);
    this.scene.add(sol.target);
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
  update(dt: number): void {
    this.player.update(dt);
    this.ball.update(dt);
    this.rig.update(dt);
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
    for (const d of this.descartaveis) d.dispose();
    descartarGeometriasDeAtleta();
    this.renderer.dispose();
  }
}
