import * as THREE from 'three';
import { COLORS, MATCH } from '../config';
import { Ball } from '../ball/Ball';
import { LigacaoDoRally, Match, type EventosDaPartida } from '../match/Match';
import { AIPlayer } from '../players/AI';
import type { Athlete } from '../players/Athlete';
import { Human } from '../players/Human';
import { Court, type Side } from './Court';
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
    const rally = new LigacaoDoRally();
    this.home = this.criarBot('home', rally);
    this.away = this.criarBot('away', rally);

    this.match = new Match(this.court, this.ball, this.home, this.away, eventos);
    rally.match = this.match;

    this.ball.aoTocar = (por) => this.match.registrarToque(por.side);
  }

  private criarBot(lado: Side, rally: LigacaoDoRally): AIPlayer {
    const bot = new AIPlayer(
      lado === 'home' ? 'CPU' : 'CPU',
      lado,
      lado === 'home' ? COLORS.home : COLORS.away,
      this.court,
      this.ball,
      rally,
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
  ocupar(lado: Side, quem: Athlete): Athlete {
    const antigo = lado === 'home' ? this.home : this.away;
    this.raiz.remove(antigo.objeto);
    antigo.dispose();

    if (lado === 'home') this.home = quem;
    else this.away = quem;

    this.raiz.add(quem.objeto);
    this.match.trocarAtleta(lado, quem);
    return antigo;
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
