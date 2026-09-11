import * as THREE from 'three';
import { COLORS, MATCH } from '../config';
import { Ball } from '../ball/Ball';
import { LigacaoDoRally, Match, type EventosDaPartida } from '../match/Match';
import { AIPlayer } from '../players/AI';
import type { Athlete } from '../players/Athlete';
import { Human } from '../players/Human';
import { Court, sinalDe, type Side } from './Court';
import { construirQuadra, type Colisores } from './buildCourt';
import { Markers } from './Markers';

/**
 * Uma partida, numa quadra, num lugar do mundo.
 *
 * Ate' agora isto era o Game inteiro: uma quadra, uma bola, uma partida e dois
 * atletas, tudo cravado no orquestrador. Funcionava, e era o certo enquanto
 * havia uma quadra so'.
 *
 * A Arena e' o mesmo conteudo, autocontido e POSICIONAVEL. Nada aqui e' global
 * e nada conhece o Game: ela recebe onde fica, monta o que precisa, e roda
 * sozinha no `update`. Instanciar dez e' instanciar dez.
 *
 * E' isto que o prototipo em Unity ja' prometia no WorldHub e nunca entregou —
 * a promessa era legitima, porque o Court sempre resolveu tudo em espaco
 * LOCAL. Mover a quadra nunca exigiu tocar em bola, jogador ou IA.
 */
export class Arena {
  readonly court: Court;
  readonly colisores: Colisores;
  readonly ball: Ball;
  readonly match: Match;
  readonly markers = new Markers();

  /** Tudo que e' desenhado desta arena pendura aqui. */
  readonly raiz = new THREE.Group();

  /** Os dois lados. Qualquer um pode ser humano ou bot. */
  home: Athlete;
  away: Athlete;

  private readonly descartaveis: Array<{ dispose(): void }> = [];

  /** Segundos ate' os bots comecarem a partida seguinte. */
  private descanso = MATCH.descansoEntrePartidas;

  /**
   * A ligacao que os atletas desta arena usam pra perguntar do rally.
   *
   * Publica porque quem cria o humano e' o Game (so' ele tem camera e input), e
   * um atleta com ligacao propria responderia "rally parado" a partida inteira
   * e nunca tocaria na bola.
   */
  readonly rally = new LigacaoDoRally();

  constructor(
    readonly id: string,
    posicao: THREE.Vector3,
    rotacaoY: number,
    eventos: EventosDaPartida = {},
  ) {
    this.court = new Court(posicao, rotacaoY);

    const quadra = construirQuadra(this.court);
    this.raiz.add(quadra.root);
    this.colisores = quadra.colisores;
    this.descartaveis.push(...quadra.descartaveis);

    this.ball = new Ball(this.court, this.colisores);
    this.raiz.add(this.ball.mesh);
    this.descartaveis.push(this.ball);

    this.raiz.add(this.markers.group);
    this.descartaveis.push(this.markers);

    /**
     * Os dois lados nascem como BOTS.
     *
     * Uma arena tem que jogar sozinha — e' o que faz dez quadras numa praia
     * terem jogo acontecendo em vez de dez quadras vazias. Quando um humano
     * entra, ele substitui um dos dois (`ocupar`), e quando sai o bot volta.
     */
    this.home = this.criarBot('home');
    this.away = this.criarBot('away');

    this.match = new Match(this.court, this.ball, this.home, this.away, eventos);
    this.rally.match = this.match;

    this.ball.aoTocar = (por) => this.match.registrarToque(por.side);
  }

  private criarBot(lado: Side): AIPlayer {
    const bot = new AIPlayer(
      'CPU',
      lado,
      lado === 'home' ? COLORS.home : COLORS.away,
      this.court,
      this.ball,
      this.rally,
    );
    this.raiz.add(bot.objeto);
    return bot;
  }

  /**
   * Poe um humano num dos lados, no lugar do bot.
   *
   * O atleta que sai e' DESCARTADO e o que entra e' novo. Trocar o "cerebro"
   * de um atleta existente seria menos alocacao, mas obrigaria Human e AI a
   * compartilharem estado mutavel — e a primeira coisa a quebrar seria o buffer
   * de toque do humano herdando o cooldown do bot.
   */
  ocupar(lado: Side, quem: Athlete): void {
    this.trocar(lado, quem);
  }

  /**
   * Tira o humano e devolve o bot.
   *
   * A partida NAO recomeca: placar, saque e contagem de toques continuam de pe'
   * e o bot assume no proximo toque. Sair no meio de um rally significa que a
   * bola que estava vindo pra voce vai pro bot, que e' o mesmo que aconteceria
   * numa quadra de verdade se voce saisse andando.
   */
  liberar(lado: Side): void {
    this.trocar(lado, this.criarBot(lado));
  }

  private trocar(lado: Side, quem: Athlete): void {
    const antigo = lado === 'home' ? this.home : this.away;
    this.raiz.remove(antigo.objeto);
    antigo.dispose();

    if (lado === 'home') this.home = quem;
    else this.away = quem;

    if (quem.objeto.parent !== this.raiz) this.raiz.add(quem.objeto);
    this.match.trocarAtleta(lado, quem);

    /**
     * Se a bola estava na mao de quem saiu, ela vai pra mao de quem entrou.
     *
     * A bola presa segue uma ANCORA — um Object3D dentro do corpo do sacador.
     * Trocar de atleta no meio da espera do saque deixa essa ancora fora da
     * cena, e a bola congela no ar onde o corpo antigo estava, esperando um
     * saque que nao vem mais.
     */
    if (this.match.estadoAtual === 'esperandoSaque' && this.match.quemSaca === lado) {
      quem.prepararSaque();
      this.ball.prender(quem.ancoraDeSaque);
    }
  }

  /**
   * Qual lado desta quadra esta' mais perto deste ponto, e a que distancia.
   *
   * A distancia e' ate' a AREA DE JOGO daquele lado (meia quadra + zona livre),
   * nao ate' o centro: quem chega pela lateral esta' tao perto de entrar quanto
   * quem chega pelo fundo, e medir do centro diria que nao.
   */
  ladoMaisPerto(mundo: THREE.Vector3): { lado: Side; distancia: number } {
    this.court.paraLocal(mundo, _local);
    const lado: Side = _local.z < 0 ? 'home' : 'away';

    const foraX = Math.max(0, Math.abs(_local.x) - this.court.halfWidthFree);
    // Em Z a area do lado vai da rede (0) ate' a linha de fundo mais a zona livre.
    const z = Math.abs(_local.z);
    const foraZ = Math.max(0, z - this.court.halfLengthFree);

    return { lado, distancia: Math.hypot(foraX, foraZ) };
  }

  /** Onde quem sai desta quadra reaparece: do lado de fora, atras do fundo. */
  saidaDe(lado: Side, out: THREE.Vector3): THREE.Vector3 {
    return this.court.paraMundo(
      _local.set(0, 0, sinalDe(lado) * (this.court.halfLengthFree + SAIDA)),
      out,
    );
  }

  /** O humano desta arena, se houver. O espectador nao tem. */
  get humano(): Human | null {
    if (this.home instanceof Human) return this.home;
    if (this.away instanceof Human) return this.away;
    return null;
  }

  update(dt: number): void {
    this.recomecarSeAcabou(dt);
    this.match.update(dt);
    this.home.update(dt);
    this.away.update(dt);
    this.ball.update(dt);
    this.atualizarMarcadores();
  }

  /**
   * Uma quadra de bots nunca fica parada.
   *
   * Sem isto, a quadra que o jogador so' assiste joga uma partida, alguem
   * chega a 15 e a quadra morre ali — dois bonecos de pe' olhando pra uma bola
   * na mao, pro resto da sessao. Numa praia com varias quadras, a segunda vez
   * que o jogador passa por ali ja' encontra cenario em vez de jogo.
   *
   * Onde ha' humano isto NAO vale: quem perdeu tem direito a ver o placar
   * final e decidir se joga de novo.
   */
  private recomecarSeAcabou(dt: number): void {
    if (this.match.estadoAtual !== 'acabou' || this.humano !== null) return;

    this.descanso -= dt;
    if (this.descanso > 0) return;

    this.descanso = MATCH.descansoEntrePartidas;
    this.match.comecar();
  }

  /**
   * Os aneis no chao desta arena.
   *
   * A mira so' aparece se houver humano aqui — numa quadra de bots ela seria
   * ruido, e com dez quadras na tela ruido vira sujeira.
   */
  private atualizarMarcadores(): void {
    if (this.ball.presa || this.ball.parada) {
      this.markers.esconderQueda();
    } else {
      const tempo = this.ball.preverPouso(this.court.floorY + this.ball.raio, _queda);
      _queda.y = this.court.floorY;
      if (tempo > 0.08) this.markers.mostrarQueda(_queda, tempo);
      else this.markers.esconderQueda();
    }

    const humano = this.humano;
    const vale = humano !== null
      && (humano.sacando || this.court.ladoDe(this.ball.posicao) === humano.side);

    if (vale && humano) this.markers.mostrarMira(humano.pontoDeMira, humano.forcaDoAtaque);
    else this.markers.esconderMira();
  }

  /** Deixa os marcadores visiveis pro aquecimento de shaders. */
  prepararAquecimento(): void {
    this.markers.prepararAquecimento();
  }

  esconderMarcadores(): void {
    this.markers.esconderQueda();
    this.markers.esconderMira();
  }

  dispose(): void {
    this.home.dispose();
    this.away.dispose();
    for (const d of this.descartaveis) d.dispose();
  }
}

const _queda = new THREE.Vector3();
const _local = new THREE.Vector3();

/** Quantos metros pra fora da area de jogo quem sai da quadra reaparece. */
const SAIDA = 2;
