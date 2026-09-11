import * as THREE from 'three';
import { AI_SKILL, BALL, CAMERA, COLORS } from '../config';
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
import { Markers } from '../world/Markers';
import { setMaxAnisotropy } from '../world/textures';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/** Buffer de tela reaproveitado: o PerfMeter pede o tamanho todo quadro. */
const _bufSize = new THREE.Vector2();
const _queda = new THREE.Vector3();

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

  /** Publico so' pra depuracao pelo __VOLEI, como o resto. */
  readonly markers = new Markers();

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

    this.scene.add(this.markers.group);
    this.descartaveis.push(this.markers);

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
    this.aquecerShaders();

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

  /**
   * Compila tudo antes da partida comecar.
   *
   * No three, o shader de um material so' e' compilado quando ele aparece pela
   * primeira vez — e isso trava o quadro. No meio de um rally e' justamente o
   * pior momento. A licao vem do rpk.fps, onde o engasgo aparecia a cada tiro.
   *
   * Renderiza um quadro DE VERDADE, e nao so' `renderer.compile`: aquele nao
   * cobre o shader de sombra nem o envio das geometrias pra GPU.
   *
   * Se voce adicionar material ou geometria novos, eles precisam estar na cena
   * neste ponto — senao o custo volta a cair no meio da partida.
   */
  private aquecerShaders(): void {
    // Todo mundo ja' esta' na cena: quadra, rede, postes, bola e os dois
    // atletas. Os marcadores nascem escondidos, entao precisam aparecer aqui —
    // material que nao passa pelo aquecimento compila no meio do rally.
    this.markers.prepararAquecimento();
    this.rig.encaixar();
    this.renderer.render(this.scene, this.camera);
    this.markers.esconderQueda();
    this.markers.esconderMira();
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
    if (this.input.wasPressed('KeyH')) this.hud.alternarManual();

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
    this.atualizarMarcadores();
    this.rig.update(dt);
  }

  /**
   * Os dois marcadores no chao.
   *
   * A queda vem da MESMA previsao que a IA usa — nao ha' duas contas de onde a
   * bola vai cair, entao o que voce ve' e' literalmente o que o adversario
   * esta' lendo.
   */
  private atualizarMarcadores(): void {
    // Bola na mao do sacador ou ja' parada na areia: nao ha' queda a prever.
    if (this.ball.presa || this.ball.parada) {
      this.markers.esconderQueda();
    } else {
      /**
       * O alvo e' o centro da bola no instante do CONTATO, nao o chao.
       *
       * A bola toca a areia com o centro a um raio de altura. Prevendo ate'
       * y = 0 o marcador cai uns dez centimetros alem do ponto real — pouco,
       * mas e' erro sistematico e sempre pro mesmo lado.
       */
      const tempo = this.ball.preverPouso(this.court.floorY + BALL.radius, _queda);
      _queda.y = this.court.floorY;
      // Perto demais do chao o anel vira ruido em cima da propria bola.
      if (tempo > 0.08) this.markers.mostrarQueda(_queda, tempo);
      else this.markers.esconderQueda();
    }

    // A mira so' aparece quando ha' o que mirar: no seu saque, ou com a bola
    // do seu lado. Sempre visivel, ela vira enfeite e polui a leitura.
    const vale = this.player.sacando || this.court.ladoDe(this.ball.posicao) === 'home';
    if (vale && this.state === 'playing') {
      this.markers.mostrarMira(this.player.pontoDeMira, this.player.forcaDoAtaque);
    } else {
      this.markers.esconderMira();
    }

    this.hud.carga(this.player.carregandoAtaque ? this.player.forcaDoAtaque : -1);
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
