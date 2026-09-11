import * as THREE from 'three';
import { AI_SKILL, CAMERA, COLORS } from '../config';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { PerfMeter } from '../ui/PerfMeter';
import { HUD } from '../ui/HUD';
import { Screens } from '../ui/Screens';
import { LigacaoDoRally } from '../match/Match';
import { Human } from '../players/Human';
import { AIPlayer } from '../players/AI';
import { descartarGeometriasDeAtleta } from '../players/buildAthlete';
import { Arena } from '../world/Arena';
import { PRAIA } from '../world/praia';
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

  /**
   * As quadras da praia. Todas rodam ao mesmo tempo.
   *
   * O Game deixou de ser dono de UMA quadra. Ele agora coordena varias, e cada
   * uma se vira sozinha — quem sabe jogar volei e' a Arena, nao ele.
   */
  readonly arenas: Arena[] = [];

  /** Em qual arena a camera esta'. Jogando ou assistindo. */
  private arenaFoco = 0;

  /** O jogador humano. Vive na arena em que entrou. */
  readonly player: Human;
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

    this.input = new Input(canvas);

    /**
     * Monta a praia inteira.
     *
     * Todas as arenas nascem com dois bots e ja' jogando. Uma praia de quadras
     * vazias nao e' mundo aberto, e' um cenario — o que faz o lugar parecer
     * vivo e' ter jogo acontecendo onde voce nao esta'.
     */
    for (const lugar of PRAIA) {
      const arena = new Arena(lugar.id, lugar.posicao, lugar.rotacao);
      this.arenas.push(arena);
      this.scene.add(arena.raiz);
      this.descartaveis.push(arena);
    }

    /**
     * O humano entra na primeira quadra, no lado Home.
     *
     * Ele SUBSTITUI o bot que estava ali — a partida daquela arena nao recomeca
     * por causa disso, so' troca de dono. E' o mesmo caminho que um jogador
     * remoto vai usar quando houver rede.
     */
    const minha = this.arenas[0]!;
    const rally = new LigacaoDoRally();
    rally.match = minha.match;

    this.player = new Human('VOCE', 'home', COLORS.home, minha.court, minha.ball, rally);
    this.player.camera = this.camera;
    this.player.input = this.input;
    minha.ocupar('home', this.player);

    this.ligarEventosDaArena(minha);

    this.criarLuzes();

    this.rig = new CameraRig(this.camera, minha.court, 'home');
    this.rig.alvo = this.player.objeto;
    this.rig.bola = minha.ball.mesh;
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
    /**
     * O frustum da sombra cobre a PRAIA inteira, nao uma quadra.
     *
     * Com varias arenas lado a lado, apertar o frustum na quadra do jogador
     * deixaria as outras sem sombra nenhuma — e quadra sem sombra ao lado de
     * quadra com sombra le' como bug, nao como distancia.
     */
    const extremo = this.arenas.reduce((max, a) => Math.max(max, Math.abs(a.court.matrix.elements[12]!)), 0);
    const alcance = extremo + this.arenas[0]!.court.halfLengthFree + 4;
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
    for (const arena of this.arenas) arena.prepararAquecimento();
    this.rig.encaixar();
    this.renderer.render(this.scene, this.camera);
    for (const arena of this.arenas) arena.esconderMarcadores();
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
    this.hud.definirNomes(this.player.nome, 'CPU');
  }

  private aplicarAjustes(): void {
    // A dificuldade vale pra todos os bots da praia, inclusive os das quadras
    // que o jogador so' assiste.
    for (const arena of this.arenas) {
      for (const atleta of [arena.home, arena.away]) {
        if (atleta instanceof AIPlayer) atleta.definirHabilidade(AI_SKILL[this.screens.ajustes.dificuldade]);
      }
    }
    this.resolution = this.screens.ajustes.resolucao;
    this.onResize();
  }

  private comecarPartida(): void {
    this.screens.mostrarMenu(false);
    this.screens.esconderFim();
    this.hud.mostrar(true);

    this.aplicarAjustes();

    /**
     * A minha quadra comeca do zero. As outras so' se ainda nao comecaram.
     *
     * Da' pra chegar aqui duas vezes — "jogar de novo" depois do fim do set
     * passa por este mesmo caminho. Zerar tudo ali jogaria no lixo as partidas
     * das outras quadras, que estao no meio do set e nao tem nada com isso: o
     * jogador voltaria pra uma praia inteira em 0 a 0, como se o mundo
     * existisse so' quando ele joga.
     */
    for (const arena of this.arenas) {
      if (arena === this.minhaArena || arena.match.estadoAtual === 'parada') arena.match.comecar();
    }
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
    const placar = this.minhaArena.match.placar;
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
    // Assistir as outras quadras da praia.
    if (this.input.wasPressed('BracketLeft')) this.assistir(this.arenaFoco - 1);
    if (this.input.wasPressed('BracketRight')) this.assistir(this.arenaFoco + 1);
    if (this.input.wasPressed('Tab')) this.voltarPraMinhaQuadra();

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
  /** Um passo de jogo. Publico: e' a porta de entrada dos testes. */
  update(dt: number): void {
    // Todas as arenas avancam, inclusive as que ninguem esta' olhando. E' o
    // que faz a praia ter jogo acontecendo em vez de quadras congeladas.
    for (const arena of this.arenas) arena.update(dt);

    this.hud.carga(this.player.carregandoAtaque ? this.player.forcaDoAtaque : -1);
    this.hud.relogioDoSaque(this.minhaArena.match.segundosParaSacar);

    this.rig.update(dt);
  }

  /** A arena em que o jogador humano esta'. */
  get minhaArena(): Arena {
    return this.arenas.find((a) => a.humano !== null) ?? this.arenas[0]!;
  }

  /** A arena que a camera esta' mostrando. Pode nao ser a do jogador. */
  get arenaEmFoco(): Arena {
    return this.arenas[this.arenaFoco] ?? this.arenas[0]!;
  }

  /**
   * Troca a quadra que a camera mostra.
   *
   * Assistir e' a mesma coisa que jogar, menos o atleta: a camera prende na
   * quadra escolhida e o HUD passa a contar aquele placar. Nao ha' modo
   * espectador separado — ha' uma camera que pode olhar pra outro lugar.
   */
  assistir(indice: number): void {
    const destino = this.arenas[((indice % this.arenas.length) + this.arenas.length) % this.arenas.length];
    if (!destino || destino === this.arenaEmFoco) return;

    this.desligarEventosDaArena(this.arenaEmFoco);
    this.arenaFoco = this.arenas.indexOf(destino);
    this.ligarEventosDaArena(destino);

    // A camera segue o humano na sua quadra; nas outras, segue a BOLA — e' o
    // enquadramento de quem assiste, nao o de quem joga.
    const humano = destino.humano;
    this.rig.recolocar(destino.court, humano ? humano.side : 'home');
    this.rig.alvo = humano ? humano.objeto : destino.ball.mesh;
    this.rig.bola = destino.ball.mesh;
    this.rig.encaixar();

    this.hud.definirNomes(destino.home.nome, destino.away.nome);
    this.hud.avisoDeQuadra(PRAIA[this.arenaFoco]?.nome ?? destino.id, humano !== null);
    this.hud.placar(destino.match.placar.home, destino.match.placar.away);
  }

  /** Volta a camera pra quadra do jogador. */
  voltarPraMinhaQuadra(): void {
    this.assistir(this.arenas.indexOf(this.minhaArena));
  }

  /**
   * Liga os eventos da partida ao HUD.
   *
   * So' UMA arena por vez alimenta o HUD: a que esta' em foco. As outras jogam
   * caladas — dez partidas gritando placar na mesma tela nao seria informacao,
   * seria barulho.
   */
  private ligarEventosDaArena(arena: Arena): void {
    const nomeDe = (lado: 'home' | 'away'): string =>
      (lado === 'home' ? arena.home : arena.away).nome;

    arena.match.eventos.placarMudou = (home, away) => this.hud.placar(home, away);
    arena.match.eventos.saqueMudou = (lado) => {
      const euSaco = arena.humano !== null && arena.humano.side === lado;
      this.hud.saque(lado, nomeDe(lado), euSaco);
    };
    arena.match.eventos.pontoFeito = (lado, motivo) => this.hud.ponto(lado, motivo, nomeDe(lado));
    arena.match.eventos.partidaAcabou = (vencedor) => {
      if (arena.humano) this.terminarPartida(vencedor === arena.humano.side);
    };
    arena.match.eventos.estadoMudou = (estado) => {
      if (estado !== 'esperandoSaque') this.hud.esconderDicaDeSaque();
    };
  }

  /** Desliga o HUD de uma arena, pra ela jogar em silencio. */
  private desligarEventosDaArena(arena: Arena): void {
    arena.match.eventos.placarMudou = undefined;
    arena.match.eventos.saqueMudou = undefined;
    arena.match.eventos.pontoFeito = undefined;
    arena.match.eventos.partidaAcabou = undefined;
    arena.match.eventos.estadoMudou = undefined;
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
