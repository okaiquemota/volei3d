import * as THREE from 'three';
import { AI_SKILL, CAMERA, COLORS, COURT, ESTADIO, PASSEIO, type AiSkill } from '../config';
import { Input } from './Input';
import { Tempo } from './Tempo';
import { CameraRig } from './CameraRig';
import { ResolucaoAutomatica } from './ResolucaoAutomatica';
import { PerfMeter } from '../ui/PerfMeter';
import { HUD } from '../ui/HUD';
import { Screens, type Cenario, type PlacarDaPausa } from '../ui/Screens';
import { Human } from '../players/Human';
import { Banhista } from '../players/Banhista';
import { carregarCorpos } from '../players/carregarCorpos';
import { carregarMeuVisual, guardarMeuVisual, type Visual } from '../players/corpos';
import { Corpos } from '../players/montarCorpo';
import { usarCorposNosRetratos } from '../ui/retratos';
import { AIPlayer } from '../players/AI';
import { descartarGeometriasDeAtleta } from '../players/buildAthlete';
import { Arena } from '../world/Arena';
import { construirPraia, type PraiaConstruida } from '../world/buildBeach';
import { construirCeu, type CeuConstruido } from '../world/buildSky';
import { carregarQuadraModelo, type ModeloDaQuadra } from '../world/buildQuadraModelo';
import { carregarEstadio, type ModeloDoEstadio } from '../world/buildEstadio';
import {
  DEFINICAO, NOMES_DAS_RODADAS, adversarioAtual, novoTorneio, registrarPartida, type Etapa, type Jogador,
} from '../match/Circuito';
import { personagemPorId, type Personagem } from '../match/personagens';
import { armazemDoNavegador, carregar, guardar, type Progresso } from '../match/salvar';
import { LIMITE_DA_PRAIA, PRAIA } from '../world/praia';
import type { Side } from '../world/Court';
import { setMaxAnisotropy } from '../world/textures';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/** Buffer de tela reaproveitado: o PerfMeter pede o tamanho todo quadro. */
const _bufSize = new THREE.Vector2();
const _ponto = new THREE.Vector3();
const _olhar = new THREE.Vector3();
const _centroDoMenu = new THREE.Vector3();
const _destinoDoVoo = new THREE.Vector3();
const _giroDoVoo = new THREE.Quaternion();
const _cameraAlvo = new THREE.Vector3();
const _paraOSolLocal = new THREE.Vector3();
const _centroDaQuadra = new THREE.Vector3();
const _EIXO_Y = new THREE.Vector3(0, 1, 0);

/**
 * O criador de personagem: onde o boneco posa e de onde a camera olha, em
 * metros da quadra em foco.
 *
 * DENTRO da quadra, e nao do lado dela: fora, a camera caia atras das placas
 * do estadio (8,5 m da linha) e no meio da torcida — uma placa cortava o
 * boneco pela cintura. E com o SOL atras da camera: com a camera num lado fixo
 * da quadra, numa das orientacoes ela olhava contra o sol e o boneco virava
 * silhueta. Agora a direcao da foto sai do sol (`cameraDoCriador`). Os atletas
 * da quadra somem enquanto o criador esta' aberto: o boneco e' voce, e o seu
 * atleta parado ali seria voce duas vezes.
 */
const CRIADOR = {
  /** O meio da foto, em metros da rede: o fundo de uma das meias quadras. */
  fundo: 6,
  /** Da camera ao boneco, no chao. */
  distancia: 3.7,
  /**
   * Na altura dos OLHOS e olhando um pouco pra baixo. Na altura do peito ela
   * via o rosto de baixo pra cima, e o rosto e' a peca que mais se escolhe.
   */
  altura: 1.6,
  alturaDoOlhar: 1.05,
  /**
   * Quanto a camera sai da linha do sol, em radianos. Com o sol bem atras
   * dela a luz e' chapada; um pouco de lado, ela desenha o volume do rosto.
   */
  tresQuartos: 0.45,
  /** Vira o olhar pra esquerda: joga o boneco pra direita, longe do painel. */
  desvio: 0.3,
  /** Quanto a camera leva pra chegar, e pra voltar ao menu. Relogio, nao jogo. */
  voo: 0.9,
};
const suave = (t: number): number => t * t * (3 - 2 * t);
const proximoQuadro = (): Promise<void> => new Promise((pronto) => requestAnimationFrame(() => pronto()));

/** Segundos do voo da camera, do menu ate' atras do jogador. */
const VOO_DO_MENU = 1.3;

/**
 * A camera do menu: uma volta lenta em volta da quadra em foco.
 *
 * Baixa e de longe, como a abertura de uma transmissao. O giro e' devagar de
 * proposito — ~2 minutos por volta: o menu e' pra ler, e o fundo so' tem que
 * estar vivo, nao chamar o olho.
 */
const MENU_CAMERA = { raio: 17, altura: 4.2, alturaDoOlhar: 1.3, velocidade: 0.05,
  /** Quanto o olhar vira pra esquerda: joga a quadra pra direita da tela, onde o veu abre. */
  desvio: 0.3 };

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
   * O poder de camera lenta.
   *
   * Mora no Game e nao na Arena porque a escala vale pro MUNDO: parar so' a sua
   * quadra enquanto as outras tres seguem em velocidade cheia faria a praia
   * inteira desmentir o efeito, e a camera, que segue voce, estaria acompanhando
   * um tempo e enquadrando outro.
   */
  private tempo = new Tempo();

  /**
   * A pele de modelo da quadra, quando ela chega.
   *
   * Carrega uma vez e em segundo plano: sao 136 kB, mas e' rede, e travar a
   * primeira pintura por causa de um cenario que talvez nao seja escolhido
   * seria pagar caro por nada. Ate' chegar, o cenario QUADRA mostra o desenho
   * por codigo — o jogo nunca fica sem quadra.
   */
  private modeloDaQuadra: ModeloDaQuadra | null = null;

  /**
   * O estadio, quando ele chega.
   *
   * Diferente dos outros dois: este e' buscado SO' quando o cenario ESTADIO e'
   * escolhido, e nao no arranque. Sao 1,5 MB, o mesmo peso do corpo dos
   * atletas, mas o corpo aparece nos tres cenarios e o estadio so' num — puxar
   * ele de saida seria cobrar de todo mundo por um cenario que a maioria nao
   * vai abrir.
   */
  private modeloDoEstadio: ModeloDoEstadio | null = null;
  /** Ja' pedimos o estadio? Impede de pedir de novo a cada troca de cenario. */
  private buscandoEstadio = false;

  /**
   * O CIRCUITO: modo, progresso salvo, e o cenario que a etapa impoe.
   *
   * O progresso e' lido uma vez, no arranque, e regravado a cada partida — nao
   * a cada quadro. Nao ha' o que salvar no meio de um ponto, e o `localStorage`
   * e' sincrono: gravar por quadro travaria o jogo em disco lento.
   */
  private modo: 'amistoso' | 'circuito' = 'amistoso';
  private readonly armazem = armazemDoNavegador();
  private progresso: Progresso = carregar(this.armazem);
  /** O seu corpo, do criador. Guardado a parte do circuito: nao e' progresso. */
  private meuVisual: Visual = carregarMeuVisual(this.armazem);

  private cenarioForcado: Cenario | null = null;
  /** O adversario da partida do circuito em curso. Null no amistoso. */
  private adversario: Jogador | null = null;

  /**
   * O personagem desafiado no AMISTOSO, pela tela de adversarios.
   *
   * Fica ate' o jogador voltar ao amistoso de sempre pelo menu: "jogar de novo"
   * e o R repetem o desafio, que e' o que se quer depois de perder pra alguem.
   */
  private desafiado: Personagem | null = null;

  /** O chao do mundo. Guardado porque o cenario troca a cara dele. */
  private praia!: PraiaConstruida;

  /** A cupula do ceu. Some no cenario QUADRA, onde nao ha' ceu. */
  private ceu!: CeuConstruido;

  /**
   * As pecas de corpo dos atletas, quando chegam.
   *
   * Mesmo desenho da quadra de modelo: carrega em segundo plano, e ate' chegar
   * todo mundo joga de capsula. Sao 4 MB — travar a primeira pintura por
   * causa disso seria pagar caro pelo que e' so' aparencia.
   */
  private corpos: Corpos | null = null;

  /**
   * As quadras que estao VIVAS: desenhadas e simuladas.
   *
   * No cenario AREIA sao as tres — e' o que faz a praia ter jogo acontecendo
   * onde voce nao esta'. No QUADRA e' uma so': aquele cenario e' uma partida, e
   * nao um lugar. As outras duas somem da cena e param de ser atualizadas, que
   * e' o unico jeito honesto de "so' existe esta quadra" — escondidas e ainda
   * jogando, elas continuariam gastando quadro e mudando placar pelas costas.
   */
  private arenasVivas: Arena[] = [];

  /**
   * O cenario e' de uma quadra so'?
   *
   * QUADRA e ESTADIO sao os dois uma PARTIDA, e nao um lugar: em ambos a praia
   * com tres jogos acontecendo ao mesmo tempo nao faz sentido nenhum.
   */
  private get quadraUnica(): boolean {
    return this.cenarioAtivo !== 'areia';
  }

  /** O cenario e' o branco do estudio, sem ceu e sem areia? */
  private get noEstudio(): boolean {
    return this.cenarioAtivo === 'quadra';
  }

  private get noEstadio(): boolean {
    return this.cenarioAtivo === 'estadio';
  }

  /**
   * O cenario que vale AGORA.
   *
   * No amistoso e' o do menu. No circuito e' o da etapa — praia, ginasio,
   * estadio — e o do menu fica guardado intacto por baixo, pra voltar quando
   * o jogador sair do circuito. Escrever a etapa por cima do ajuste do menu
   * apagaria a escolha de quem nunca pediu pra mudar ela.
   */
  private get cenarioAtivo(): Cenario {
    return this.cenarioForcado ?? this.screens.ajustes.cenario;
  }

  /**
   * As quadras da praia. Todas rodam ao mesmo tempo.
   *
   * O Game deixou de ser dono de UMA quadra. Ele agora coordena varias, e cada
   * uma se vira sozinha — quem sabe jogar volei e' a Arena, nao ele.
   */
  readonly arenas: Arena[] = [];

  /** Em qual arena a camera esta'. Jogando ou assistindo. */
  private arenaFoco = 0;

  /** Ultimo toque do jogador que ja' virou aviso na tela. */
  private ultimoToqueVisto = 0;

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
  /** O angulo da volta da camera do menu, e onde ela estava no ultimo quadro. */
  private giroDoMenu = 0.9;
  private poseDoMenu: { posicao: THREE.Vector3; giro: THREE.Quaternion } | null = null;
  /** O voo em andamento: de onde saiu, e quanto ja' andou (0 a 1). */
  private voo: { posicao: THREE.Vector3; giro: THREE.Quaternion; t: number } | null = null;

  /**
   * O criador aberto: o giro que o jogador pediu, o giro que o boneco ja'
   * fez (anda atras do pedido, pra virar e nao saltar), de onde a camera
   * saiu e quanto do voo ja' foi.
   */
  private criador: {
    giro: number; giroVisto: number; de: { posicao: THREE.Vector3; giro: THREE.Quaternion }; t: number; visivelAntes: boolean;
    /** O que o criador escondeu da quadra em foco, pra devolver ao fechar. */
    escondidos: THREE.Object3D[];
  } | null = null;
  /** A camera voltando do criador pra volta do menu. */
  private voltaDoCriador: { posicao: THREE.Vector3; giro: THREE.Quaternion; t: number } | null = null;
  /** De onde vem a luz do sol (unitario, apontando pro sol). O criador fotografa a favor dela. */
  private readonly paraOSol = new THREE.Vector3(0, 1, 0);
  private lastTime = 0;
  private lastFrameDt = 0;
  /** A escala de resolucao escolhida nos ajustes. `null` e' o AUTO. */
  private resolucaoFixa: number | null = 1;
  private readonly resolucaoAutomatica = new ResolucaoAutomatica();

  constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    /**
     * PCF, e NAO VSM — e a borda macia sai do `shadow.radius`.
     *
     * A sombra ja' foi VSM, pra amaciar a borda, e o preco nao aparecia em lugar
     * nenhum: o VSM BORRA o mapa inteiro, 2048 x 2048, em dois passes de 16
     * amostras, todo quadro. Medido com o quadro terminado de verdade, era ~90%
     * do tempo de desenho em qualquer cenario — 1010 ms contra 136 ms do PCF no
     * renderizador por software, que exagera o numero mas nao a proporcao.
     *
     * E o motivo de ter ido pro VSM nao valia mais: no r185 o PCF usa o
     * `radius` (cinco amostras num disco, giradas por pixel), e com raio 4 a
     * borda fica igual a' do VSM na camera de jogo. O raio 1 e' que desenhava
     * a sombra de recorte. `PCFSoftShadowMap` continua sem servir: esta'
     * deprecado e cai no PCF sozinho, avisando no console.
     */
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // A anisotropia precisa estar definida ANTES de criar as texturas — elas
    // nascem em construirQuadra, logo abaixo.
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    /**
     * O fundo so' aparece onde a cupula do ceu NAO cobre — hoje, no cenario
     * QUADRA, onde ela some e sobra o branco.
     */
    this.scene.background = new THREE.Color(COLORS.sky);
    /**
     * A nevoa usa a cor do ceu RENTE AO HORIZONTE — se destoar do que esta'
     * atras, a borda da areia recorta como adesivo (a licao e' do rpk.fps, onde
     * a parede do fundo fazia isso).
     *
     * E ela comeca bem mais perto do que comecava. A 60 m nao havia bruma
     * nenhuma dentro da area de jogo, e o resultado era uma areia com o MESMO
     * tom rente aos pes e a vinte metros — medido, 172,133,74 contra
     * 173,134,75. Isso nao e' "praia ao sol", e' falta de profundidade: e' o
     * degrade que diz ao olho o que esta' longe.
     */
    this.scene.fog = new THREE.Fog(COLORS.horizonte, 22, 150);

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
    this.praia = praia;

    // A cupula cabe dentro do alcance de visao: maior que o `far`, ela seria
    // recortada e o ceu viraria preto.
    this.ceu = construirCeu(CAMERA.far * 0.9);
    this.scene.add(this.ceu.malha);
    this.descartaveis.push(...this.ceu.descartaveis);

    for (const lugar of PRAIA) {
      const arena = new Arena(lugar.id, lugar.posicao, lugar.rotacao);
      this.arenas.push(arena);
      this.scene.add(arena.raiz);
      this.descartaveis.push(arena);
    }

    this.banhista = new Banhista(COLORS.home, this.arenas.map((a) => a.court));
    this.banhista.camera = this.camera;
    this.banhista.input = this.input;
    this.banhista.vestir(this.meuVisual);
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
    // Menos preenchimento e mais sol: com o hemisferico forte a cena inteira
    // recebe luz igual de todo lado, e luz igual de todo lado e' a definicao de
    // chapado. O contraste entre os dois e' o que desenha o volume.
    const ceu = new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 0.85);
    this.scene.add(ceu);

    const sol = new THREE.DirectionalLight(COLORS.sunLight, 3.4);
    // Mesma direcao do prototipo: Euler(52, -35, 0) apontando pra frente.
    const direcao = new THREE.Vector3(0, 0, 1)
      .applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-35), 0))
      .negate();
    sol.position.copy(direcao).multiplyScalar(30);
    this.paraOSol.copy(direcao);
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

    /**
     * O quanto a borda borra, e o quanto a sombra escurece.
     *
     * `radius` e' em TEXELS do mapa, e o disco do PCF tem cinco amostras: ate'
     * 4 a borda fica lisa; em 7 ja' aparece o granulado do giro por pixel.
     *
     * `bias` e' o -0,0008 de sempre do PCF, que tapa o acne na areia.
     *
     * `intensity` e' a outra metade do "sombra dura": ela nao era so' de borda
     * afiada, era tambem preta demais. Sol de praia tem ceu inteiro fazendo
     * preenchimento, e nenhuma sombra ao ar livre chega a 100%.
     */
    sol.shadow.bias = -0.0008;
    sol.shadow.radius = 4;
    sol.shadow.intensity = 0.72;

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
    this.screens.aoJogar = () => { this.desafiado = null; this.comecarAmistoso(); };
    this.screens.aoJogarDeNovo = () => this.comecarAmistoso();
    this.screens.aoAbrirJogador = () => this.abrirCriador();
    this.screens.aoVoltarDoJogador = () => this.fecharCriador();
    this.screens.aoMudarJogador = (v) => this.mudarMeuVisual(v);
    this.screens.aoGirarJogador = (r) => { if (this.criador) this.criador.giro += r; };
    this.screens.aoAbrirElenco = () => this.abrirElenco();
    this.screens.aoVoltarDoElenco = () => this.voltarDoElenco();
    this.screens.aoDesafiar = (p) => this.desafiar(p);
    this.screens.aoAbrirCircuito = () => this.abrirCircuito();
    this.screens.aoEscolherEtapa = (etapa) => this.escolherEtapa(etapa);
    this.screens.aoAbandonarTorneio = () => this.abandonarTorneio();
    this.screens.aoJogarPartidaDoCircuito = () => this.comecarPartidaDoCircuito();
    this.screens.aoSeguirNoCircuito = () => this.seguirNoCircuito();
    this.screens.aoVoltarDoCircuito = () => this.voltarDoCircuito();
    this.screens.aoContinuar = () => this.continuar();
    this.screens.aoSair = () => this.sairProMenu();
    this.screens.aoIrProMenu = () => this.menuDepoisDoFim();
    this.screens.aoMudarAjustes = () => this.aplicarAjustes();
    this.screens.progresso = () => ({ carreira: this.progresso.carreira, torneio: this.progresso.torneio });
    this.screens.meuVisual = () => this.meuVisual;

    this.screens.mostrarMenu(true);
    this.hud.definirNomes(MEU_NOME, 'CPU');
    void this.buscarModeloDaQuadra();
    void this.buscarModeloDoAtleta();
  }

  /**
   * Busca o modelo da quadra e aplica, se o cenario ja' estiver escolhido.
   *
   * Falhar aqui nao pode derrubar o jogo: sem rede, sem o arquivo, ou com um
   * glTF quebrado, o que se perde e' um cenario — e o outro continua sendo o
   * que o jogo sempre foi.
   */
  /**
   * Busca o corpo dos atletas e veste todo mundo.
   *
   * Falhar aqui nao derruba o jogo: sem rede ou com o arquivo quebrado, o que
   * se perde e' a aparencia, e a capsula continua jogando o mesmo jogo.
   */
  private async buscarModeloDoAtleta(): Promise<void> {
    try {
      const corpos = await carregarCorpos();
      await this.compilarCorpo(corpos);
      this.corpos = corpos;
      // Uma arena por quadro: vestir a praia inteira de uma vez era um tranco
      // so' no menu, de montar seis corpos e as animacoes deles.
      for (const arena of this.arenas) {
        arena.usarModeloDeAtleta(corpos);
        await proximoQuadro();
      }
      this.banhista.usarModelo(corpos);
      usarCorposNosRetratos(corpos);
    } catch (erro) {
      console.warn('nao deu pra carregar o corpo dos atletas; seguindo de capsula', erro);
      // So' agora a capsula aparece: ate' aqui ninguem tinha corpo nenhum.
      for (const arena of this.arenas) arena.usarModeloDeAtleta(null);
      this.banhista.usarModelo(null);
    }
  }

  /**
   * Compila o shader do corpo ANTES de o corpo entrar em cena.
   *
   * Todo corpo usa o mesmo material, entao e' um programa so' — mas e' o
   * mais pesado do jogo (pele, sombra, nevoa), e compilar trava o quadro em
   * que ele aparece pela primeira vez: era um tranco no menu, bem quando os
   * atletas ganhavam corpo. `compileAsync` compila em paralelo, sem travar,
   * onde o navegador deixa (KHR_parallel_shader_compile); onde nao deixa, o
   * custo fica no primeiro quadro, como antes.
   */
  private async compilarCorpo(corpos: Corpos): Promise<void> {
    // Sem a extensao nao ha' ganho nenhum: seria a mesma compilacao, so' antes.
    if (!this.renderer.extensions.has('KHR_parallel_shader_compile')) return;
    const amostra = corpos.montar(this.meuVisual);
    try {
      await this.renderer.compileAsync(amostra, this.camera, this.scene);
    } catch (erro) {
      console.warn('nao deu pra compilar o corpo antes; compila no primeiro quadro', erro);
    } finally {
      Corpos.descartar(amostra);
    }
  }

  /**
   * Busca o estadio, uma vez, na primeira vez que o cenario for escolhido.
   *
   * Falhar aqui nao derruba nada: sem o arquivo, o cenario ESTADIO e' a quadra
   * de areia de sempre, sem arquibancada em volta. Perde-se a vizinhanca, nao
   * o jogo.
   */
  private async buscarEstadio(): Promise<void> {
    if (this.buscandoEstadio) return;
    this.buscandoEstadio = true;
    try {
      this.modeloDoEstadio = await carregarEstadio();
      this.aplicarCenario();
    } catch (erro) {
      console.warn('nao deu pra carregar o estadio; seguindo sem arquibancada', erro);
    }
  }

  private async buscarModeloDaQuadra(): Promise<void> {
    try {
      this.modeloDaQuadra = await carregarQuadraModelo();
      this.aplicarCenario();
    } catch (erro) {
      console.warn('nao deu pra carregar a quadra de modelo; seguindo na areia', erro);
    }
  }

  /** Poe a pele escolhida em todas as quadras da praia, inclusive as que so' se assiste. */
  private aplicarCenario(): void {
    const naQuadra = this.quadraUnica;

    /**
     * A QUADRA de modelo vale nos dois cenarios de partida.
     *
     * O estadio e' a vizinhanca dela, nao um substituto: dentro da arquibancada
     * vai a mesma quadra do cenario QUADRA, e nao areia. Areia ali era a praia
     * de novo, com arquibancada em volta — que nao e' nem uma coisa nem outra.
     */
    const molde = naQuadra ? this.modeloDaQuadra?.molde ?? null : null;
    // A borda azul da laje so' aparece no estudio: no estadio o chao ja' e' ela.
    for (const arena of this.arenas) arena.usarModelo(molde, this.noEstudio);

    // O chao acompanha, e sao TRES: areia na praia, branco chapado no estudio,
    // concreto dentro do estadio. Ver `TipoDePiso`.
    this.praia.usarPiso(!naQuadra ? 'areia' : this.noEstudio ? 'estudio' : 'arena');

    /**
     * O ceu some so' no estudio.
     *
     * E' aqui que os dois cenarios de partida se separam, e e' o unico lugar:
     * o QUADRA e' um estudio, sem ceu e sem horizonte; o ESTADIO e' ao ar
     * livre, com a arquibancada recortada contra o ceu. Ler cenario por um
     * booleano so' — "uma quadra so'" e "sem ceu" — era a conta que juntava
     * duas perguntas diferentes.
     *
     * Fundo e nevoa tem que andar juntos: a nevoa que destoa do fundo recorta a
     * borda do chao como adesivo — a licao e' antiga e esta' escrita la' em
     * cima, onde os dois nasceram com a mesma cor.
     */
    this.ceu.malha.visible = !this.noEstudio;
    const fundo = this.noEstudio ? COLORS.brancoDaQuadra : COLORS.horizonte;
    (this.scene.background as THREE.Color).setHex(fundo);
    (this.scene.fog as THREE.Fog).color.setHex(fundo);

    /**
     * E sobra UMA quadra.
     *
     * Se voce estava na areia na hora da troca, volta pra dentro antes de
     * qualquer outra coisa: sem isto nao ha' "sua quadra", nenhuma arena seria
     * a viva, e o cenario abriria num mundo vazio.
     */
    if (naQuadra && !this.player) this.entrarNaQuadra(this.arenaEmFoco, 'home');

    /**
     * `minhaArena` e' onde o humano esta' — e agora ele pode SAIR dela.
     *
     * Sem o `??`, sair da quadra no cenario de quadra unica zerava a lista de
     * arenas vivas na proxima troca de ajuste: a quadra sumia da tela junto com
     * a partida, e o jogador ficava num estadio vazio.
     */
    const unica = naQuadra ? this.minhaArena ?? this.arenaEmFoco : null;
    this.arenasVivas = unica ? [unica] : [...this.arenas];
    for (const arena of this.arenas) arena.raiz.visible = this.arenasVivas.includes(arena);

    /**
     * A arquibancada vai SO' na quadra viva.
     *
     * Um estadio por arena seriam tres bowls de 92 m encaixados um no outro —
     * e as outras duas estao invisiveis de qualquer jeito. Aqui a economia e a
     * imagem querem a mesma coisa.
     */
    const arquibancada = this.noEstadio ? this.modeloDoEstadio?.molde ?? null : null;
    for (const arena of this.arenas) arena.usarEstadio(arena === unica ? arquibancada : null);

    // Pedir o arquivo so' agora: quem nunca abrir o ESTADIO nunca baixa 1,5 MB.
    if (this.noEstadio && !this.modeloDoEstadio) void this.buscarEstadio();

    /**
     * Onde da' pra andar depois de sair da quadra, e sao tres respostas.
     *
     * Na praia, a caixa das tres quadras. No estadio, o anel de LED. No
     * estudio, uma volta curta em torno da quadra — andar mais do que isso ali
     * e' caminhar pro branco infinito, que nao e' lugar nenhum.
     */
    this.banhista.limite = !naQuadra ? LIMITE_DA_PRAIA
      : this.noEstadio ? { x: ESTADIO.passeio.x, z: ESTADIO.passeio.z }
      : { x: COURT.width / 2 + COURT.freeZone + 4, z: COURT.length / 2 + COURT.freeZone + 4 };

    // A legenda esconde as teclas da praia: tecla que nao faz nada na tela e'
    // pior do que tecla nenhuma.
    document.body.classList.toggle('cenario-quadra', naQuadra);
  }

  private aplicarAjustes(): void {
    /**
     * A dificuldade vale pra todos os bots da praia, inclusive os das quadras
     * que o jogador so' assiste — MENOS os que sao um personagem.
     *
     * Personagem joga com a ficha dele. Antes de existir esta excecao, a forca
     * do adversario do circuito tinha que ser aplicada DEPOIS de
     * `comecarPartida`, porque esta funcao, chamada por ela, devolvia todo bot
     * a' dificuldade do menu — e a ordem errada jogava o torneio inteiro no
     * nivel do amistoso sem ninguem notar. Agora a ordem nao importa.
     */
    for (const arena of this.arenas) {
      for (const atleta of [arena.home, arena.away]) {
        if (atleta instanceof AIPlayer && !atleta.personagem) {
          atleta.definirHabilidade(AI_SKILL[this.screens.ajustes.dificuldade]);
        }
      }
    }
    this.aplicarCenario();
    const resolucao = this.screens.ajustes.resolucao;
    const fixa = resolucao === 'auto' ? null : resolucao;
    // Ligar o AUTO parte da escala que estava valendo, e nao do zero.
    if (fixa === null && this.resolucaoFixa !== null) this.resolucaoAutomatica.reiniciar(this.resolucaoFixa);
    this.resolucaoFixa = fixa;
    this.onResize();
  }

  private comecarPartida(): void {
    this.screens.mostrarMenu(false);
    this.screens.esconderFim();
    this.hud.mostrar(true);
    // Partida nova comeca com o poder cheio: herdar a barra gasta do set
    // anterior e' punir por uma partida que ja' acabou.
    this.tempo.zerar();

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
    for (const arena of this.arenasVivas) {
      if (arena === minha || arena.match.estadoAtual === 'parada') arena.match.comecar();
    }
    this.state = 'playing';
  }

  private pausar(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.screens.mostrarPausa(true, this.placarDaPausa());
    // Sem cursor nao se clica em "continuar".
    this.input.destravarPonteiro();
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
    /**
     * No circuito, sair no meio da partida e' DESISTIR, e desistir e' perder.
     *
     * Sem isso, pausar e sair toda vez que o placar apertasse deixaria o
     * jogador repetir a partida ate' ganhar. O botao avisa antes — ver
     * `Screens.rotuloDeSair`.
     */
    if (this.modo === 'circuito' && this.adversario && this.progresso.torneio) {
      this.screens.mostrarPausa(false);
      const { voce, ele } = this.placarDoCircuito();
      this.state = 'over';
      this.registrarNoCircuito(false, voce, ele);
      return;
    }

    this.screens.mostrarPausa(false);
    this.screens.esconderFim();
    this.hud.mostrar(false);
    this.screens.mostrarMenu(true);
    this.state = 'menu';
  }

  /** O placar que a pausa mostra. Quem esta' na areia nao tem placar. */
  private placarDaPausa(): PlacarDaPausa | null {
    const arena = this.minhaArena;
    if (!arena || !this.player) return null;
    const { voce, ele } = this.placarDoCircuito();
    const t = this.progresso.torneio;
    const rotulo = this.modo === 'circuito' && t
      ? `${DEFINICAO[t.etapa].nome} · ${NOMES_DAS_RODADAS[t.rodada]}`
      : 'AMISTOSO';
    return { voce, ele, adversario: this.oponenteNa(arena)?.nome ?? 'CPU', rotulo };
  }

  /** MENU PRINCIPAL no fim do amistoso. No circuito o botao nem aparece. */
  private menuDepoisDoFim(): void {
    if (this.state !== 'over' || this.modo === 'circuito') return;
    this.sairProMenu();
  }

  private terminarPartida(venceu: boolean): void {
    const placar = this.minhaArena?.match.placar;
    if (!placar) return;

    this.state = 'over';

    if (this.modo === 'circuito' && this.adversario && this.progresso.torneio) {
      const { voce, ele } = this.placarDoCircuito();
      this.registrarNoCircuito(venceu, voce, ele);
      return;
    }

    const arena = this.minhaArena;
    const quem = arena ? this.oponenteNa(arena)?.nome ?? 'CPU' : 'CPU';
    // Do SEU lado, e nao casa x fora: na praia da' pra entrar pelo lado de la'.
    const { voce, ele } = this.placarDoCircuito();
    this.screens.mostrarFim(venceu, voce, ele, quem);
  }

  // ==================================================================
  // circuito
  // ==================================================================

  private salvarProgresso(): void {
    guardar(this.armazem, this.progresso);
  }

  /** O placar visto do SEU lado — voce pode estar em casa ou fora. */
  private placarDoCircuito(): { voce: number; ele: number } {
    const p = this.minhaArena?.match.placar ?? { home: 0, away: 0 };
    const emCasa = (this.player?.side ?? 'home') === 'home';
    return emCasa ? { voce: p.home, ele: p.away } : { voce: p.away, ele: p.home };
  }

  private comecarAmistoso(): void {
    this.sairDoModoCircuito();

    // Desafio e' um jogo contra ALGUEM: voce tem que estar numa quadra, e nao
    // assistindo da areia. O amistoso de sempre deixa voce onde estiver.
    if (this.desafiado && !this.player) this.entrarNaQuadra(this.arenaEmFoco, 'home');

    this.comecarPartida();

    const arena = this.minhaArena;
    if (!arena) return;
    if (this.desafiado) this.oponenteNa(arena)?.assumir(this.desafiado, this.habilidadeDoMenu);

    /**
     * O HUD so' le' nome no FOCO, e nao a cada quadro.
     *
     * `sairDoModoCircuito` ja' devolveu os bots a "CPU", mas o placar da tela
     * continuava escrito com o ultimo adversario do torneio — o estado certo e
     * o HUD errado, que e' o pior tipo de defeito: o teste do estado passa.
     */
    this.focar(arena);
    this.voarDoMenu();
  }

  /** A habilidade da CPU sem nome: a dificuldade escolhida no menu. */
  private get habilidadeDoMenu(): AiSkill {
    return AI_SKILL[this.screens.ajustes.dificuldade];
  }

  /** O bot do outro lado da rede, na quadra onde voce esta'. */
  private oponenteNa(arena: Arena): AIPlayer | null {
    const meuLado = this.player?.side ?? 'home';
    const outro = meuLado === 'home' ? arena.away : arena.home;
    return outro instanceof AIPlayer ? outro : null;
  }

  // ---------------------------------------------------------- o criador

  /** MEU JOGADOR: o banhista posa no fundo da quadra em foco, e a camera vai ate' ele. */
  private abrirCriador(): void {
    this.screens.mostrarMenu(false);
    this.criador = {
      giro: 0,
      giroVisto: 0,
      de: { posicao: this.camera.position.clone(), giro: this.camera.quaternion.clone() },
      t: 0,
      visivelAntes: this.banhista.objeto.visible,
      escondidos: [],
    };
    // A quadra vira estudio: sem os dois atletas e sem a bola parados no meio.
    const arena = this.arenaEmFoco;
    for (const o of [arena.home.objeto, arena.away.objeto, arena.ball.mesh]) {
      if (!o.visible) continue;
      o.visible = false;
      this.criador.escondidos.push(o);
    }
    this.voltaDoCriador = null;
    this.banhista.vestir(this.meuVisual);
    this.banhista.objeto.visible = true;
    this.screens.mostrarJogador(true, this.meuVisual);
  }

  private fecharCriador(): void {
    const c = this.criador;
    if (!c) return;
    this.banhista.objeto.visible = c.visivelAntes;
    for (const o of c.escondidos) o.visible = true;
    this.criador = null;
    this.voltaDoCriador = { posicao: this.camera.position.clone(), giro: this.camera.quaternion.clone(), t: 0 };
    this.screens.mostrarJogador(false);
    this.screens.mostrarMenu(true);
  }

  /**
   * Cada escolha vale na hora, e fica salva: no banhista que posa e no seu
   * atleta da quadra, que no menu continua la', parado.
   */
  private mudarMeuVisual(v: Visual): void {
    this.meuVisual = v;
    guardarMeuVisual(this.armazem, v);
    this.banhista.vestir(v);
    this.player?.vestir(v);
  }

  /** Um quadro do criador. No RELOGIO, como a camera do menu: o mundo esta' parado. */
  private cameraDoCriador(dt: number): void {
    const c = this.criador!;
    const court = this.arenaEmFoco.court;
    const k = CRIADOR;

    /**
     * O sol no espaco da quadra, so' no chao. A camera vai pro lado dele (o
     * sol fica atras dela, a luz cai no rosto), e na meia quadra pra onde ele
     * aponta: a foto olha pra rede, e o caminho da camera ao boneco nunca
     * atravessa a rede nem sai da zona livre.
     */
    court.paraMundo(_centroDaQuadra.set(0, 0, 0), _centroDaQuadra);
    court.paraLocal(_paraOSolLocal.copy(_centroDaQuadra).add(this.paraOSol), _paraOSolLocal);
    _paraOSolLocal.setY(0).normalize().applyAxisAngle(_EIXO_Y, k.tresQuartos);
    const meia = _paraOSolLocal.z >= 0 ? 1 : -1;
    const metade = k.distancia / 2;
    court.paraMundo(_ponto.set(-_paraOSolLocal.x * metade, 0, meia * k.fundo - _paraOSolLocal.z * metade), _ponto);
    court.paraMundo(_olhar.set(_paraOSolLocal.x * metade, k.altura, meia * k.fundo + _paraOSolLocal.z * metade), _olhar);

    // De frente pra camera, mais o giro pedido — que o boneco alcanca rapido.
    c.giroVisto += (c.giro - c.giroVisto) * Math.min(1, Math.min(dt, 0.1) * 9);
    this.banhista.posar(_ponto, Math.atan2(_olhar.x - _ponto.x, _olhar.z - _ponto.z) + c.giroVisto, Math.min(dt, 0.1));

    this.camera.position.copy(_olhar);
    this.camera.lookAt(_cameraAlvo.set(_ponto.x, k.alturaDoOlhar, _ponto.z));
    this.camera.rotateY(k.desvio);
    if (c.t < 1) {
      c.t = Math.min(1, c.t + Math.min(dt, 0.1) / k.voo);
      const e = suave(c.t);
      _destinoDoVoo.copy(this.camera.position);
      _giroDoVoo.copy(this.camera.quaternion);
      this.camera.position.lerpVectors(c.de.posicao, _destinoDoVoo, e);
      this.camera.quaternion.slerpQuaternions(c.de.giro, _giroDoVoo, e);
    }
  }

  private abrirElenco(): void {
    this.screens.mostrarMenu(false);
    this.screens.mostrarElenco(true, this.progresso.carreira);
  }

  private voltarDoElenco(): void {
    this.screens.mostrarElenco(false);
    this.screens.mostrarMenu(true);
  }

  /** Amistoso contra um personagem do elenco, escolhido na tela de adversarios. */
  private desafiar(p: Personagem): void {
    this.screens.mostrarElenco(false);
    this.desafiado = p;
    this.comecarAmistoso();
  }

  /**
   * Desfaz tudo o que o circuito pos no mundo.
   *
   * Cenario do menu de volta, e todo bot de volta a CPU sem nome: nome,
   * dificuldade do menu, corpo e roupa de sempre. Inclusive o desafiado do
   * amistoso anterior — quem desafia de novo veste ele outra vez.
   */
  private sairDoModoCircuito(): void {
    this.modo = 'amistoso';
    this.adversario = null;
    this.cenarioForcado = null;
    this.screens.rotuloDeSair(false);
    for (const arena of this.arenas) {
      for (const atleta of [arena.home, arena.away]) {
        if (atleta instanceof AIPlayer) atleta.assumir(null, this.habilidadeDoMenu);
      }
    }
  }

  private abrirCircuito(): void {
    this.screens.mostrarMenu(false);
    this.screens.mostrarChave(false);
    this.screens.esconderFim();
    this.hud.mostrar(false);
    this.state = 'menu';
    this.screens.mostrarCircuito(true, this.progresso.carreira, this.progresso.torneio);
  }

  private voltarDoCircuito(): void {
    this.screens.mostrarCircuito(false);
    this.sairDoModoCircuito();
    // O mundo atras do menu volta pro cenario que o jogador escolheu.
    this.aplicarCenario();
    this.screens.mostrarMenu(true);
  }

  /**
   * Continua o torneio desta etapa, ou abre um novo.
   *
   * A semente vem do relogio: cada torneio e' uma chave diferente. E ela vive
   * DENTRO do torneio salvo, entao fechar a aba e voltar nao sorteia de novo.
   */
  private escolherEtapa(etapa: Etapa): void {
    const t = this.progresso.torneio;
    const andando = t !== null && !t.eliminado && !t.campeao;
    if (!andando || t.etapa !== etapa) {
      this.progresso = { ...this.progresso, torneio: novoTorneio(etapa, Date.now() >>> 0) };
      this.salvarProgresso();
    }
    this.screens.mostrarCircuito(false);
    this.screens.mostrarChave(true, this.progresso.torneio!, this.progresso.carreira);
  }

  private abandonarTorneio(): void {
    this.progresso = { ...this.progresso, torneio: null };
    this.salvarProgresso();
    this.screens.mostrarCircuito(true, this.progresso.carreira, null);
  }

  private comecarPartidaDoCircuito(): void {
    const t = this.progresso.torneio;
    const ele = t ? adversarioAtual(t) : null;
    if (!t || !ele) return;

    this.modo = 'circuito';
    this.adversario = ele;
    this.cenarioForcado = DEFINICAO[t.etapa].local;
    this.screens.mostrarChave(false);
    this.screens.rotuloDeSair(true);

    /**
     * Voce joga do lado de CASA, e esta' dentro de uma quadra.
     *
     * No municipal o cenario e' a praia, onde da' pra estar andando fora de
     * quadra — e ali `aplicarCenario` NAO poe ninguem pra dentro, porque na
     * praia estar fora e' permitido. Sem isto a partida do torneio comecaria
     * com voce assistindo da areia.
     */
    if (this.player && this.player.side !== 'home') this.sairDaQuadra();
    if (!this.player) this.entrarNaQuadra(this.arenaEmFoco, 'home');

    this.comecarPartida();

    const arena = this.minhaArena;
    if (!arena) return;
    const oponente = this.oponenteNa(arena);
    if (oponente) {
      // O save so' guarda torneio com personagem que o elenco conhece, entao o
      // `null` aqui e' rede de baixo: joga a CPU do menu, com o nome da chave.
      oponente.assumir(personagemPorId(ele.id), this.habilidadeDoMenu);
      oponente.nome = ele.nome;
    }
    // Refaz o placar e os nomes do HUD, agora com o nome de verdade.
    this.focar(arena);
    this.voarDoMenu();
  }

  private registrarNoCircuito(venceu: boolean, voce: number, ele: number): void {
    const t = this.progresso.torneio;
    if (!t || !this.adversario) return;

    const saida = registrarPartida(t, this.progresso.carreira, venceu, { voce, ele });
    this.progresso = { versao: 1, carreira: saida.carreira, torneio: saida.torneio };
    this.salvarProgresso();

    this.screens.mostrarFimDoCircuito(this.adversario.nome, voce, ele, saida.desfecho, t.etapa);
  }

  /**
   * Depois do fim da partida: de volta pra chave.
   *
   * Sempre pra CHAVE, mesmo eliminado ou campeao — e' ali que se ve' onde voce
   * caiu, ou o caminho ate' a taca. De la', o VOLTAR leva ao circuito.
   */
  private seguirNoCircuito(): void {
    this.screens.esconderFim();
    this.hud.mostrar(false);
    this.state = 'menu';
    const t = this.progresso.torneio;
    if (t) this.screens.mostrarChave(true, t, this.progresso.carreira);
    else this.abrirCircuito();
  }

  // ==================================================================
  // laco
  // ==================================================================

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const inicio = performance.now();

    // Clamp de dt: voltar de uma aba em segundo plano nao pode teleportar todo
    // mundo. O medidor guarda o valor CRU — com o clamp, um quadro de 200 ms
    // apareceria como 50 e o F3 mentiria justamente quando importa.
    const cru = (now - this.lastTime) / 1000;
    this.lastFrameDt = cru;
    const dt = Math.min(cru, 1 / 20);
    this.lastTime = now;

    // De quem e' o teclado neste quadro. Uma linha so', no laco, porque o
    // estado muda em cinco lugares e manter cinco copias e' manter quatro
    // erradas.
    this.input.menuAberto = this.state !== 'playing';

    if (this.input.wasPressed('F3')) this.perf.toggle();
    if (this.input.wasPressed('KeyH')) this.hud.alternarManual();

    /**
     * Tudo que e' sobre ESTAR EM OUTRO LUGAR so' existe na praia.
     *
     * Sair, entrar, assistir a vizinha, voltar pra sua: sao quatro teclas que
     * pressupoem mais de uma quadra. No cenario de quadra unica elas nao tem
     * pra onde ir, e deixar cada uma falhar em silencio no seu proprio `if`
     * seria quatro jeitos diferentes de nao acontecer nada.
     */
    if (!this.quadraUnica) {
      if (this.input.wasPressed('BracketLeft')) this.assistir(this.arenaFoco - 1);
      if (this.input.wasPressed('BracketRight')) this.assistir(this.arenaFoco + 1);
      if (this.input.wasPressed('Tab')) this.voltarPraMinhaQuadra();
    }

    if (this.state === 'playing') {
      // Entrar e sair de quadra. Uma tecla so' vale de cada vez: quem esta'
      // jogando sai, quem esta' na areia entra.
      if (this.player) {
        /**
         * Sair da quadra vale nos TRES cenarios.
         *
         * Era bloqueado na quadra unica porque nao havia praia pra onde ir — e
         * com o estadio passou a haver: o piso da arena em volta da quadra e'
         * um lugar. O limite de quanto da' pra andar e' que muda por cenario,
         * e quem decide isso e' `aplicarCenario`.
         */
        /**
         * No circuito nao se sai da quadra no meio da partida.
         *
         * Sair entrega o seu lado pra um bot — e um bot que termina a partida
         * por voce ganharia (ou perderia) um jogo de torneio em seu nome.
         */
        if (this.input.wasPressed('KeyQ') && this.modo === 'amistoso') this.sairDaQuadra();
      } else {
        if (this.input.wasPressed('KeyE')) this.entrarNaQuadraMaisPerto();

        // Um clique na areia recaptura o cursor. E' o caminho de volta depois
        // do Esc — e o unico, porque o navegador so' concede depois de gesto.
        if (this.input.wasMousePressed(0)) this.input.travarPonteiro();
      }

      if (this.input.wasPressed('Escape')) this.pausar();
      else {
        this.update(dt);
        // No RELOGIO, e nao no dt do jogo: o dt tem teto de 1/20, e numa
        // maquina a 10 fps o voo de 1,3 s levaria o dobro, com o saque correndo.
        this.aplicarVoo(Math.min(cru, 0.5));
      }
    } else if (this.state === 'menu') {
      if (this.criador) this.cameraDoCriador(cru);
      else this.cameraDoMenu(cru);
    }
    // O R do "jogar de novo" e' da tela de fim (`Screens`), que so' mostra o
    // botao no amistoso: no circuito, repetir a partida perdida apagaria a
    // derrota.

    this.hud.update(dt);
    this.render();
    this.input.endFrame();

    /**
     * A resolucao automatica olha o quadro inteiro: quanto tempo passou desde
     * o anterior, e quanto disso foi trabalho nosso. Intervalo longo com pouco
     * trabalho e' a placa de video atrasando — o caso em que menos pixel ajuda.
     */
    if (this.resolucaoFixa === null && this.resolucaoAutomatica.amostrar(cru, (performance.now() - inicio) / 1000)) {
      this.aplicarEscala();
    }
  };

  /** Um passo de jogo. Publico: e' a porta de entrada dos testes. */
  update(dt: number): void {
    /**
     * O tempo do JOGO e o tempo do RELOGIO se separam aqui, e so' aqui.
     *
     * Tudo que e' mundo — bolas, atletas, relogio de saque, a camera que os
     * segue — anda em `dtJogo`. O que e' leitura do jogador continua no relogio:
     * a propria barra deste poder (que senao demoraria a recarregar na sua
     * propria camera lenta) e o aviso do ponto, la' no laco.
     *
     * A barra de FORCA fica de propósito do lado do mundo: ela e' um QTE de
     * 180 ms, e comprar tempo pra acertar a zona e' o poder inteiro.
     */
    const querLento = this.player !== null
      && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const dtJogo = dt * this.tempo.passo(dt, querLento);

    // Todas as arenas VIVAS avancam, inclusive as que ninguem esta' olhando. E'
    // o que faz a praia ter jogo acontecendo em vez de quadras congeladas — e
    // no cenario de quadra unica a lista tem um item so'.
    for (const arena of this.arenasVivas) arena.update(dtJogo);

    // O banhista so' anda quando existe: dentro da quadra quem se mexe e' o
    // atleta, e o corpo na areia esta' guardado.
    if (!this.player) {
      this.girarACamera();
      this.banhista.update(dtJogo);
      this.atualizarPasseio();
      // Quem passeia tambem esbarra na rede: ela reage a qualquer corpo, e nao
      // so' a quem esta' jogando.
      for (const arena of this.arenasVivas) {
        arena.encostarNaRede(this.banhista, this.banhista.posicao, !this.banhista.motor.noChao, dtJogo, this.banhista.motor);
      }
    }

    // A roda aproxima e afasta nos DOIS modos. O que muda e' o que ela mexe:
    // andando, o raio da orbita; jogando, a altura e a distancia da camera.
    this.rig.aproximar(this.input.roda);

    const carga = this.player?.leituraDaCarga;
    this.hud.carga(
      this.player?.carregandoAtaque ? this.player.forcaDoAtaque : -1,
      carga?.naZona ?? false,
      carga?.passou ?? false,
    );
    this.hud.janelaDeToque(this.player?.janelaDeToque ?? -1);
    this.avisarQualidadeDoToque();
    this.hud.relogioDoSaque(this.minhaArena?.match.segundosParaSacar ?? null);
    // A barra do poder so' existe pra quem esta' em quadra: na areia nao ha'
    // toque pra salvar, e um recurso na tela sem uso e' so' ruido.
    this.hud.tempo(this.player ? this.tempo.fracao : -1, this.tempo.ativo);

    this.rig.update(dtJogo);
  }

  /**
   * Conta pro jogador como saiu o toque que ele acabou de dar.
   *
   * O gatilho e' o CONTADOR do Hitter, e nao a qualidade: dois toques seguidos
   * podem sair identicos, e comparar qualidade perderia o segundo.
   *
   * Saque nao entra. Ele sai da mao, parado e no eixo do corpo — nao ha'
   * contato pra medir, e um "NO PONTO" garantido a cada saque so' ensinaria o
   * jogador a ignorar o aviso.
   */
  private avisarQualidadeDoToque(): void {
    const hitter = this.player?.hitter;
    if (!hitter || hitter.toques === this.ultimoToqueVisto) return;

    this.ultimoToqueVisto = hitter.toques;

    /**
     * Quando o golpe foi um ATAQUE ou um SAQUE, quem manda no aviso e' a barra.
     *
     * Os dois avisos ocupam a mesma linha da tela, e nesses golpes o tempo do
     * dedo e' o que o jogador acabou de decidir — dizer "NA PONTA" pra quem
     * passou da zona mandaria consertar a coisa errada.
     */
    const cobraACarga = hitter.ultimaAcao === 'saque'
      || hitter.ultimaAcao === 'ataque'
      || hitter.ultimaAcao === 'cortada';

    if (cobraACarga) this.hud.avisoDaCarga(this.player!.ultimaLeituraDaCarga.naZona, this.player!.ultimaLeituraDaCarga.passou);
    else this.hud.qualidadeDoToque(hitter.ultimaQualidade);
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
   * Voce entra com o corpo que montou (`meuVisual`). A cor do LADO fica na
   * capsula, que e' o que aparece enquanto as pecas nao chegam.
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
    humano.vestir(this.meuVisual);
    arena.ocupar(lado, humano);
    this.player = humano;
    // Hitter novo, contador novo: sem isto o primeiro toque na quadra nova
    // passaria despercebido ou dispararia um aviso que nao aconteceu.
    this.ultimoToqueVisto = 0;

    this.banhista.objeto.visible = false;
    this.hud.dicaDaPraia(null);
    this.hud.esconderAvisoDeQuadra();

    // Dentro da quadra o cursor volta a ser cursor: e' por ele que a mira
    // resolve um ponto no chao.
    this.input.destravarPonteiro();

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

    // Fora da quadra o mouse vira camera, e camera pede cursor capturado: solto,
    // ele para de andar na borda da tela e o giro morre no meio.
    this.input.travarPonteiro();

    // O placar volta a ser de CPU contra CPU: quem estava escrito ali era voce,
    // e voce acabou de sair.
    this.focar(arena);
  }

  /**
   * Girar a camera com o mouse. So' fora da quadra.
   *
   * Exige BOTAO SEGURADO, e nao mouse solto. Sem pointer lock o cursor tem uma
   * posicao na tela que importa — e' por ela que a mira do jogo se resolve — e
   * uma camera que gira com o cursor solto giraria tambem quando a mao so'
   * atravessa a tela pra chegar em outro canto. Arrastar e' a intencao dita.
   *
   * Qualquer botao serve: aqui nenhum deles tem outro trabalho.
   */
  private girarACamera(): void {
    /**
     * Com o cursor capturado, mover o mouse ja' gira: e' pra isso que ele foi
     * capturado. Sem captura ainda da' pra girar ARRASTANDO com qualquer botao
     * — e sem captura acontece de verdade, porque o navegador recusa enquanto
     * nao houver gesto do usuario e desfaz a captura a cada Esc.
     *
     * Exigir botao no caso solto nao e' teimosia: sem captura o cursor tem uma
     * posicao na tela que importa, e uma camera que girasse com o cursor solto
     * giraria tambem quando a mao so' atravessa a tela pra chegar noutro canto.
     */
    const gira = this.input.ponteiroTravado
      || this.input.isMouseDown(0)
      || this.input.isMouseDown(1)
      || this.input.isMouseDown(2);

    if (gira) this.rig.orbitar(this.input.arrasteX, this.input.arrasteY);
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
      // Longe de tudo, a dica vira o aviso de que o mouse esta' solto — que e'
      // a unica coisa que o jogador precisa saber pra girar a camera de novo.
      this.hud.dicaDaPraia(this.input.ponteiroTravado ? null : 'GIRAR A CAMERA COM O MOUSE', 'CLIQUE');
      return;
    }

    const nome = PRAIA[this.arenas.indexOf(perto.arena)]?.nome ?? perto.arena.id;
    const cor = perto.lado === 'home' ? 'AZUL' : 'VERMELHO';
    this.hud.dicaDaPraia(`ENTRAR NA QUADRA ${nome} · LADO ${cor}`, 'E');
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

  /**
   * A volta da camera atras do menu. Roda no RELOGIO (`cru`, sem o teto do
   * dt): o mundo esta' parado, e o que anda aqui e' so' o olhar.
   */
  private cameraDoMenu(dt: number): void {
    const c = MENU_CAMERA;
    this.giroDoMenu += Math.min(dt, 0.1) * c.velocidade;
    this.arenaEmFoco.court.paraMundo(_centroDoMenu.set(0, 0, 0), _centroDoMenu);
    this.camera.position.set(
      _centroDoMenu.x + Math.sin(this.giroDoMenu) * c.raio,
      c.altura,
      _centroDoMenu.z + Math.cos(this.giroDoMenu) * c.raio,
    );
    this.camera.lookAt(_centroDoMenu.x, c.alturaDoOlhar, _centroDoMenu.z);
    this.camera.rotateY(c.desvio);

    // Voltando do criador: da pose de la' ate' a volta, sem corte seco.
    const v = this.voltaDoCriador;
    if (v) {
      v.t = Math.min(1, v.t + Math.min(dt, 0.1) / CRIADOR.voo);
      const e = suave(v.t);
      _destinoDoVoo.copy(this.camera.position);
      _giroDoVoo.copy(this.camera.quaternion);
      this.camera.position.lerpVectors(v.posicao, _destinoDoVoo, e);
      this.camera.quaternion.slerpQuaternions(v.giro, _giroDoVoo, e);
      if (v.t >= 1) this.voltaDoCriador = null;
    }

    this.poseDoMenu ??= { posicao: new THREE.Vector3(), giro: new THREE.Quaternion() };
    this.poseDoMenu.posicao.copy(this.camera.position);
    this.poseDoMenu.giro.copy(this.camera.quaternion);
  }

  /**
   * Sai do menu VOANDO: da pose em que o menu deixou a camera ate' atras do
   * jogador, em `VOO_DO_MENU` segundos. Sem isto o corte seria seco — a quadra
   * do menu some e a de jogo aparece.
   *
   * Duracao FIXA, e nao o amaciamento da camera de jogo: aquele e' feito pra
   * seguir um atleta que corre, e do outro lado da quadra ele levava mais de
   * dois segundos pra chegar — com o relogio do saque ja' correndo.
   *
   * Chamar DEPOIS de focar a quadra. Na areia (passeio) nao voa: aquela camera
   * e' rigida e ignoraria a pose.
   */
  private voarDoMenu(): void {
    const pose = this.poseDoMenu;
    this.poseDoMenu = null;
    if (!pose || this.rig.modoAtual === 'passeio') return;
    this.voo = { posicao: pose.posicao, giro: pose.giro, t: 0 };
    this.aplicarVoo(0);
  }

  /**
   * Um quadro do voo. O destino e' onde a camera de jogo quer estar AGORA
   * (`encaixar`), e nao onde ela estava na largada: o jogador pode andar
   * durante o voo, e a camera chega nele, e nao no lugar vazio de antes.
   */
  private aplicarVoo(dt: number): void {
    const v = this.voo;
    if (!v) return;
    v.t = Math.min(1, v.t + dt / VOO_DO_MENU);
    this.rig.encaixar();
    const e = v.t * v.t * (3 - 2 * v.t);
    _destinoDoVoo.copy(this.camera.position);
    _giroDoVoo.copy(this.camera.quaternion);
    this.camera.position.copy(v.posicao).lerp(_destinoDoVoo, e);
    this.camera.quaternion.copy(v.giro).slerp(_giroDoVoo, e);
    if (v.t >= 1) this.voo = null;
  }

  private render(): void {
    // O info do three zera sozinho a cada render(): ler ANTES do proximo passe.
    const alvo = this.renderer.getDrawingBufferSize(_bufSize);
    const escala = `${Math.round(this.escalaDeResolucao * 100)}%${this.resolucaoFixa === null ? ' auto' : ''}`;
    this.perf.sample(this.lastFrameDt, this.renderer.info, alvo.x, alvo.y, escala);

    this.renderer.render(this.scene, this.camera);
  }

  private get escalaDeResolucao(): number {
    return this.resolucaoFixa ?? this.resolucaoAutomatica.escala;
  }

  /** So' a densidade de pixels: e' o que a resolucao automatica muda. */
  private aplicarEscala(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.escalaDeResolucao);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.aplicarEscala();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    for (const d of this.descartaveis) d.dispose();
    // O modelo e' UM: as arenas so' tem clones, que compartilham geometria e
    // material. Quem descarta e' o molde, e uma vez so'.
    this.modeloDaQuadra?.dispose();
    this.corpos?.dispose();
    descartarGeometriasDeAtleta();
    this.renderer.dispose();
  }
}
