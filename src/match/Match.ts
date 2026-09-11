import * as THREE from 'three';
import { MATCH } from '../config';
import type { Ball } from '../ball/Ball';
import type { EstadoDoRally } from '../players/Athlete';
import { oposto, type Court, type Side } from '../world/Court';

export type EstadoDaPartida = 'parada' | 'esperandoSaque' | 'rally' | 'intervalo' | 'acabou';

/** Por que o ponto aconteceu. Vira texto no HUD. */
export type MotivoDoPonto = 'BOLA NO CHAO' | 'BOLA FORA' | 'QUATRO TOQUES' | 'DEMOROU NO SAQUE';

/** O minimo que a partida precisa saber sobre um atleta. */
export interface AtletaDaPartida {
  readonly side: Side;
  readonly nome: string;
  readonly ancoraDeSaque: THREE.Object3D;
  prepararSaque(): void;
  aoComecarORally(): void;
  aoTerminarOPonto(): void;
}

export interface EventosDaPartida {
  placarMudou?(home: number, away: number): void;
  saqueMudou?(lado: Side): void;
  pontoFeito?(lado: Side, motivo: MotivoDoPonto): void;
  partidaAcabou?(vencedor: Side): void;
  estadoMudou?(estado: EstadoDaPartida): void;
}

/**
 * As regras: placar, saque, contagem de toques e fim de jogo.
 *
 * Cuida de UMA partida em UMA quadra, recebida por injecao. Nao tem estado
 * global nem singleton, e nao sabe como a cena foi montada — instanciar um por
 * quadra, num mundo aberto, seria imediato.
 *
 * Nao importa nada de render: e' logica pura e testavel sem navegador.
 */
export class Match implements EstadoDoRally {
  private homeScore = 0;
  private awayScore = 0;
  private toquesHome = 0;
  private toquesAway = 0;

  private sacador: Side = 'home';
  private ladoDaBola: Side = 'home';
  private estado: EstadoDaPartida = 'parada';
  private tempoDeIntervalo = 0;
  /** Segundos que restam pro sacador bater. Vale so' em 'esperandoSaque'. */
  private tempoDeSaque = 0;

  /**
   * Um rally marca UM ponto. Sem esta trava, a bola que quica duas vezes no
   * chao dentro da quadra marcaria dois — e o placar andaria sozinho.
   */
  private pontoResolvido = false;

  vencedor: Side | null = null;

  constructor(
    private court: Court,
    private ball: Ball,
    private home: AtletaDaPartida,
    private away: AtletaDaPartida,
    readonly eventos: EventosDaPartida = {},
  ) {
    this.ball.aoTocarOChao = (tipo, ponto) => this.aoTocarOChao(tipo, ponto);
  }

  // ---- EstadoDoRally ---------------------------------------------------
  get maxToques(): number { return MATCH.maxTouches; }
  get rallyVivo(): boolean { return this.estado === 'rally'; }

  toquesDoLado(lado: Side): number {
    return lado === 'home' ? this.toquesHome : this.toquesAway;
  }

  // ---- leitura ---------------------------------------------------------
  get placar(): { home: number; away: number } {
    return { home: this.homeScore, away: this.awayScore };
  }
  get quemSaca(): Side { return this.sacador; }
  get estadoAtual(): EstadoDaPartida { return this.estado; }

  /** Segundos restantes pro saque, ou null fora da espera. O HUD le' daqui. */
  get segundosParaSacar(): number | null {
    return this.estado === 'esperandoSaque' ? Math.max(0, this.tempoDeSaque) : null;
  }

  /**
   * Troca quem joga de um lado.
   *
   * Existe pra um humano ocupar o lugar de um bot sem derrubar a partida: o
   * placar, o saque e a contagem de toques continuam de pe'. O atleta novo
   * assume no proximo saque, e ate' la' fica onde nasceu.
   */
  trocarAtleta(lado: Side, quem: AtletaDaPartida): void {
    if (lado === 'home') this.home = quem;
    else this.away = quem;
  }

  /** Zera tudo e comeca a partida. */
  comecar(): void {
    this.homeScore = 0;
    this.awayScore = 0;
    this.vencedor = null;
    this.sacador = 'home';

    // Sair de "acabou" ANTES de sacar: iniciarSaque recusa nesse estado, e o
    // botao de jogar novamente ficaria sem efeito.
    this.mudarEstado('parada');

    this.avisarPlacar();
    this.iniciarSaque();
  }

  update(dt: number): void {
    if (this.estado === 'intervalo') {
      this.tempoDeIntervalo -= dt;
      if (this.tempoDeIntervalo <= 0) this.iniciarSaque();
      return;
    }

    /**
     * O relogio do saque.
     *
     * Sem ele, quem esta' perdendo simplesmente nao saca — e nao ha' nada no
     * jogo que o obrigue. E' a mesma razao pela qual a regra existe no volei de
     * verdade, onde o sacador tem 8 segundos depois do apito.
     */
    if (this.estado === 'esperandoSaque') {
      this.tempoDeSaque -= dt;
      if (this.tempoDeSaque <= 0) this.darPonto(oposto(this.sacador), 'DEMOROU NO SAQUE');
      return;
    }

    if (this.estado !== 'rally') return;

    this.acompanharCruzamentoDaRede();
  }

  /**
   * Cada vez que a bola cruza a rede, a contagem de toques recomeca.
   *
   * E' por CRUZAMENTO, nao por toque: e' o cruzamento que devolve a posse, e
   * um lado pode dar seus tres toques em qualquer ordem antes disso.
   */
  private acompanharCruzamentoDaRede(): void {
    const atual = this.court.ladoDe(this.ball.posicao);
    if (atual === this.ladoDaBola) return;

    this.ladoDaBola = atual;
    this.toquesHome = 0;
    this.toquesAway = 0;
  }

  private iniciarSaque(): void {
    if (this.estado === 'acabou') return;

    this.toquesHome = 0;
    this.toquesAway = 0;
    this.pontoResolvido = false;
    this.ladoDaBola = this.sacador;
    this.tempoDeSaque = MATCH.tempoLimiteDeSaque;

    const sacador = this.sacador === 'home' ? this.home : this.away;
    const recebedor = this.sacador === 'home' ? this.away : this.home;

    recebedor.aoTerminarOPonto();
    sacador.prepararSaque();

    this.ball.esquecerToques();
    this.ball.prender(sacador.ancoraDeSaque);

    this.mudarEstado('esperandoSaque');
    this.eventos.saqueMudou?.(this.sacador);
  }

  /**
   * Registra um toque. Chamado pelo Game depois que um atleta bate na bola.
   *
   * Fica aqui, e nao num callback da bola, porque a bola nao deve saber o que
   * e' um saque nem o que e' o quarto toque.
   */
  registrarToque(lado: Side): void {
    if (this.estado === 'esperandoSaque') {
      // So' o lado que saca inicia o rally. Um toque do outro lado antes disso
      // e' ruido, nao jogada.
      if (lado !== this.sacador) return;

      this.ladoDaBola = this.sacador;
      this.toquesHome = 0;
      this.toquesAway = 0;
      this.mudarEstado('rally');

      this.home.aoComecarORally();
      this.away.aoComecarORally();
      return;
    }

    if (this.estado !== 'rally') return;

    const toques = lado === 'home' ? ++this.toquesHome : ++this.toquesAway;
    if (toques > MATCH.maxTouches) this.darPonto(oposto(lado), 'QUATRO TOQUES');
  }

  private aoTocarOChao(tipo: 'chao' | 'fora', ponto: THREE.Vector3): void {
    if (this.estado !== 'rally') return;

    if (tipo === 'chao') {
      // Dentro das linhas: o ponto e' de quem NAO tem esse lado.
      this.darPonto(oposto(this.court.ladoDe(ponto)), 'BOLA NO CHAO');
      return;
    }

    // Fora: o ponto e' de quem NAO tocou por ultimo. Sem toque nenhum (saque
    // direto pra fora), e' de quem recebe.
    const ultimo = this.ball.ultimoTocador?.side ?? null;
    this.darPonto(ultimo ? oposto(ultimo) : oposto(this.sacador), 'BOLA FORA');
  }

  private darPonto(lado: Side, motivo: MotivoDoPonto): void {
    if (this.pontoResolvido) return;
    this.pontoResolvido = true;

    if (lado === 'home') this.homeScore++;
    else this.awayScore++;

    this.avisarPlacar();
    this.eventos.pontoFeito?.(lado, motivo);

    // Rally point: quem faz o ponto passa a sacar.
    this.sacador = lado;

    if (this.venceu(lado)) {
      this.vencedor = lado;
      this.mudarEstado('acabou');
      this.eventos.partidaAcabou?.(lado);
      return;
    }

    this.tempoDeIntervalo = Math.max(0.2, MATCH.pointBreak);
    this.mudarEstado('intervalo');
  }

  private venceu(lado: Side): boolean {
    const meus = lado === 'home' ? this.homeScore : this.awayScore;
    const dele = lado === 'home' ? this.awayScore : this.homeScore;

    // O teto existe pra uma partida no 24 a 24 nao virar eterna.
    if (MATCH.hardCap > 0 && meus >= MATCH.hardCap) return true;
    if (meus < MATCH.pointsToWin) return false;
    if (!MATCH.winByTwo) return true;
    return meus - dele >= 2;
  }

  private mudarEstado(valor: EstadoDaPartida): void {
    if (this.estado === valor) return;
    this.estado = valor;
    this.eventos.estadoMudou?.(valor);
  }

  private avisarPlacar(): void {
    this.eventos.placarMudou?.(this.homeScore, this.awayScore);
  }
}

/**
 * Desfaz o no' entre o Match e os atletas.
 *
 * O Match precisa dos atletas pra saber quem saca; os atletas precisam do
 * estado do rally pra saber se podem tocar. Um depende do outro no construtor.
 *
 * Esta ligacao nasce vazia, e' passada aos atletas e aponta pro Match assim que
 * ele existe. Antes disso responde "rally parado, zero toques", que e'
 * exatamente a verdade naquele instante.
 */
export class LigacaoDoRally implements EstadoDoRally {
  match: Match | null = null;

  toquesDoLado(lado: Side): number {
    return this.match?.toquesDoLado(lado) ?? 0;
  }

  get maxToques(): number { return MATCH.maxTouches; }
  get rallyVivo(): boolean { return this.match?.rallyVivo ?? false; }
}
