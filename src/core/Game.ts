import * as THREE from 'three';
import { AI_SKILL, CAMERA, COLORS } from '../config';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { PerfMeter } from '../ui/PerfMeter';
import { HUD } from '../ui/HUD';
import { Screens } from '../ui/Screens';
import { LigacaoDoRally, Match } from '../match/Match';
import { Ball } from '../ball/Ball';
import { Human } from '../players/Human';
import { AIPlayer } from '../players/AI';
import { descartarGeometriasDeAtleta } from '../players/buildAthlete';
import { Court } from '../world/Court';
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
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;

  private input: Input;
  private perf = new PerfMeter(document.getElementById('perf')!);

  readonly court = new Court();
  readonly colisores: Colisores;
  readonly ball: Ball;
  readonly player: Human;
  readonly opponent: AIPlayer;
  readonly match: Match;
  readonly rig: CameraRig;

  private hud = new HUD();
  /** Publico so' pra depuracao pelo __VOLEI, como o rpk.fps faz. */
  readonly screens = new Screens();

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

    const rally = new LigacaoDoRally();

    this.player = new Human('VOCE', 'home', COLORS.home, this.court, this.ball, rally);
    this.player.camera = this.camera;
    this.player.input = this.input;
    this.scene.add(this.player.objeto);
    this.descartaveis.push(this.player);

    this.opponent = new AIPlayer('CPU', 'away', COLORS.away, this.court, this.ball, rally);
    this.scene.add(this.opponent.objeto);
    this.descartaveis.push(this.opponent);

    this.match = new Match(this.court, this.ball, this.player, this.opponent, {
      placarMudou: (home, away) => this.hud.placar(home, away),
      saqueMudou: (lado) => {
        const quem = lado === 'home' ? this.player : this.opponent;
        this.hud.saque(lado, quem.nome, lado === 'home');
      },
      pontoFeito: (lado, motivo) => {
        this.hud.ponto(lado, motivo, lado === 'home' ? this.player.nome : this.opponent.nome);
      },
      partidaAcabou: (vencedor) => this.terminarPartida(vencedor === 'home'),
      estadoMudou: (estado) => {
        // A dica de "clique pra sacar" some assim que a bola sai da mao.
        if (estado !== 'esperandoSaque') this.hud.esconderDicaDeSaque();
      },
    });
    rally.match = this.match;

    this.ball.aoTocar = (por) => this.match.registrarToque(por.side);

    this.criarLuzes();

    this.rig = new CameraRig(this.camera, this.court, 'home');

    this.rig.alvo = this.player.objeto;
    this.rig.bola = this.ball.mesh;
    this.rig.encaixar();

    this.ligarTelas();
    this.aplicarAjustes();

    // Perder o foco pausa. Um jogo de navegador que continua rodando numa aba
    // escondida devolve o jogador a um ponto que ele nao viu acontecer.
    this.input.onBlur = () => this.pausar();

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
  // telas e estado
  // ==================================================================

  private ligarTelas(): void {
    this.screens.aoJogar = () => this.comecarPartida();
    this.screens.aoContinuar = () => this.continuar();
    this.screens.aoSair = () => this.sairProMenu();
    this.screens.aoMudarAjustes = () => this.aplicarAjustes();

    this.screens.mostrarMenu(true);
    this.hud.definirNomes(this.player.nome, this.opponent.nome);
  }

  private aplicarAjustes(): void {
    this.opponent.definirHabilidade(AI_SKILL[this.screens.ajustes.dificuldade]);
    this.resolution = this.screens.ajustes.resolucao;
    this.onResize();
  }

  private comecarPartida(): void {
    this.screens.mostrarMenu(false);
    this.screens.esconderFim();
    this.hud.mostrar(true);

    this.aplicarAjustes();
    this.match.comecar();
    this.rig.encaixar();
    this.state = 'playing';
  }

  private pausar(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.screens.mostrarPausa(true);
  }

  private continuar(): void {
    if (this.state !== 'paused') return;
    this.screens.mostrarPausa(false);
    // Zera o relogio: senao o primeiro quadro depois da pausa vem com o dt de
    // todo o tempo parado, e o clamp de 1/20 ainda seria um salto feio.
    this.lastTime = performance.now();
    this.state = 'playing';
  }

  private sairProMenu(): void {
    this.screens.mostrarPausa(false);
    this.screens.esconderFim();
    this.hud.mostrar(false);
    this.screens.mostrarMenu(true);
    this.state = 'menu';
  }

  private terminarPartida(venceu: boolean): void {
    this.state = 'over';
    const placar = this.match.placar;
    this.screens.mostrarFim(venceu, placar.home, placar.away);
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

    if (this.state === 'playing') {
      if (this.input.wasPressed('Escape')) this.pausar();
      else this.update(dt);
    } else if (this.state === 'over' && this.input.wasPressed('KeyR')) {
      this.comecarPartida();
    }

    this.hud.update(dt);
    this.render();
    this.input.endFrame();
  };

  /** Um passo de jogo. Publico: e' a porta de entrada dos testes. */
  update(dt: number): void {
    this.match.update(dt);
    this.player.update(dt);
    this.opponent.update(dt);
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
