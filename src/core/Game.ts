import * as THREE from 'three';
import { AI_SKILL, CAMERA, COLORS, PASSEIO } from '../config';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { PerfMeter } from '../ui/PerfMeter';
import { HUD } from '../ui/HUD';
import { Screens } from '../ui/Screens';
import { Human } from '../players/Human';
import { Banhista } from '../players/Banhista';
import { AIPlayer } from '../players/AI';
import { descartarGeometriasDeAtleta } from '../players/buildAthlete';
import { Arena } from '../world/Arena';
import { construirPraia } from '../world/buildBeach';
import { PRAIA } from '../world/praia';
import type { Side } from '../world/Court';
import { setMaxAnisotropy } from '../world/textures';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/** Buffer de tela reaproveitado: o PerfMeter pede o tamanho todo quadro. */
const _bufSize = new THREE.Vector2();
const _ponto = new THREE.Vector3();
const _olhar = new THREE.Vector3();

/** Seu nome no placar. Vale na quadra que voce ocupar. */
const MEU_NOME = 'VOCE';

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

  /**
   * Voce, quando esta' numa quadra. Fora dela, `null`.
   *
   * Era um campo `readonly` criado uma vez, porque o jogador era sempre um
   * atleta de uma quadra — nao havia outro lugar pra estar. Com a praia
   * andavel, "nao estar em quadra nenhuma" passou a ser um estado legitimo, e
   * fingir o contrario com um atleta escondido em algum canto espalharia o
   * fingimento por todo lado: limite de area, saque, mira, escolha de acao.
   */
  player: Human | null = null;

  /** Voce, na areia. O corpo que anda entre as quadras. */
  readonly banhista: Banhista;

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
    // O chao vem primeiro, e e' UM so' pra praia inteira. Cada quadra desenha
    // o que e' dela: linhas, rede e postes.
    const praia = construirPraia();
    this.scene.add(praia.root);
    this.descartaveis.push(...praia.descartaveis);

    for (const lugar of PRAIA) {
      const arena = new Arena(lugar.id, lugar.posicao, lugar.rotacao);
      this.arenas.push(arena);
      this.scene.add(arena.raiz);
      this.descartaveis.push(arena);
    }

    this.banhista = new Banhista(COLORS.home, this.arenas.map((a) => a.court));
    this.banhista.camera = this.camera;
    this.banhista.input = this.input;
    this.banhista.objeto.visible = false;
    this.scene.add(this.banhista.objeto);
    this.descartaveis.push(this.banhista);

    /**
     * O humano entra na primeira quadra, no lado Home.
     *
     * Ele SUBSTITUI o bot que estava ali — a partida daquela arena nao recomeca
     * por causa disso, so' troca de dono. E' o mesmo caminho que um jogador
     * remoto vai usar quando houver rede.
     */
    const minha = this.arenas[0]!;

    this.criarLuzes();

    this.rig = new CameraRig(this.camera, minha.court, 'home');
    this.entrarNaQuadra(minha, 'home');

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

    // O banhista tambem: ele nasce escondido, e material escondido nao compila.
    // O primeiro Q do jogador nao pode ser o quadro em que o shader nasce.
    this.banhista.objeto.visible = true;

    this.rig.encaixar();
    this.renderer.render(this.scene, this.camera);

    for (const arena of this.arenas) arena.esconderMarcadores();
    this.banhista.objeto.visible = false;
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
    this.hud.definirNomes(MEU_NOME, 'CPU');
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
    const minha = this.minhaArena;
    for (const arena of this.arenas) {
      if (arena === minha || arena.match.estadoAtual === 'parada') arena.match.comecar();
    }
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
    const placar = this.minhaArena?.match.placar;
    if (!placar) return;

    this.state = 'over';
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
      // Entrar e sair de quadra. Uma tecla so' vale de cada vez: quem esta'
      // jogando sai, quem esta' na areia entra.
      if (this.player) {
        if (this.input.wasPressed('KeyQ')) this.sairDaQuadra();
      } else if (this.input.wasPressed('KeyE')) {
        this.entrarNaQuadraMaisPerto();
      }

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

    // O banhista so' anda quando existe: dentro da quadra quem se mexe e' o
    // atleta, e o corpo na areia esta' guardado.
    if (!this.player) {
      this.banhista.update(dt);
      this.atualizarPasseio();
    }

    this.hud.carga(this.player?.carregandoAtaque ? this.player.forcaDoAtaque : -1);
    this.hud.relogioDoSaque(this.minhaArena?.match.segundosParaSacar ?? null);

    this.rig.update(dt);
  }

  /** A arena em que voce esta' jogando. `null` enquanto voce anda pela areia. */
  get minhaArena(): Arena | null {
    return this.arenas.find((a) => a.humano !== null) ?? null;
  }

  /**
   * Entra numa quadra, no lugar do bot daquele lado.
   *
   * A partida NAO recomeca: placar, saque e contagem de toques continuam de
   * pe'. E' o mesmo caminho que um jogador remoto vai usar quando houver rede —
   * entrar e sair sao operacoes da Arena, e nao do mundo em volta dela.
   *
   * Voce veste a cor do LADO, nao a sua. Ler a quadra e' metade do jogo: azul
   * de um lado, vermelho do outro, sempre. Um jogador que leva a propria cor
   * pra qualquer lado quebra essa leitura toda vez que troca de quadra.
   */
  entrarNaQuadra(arena: Arena, lado: Side): void {
    if (this.player) return;

    const humano = new Human(
      MEU_NOME,
      lado,
      lado === 'home' ? COLORS.home : COLORS.away,
      arena.court,
      arena.ball,
      arena.rally,
    );
    humano.camera = this.camera;
    humano.input = this.input;
    arena.ocupar(lado, humano);
    this.player = humano;

    this.banhista.objeto.visible = false;
    this.hud.dicaDaPraia(null);
    this.hud.esconderAvisoDeQuadra();

    this.focar(arena);
    this.rig.jogar(arena.court, lado, humano.objeto, arena.ball.mesh);
  }

  /**
   * Sai da quadra e vai a pe' pra areia.
   *
   * Um bot assume no seu lugar na hora. Sair no meio de um rally significa que
   * a bola que vinha pra voce vai pro bot — que e' o que aconteceria numa
   * quadra de verdade se voce saisse andando.
   */
  sairDaQuadra(): void {
    const arena = this.minhaArena;
    const humano = this.player;
    if (!arena || !humano) return;

    const lado = humano.side;
    arena.saidaDe(lado, _ponto);
    arena.court.direcaoParaRede(lado, _olhar);

    // `liberar` DESCARTA o humano: nada pode ler `this.player` depois disto.
    arena.liberar(lado);
    this.player = null;

    this.banhista.colocarEm(_ponto, _olhar);
    this.banhista.objeto.visible = true;
    this.rig.passear(this.banhista.objeto);
    this.hud.esconderAvisoDeQuadra();

    // O placar volta a ser de CPU contra CPU: quem estava escrito ali era voce,
    // e voce acabou de sair.
    this.focar(arena);
  }

  /** A quadra mais perto de quem anda, e por qual lado ele esta' chegando. */
  private quadraMaisPerto(): { arena: Arena; lado: Side; distancia: number } | null {
    let melhor: { arena: Arena; lado: Side; distancia: number } | null = null;

    for (const arena of this.arenas) {
      const { lado, distancia } = arena.ladoMaisPerto(this.banhista.posicao);
      if (!melhor || distancia < melhor.distancia) melhor = { arena, lado, distancia };
    }
    return melhor;
  }

  /**
   * O que ha' em volta de quem esta' andando.
   *
   * O placar do HUD acompanha a quadra mais perto — atravessar a praia devia
   * dar a sensacao de passar por jogos, nao a de carregar um placar de uma
   * partida que voce nem esta' vendo.
   *
   * So' vale com a camera atras de VOCE. Se ela estiver assistindo outra
   * quadra, trocar o placar por proximidade mostraria um placar que nao e' o da
   * quadra na tela.
   */
  private atualizarPasseio(): void {
    if (this.rig.modoAtual !== 'passeio') {
      this.hud.dicaDaPraia(null);
      return;
    }

    const perto = this.quadraMaisPerto();
    if (!perto) return;

    if (perto.arena !== this.arenaEmFoco) this.focar(perto.arena);

    if (perto.distancia > PASSEIO.alcanceDeEntrada) {
      this.hud.dicaDaPraia(null);
      return;
    }

    const nome = PRAIA[this.arenas.indexOf(perto.arena)]?.nome ?? perto.arena.id;
    const cor = perto.lado === 'home' ? 'AZUL' : 'VERMELHO';
    this.hud.dicaDaPraia(`E  entrar na ${nome}  ·  lado ${cor}`);
  }

  /** Entra na quadra mais perto, se houver uma ao alcance. */
  private entrarNaQuadraMaisPerto(): void {
    const perto = this.quadraMaisPerto();
    if (!perto || perto.distancia > PASSEIO.alcanceDeEntrada) return;
    this.entrarNaQuadra(perto.arena, perto.lado);
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
    if (!destino) return;
    // Ja' estou olhando pra ela com o enquadramento certo: nao ha' o que fazer,
    // e refazer daria um tranco de camera por tecla apertada a' toa.
    if (destino === this.arenaEmFoco && this.rig.modoAtual !== 'passeio') return;

    this.focar(destino);

    // A camera segue o humano na sua quadra; nas outras, enquadra a quadra
    // inteira de fora — e' o ponto de vista de quem assiste, nao o de quem joga.
    const humano = destino.humano;
    if (humano) this.rig.jogar(destino.court, humano.side, humano.objeto, destino.ball.mesh);
    else this.rig.assistir(destino.court, destino.ball.mesh);

    this.hud.avisoDeQuadra(PRAIA[this.arenaFoco]?.nome ?? destino.id, humano !== null);
  }

  /**
   * Faz uma arena ser a que alimenta o HUD. Nao mexe na camera.
   *
   * Foco e ENQUADRAMENTO sao duas coisas: quem anda pela areia troca o placar
   * da tela ao passar por uma quadra sem que a camera saia de cima dele.
   */
  private focar(arena: Arena): void {
    this.desligarEventosDaArena(this.arenaEmFoco);
    this.arenaFoco = this.arenas.indexOf(arena);
    this.ligarEventosDaArena(arena);

    this.hud.definirNomes(arena.home.nome, arena.away.nome);
    this.hud.placar(arena.match.placar.home, arena.match.placar.away);

    /**
     * A linha de saque tambem, e nao so' o placar.
     *
     * Ela so' muda por EVENTO, e evento a gente perde ao trocar de arena: quem
     * sai da quadra no meio do rally fica com "SAQUE: VOCE" na tela pelo resto
     * da partida dos bots, e o relogio do saque junto.
     */
    const quemSaca = arena.match.quemSaca;
    const sacador = quemSaca === 'home' ? arena.home : arena.away;
    this.hud.saque(quemSaca, sacador.nome, arena.humano?.side === quemSaca);
  }

  /**
   * Tab: volta a camera pra voce.
   *
   * Pra sua quadra se voce esta' jogando; pro seu corpo se voce esta' na areia.
   * Nos dois casos e' a mesma promessa — a tecla devolve o controle.
   */
  voltarPraMinhaQuadra(): void {
    const minha = this.minhaArena;
    if (minha) {
      this.assistir(this.arenas.indexOf(minha));
      return;
    }

    this.rig.passear(this.banhista.objeto);
    this.hud.esconderAvisoDeQuadra();
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
