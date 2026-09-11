import * as THREE from 'three';
import { COURT, PLAYER } from '../config';
import type { Ball, Tocador } from '../ball/Ball';
import { Court, oposto, type Side } from '../world/Court';
import { construirAtleta, type AtletaVisual } from './buildAthlete';
import { Hitter } from './Hitter';
import { Motor } from './Motor';

const _direcao = new THREE.Vector3();
const _ponto = new THREE.Vector3();
const _local = new THREE.Vector3();

/** O que o atleta precisa saber sobre o rally, sem conhecer o Match inteiro. */
export interface EstadoDoRally {
  /** Quantos toques o lado ja' deu na jogada atual. */
  toquesDoLado(lado: Side): number;
  readonly maxToques: number;
  /** A bola esta' em jogo? (nao e' intervalo nem fim de partida) */
  readonly rallyVivo: boolean;
}

/**
 * Base comum do jogador humano e da IA.
 *
 * Tudo que liga o atleta a' quadra passa pelo construtor. Nada aqui e' global
 * e nada e' posicao absoluta: o mesmo atleta serve pra qualquer quadra, que e'
 * o que vai permitir o mundo aberto sem refatorar.
 */
export abstract class Athlete implements Tocador {
  readonly motor: Motor;
  readonly hitter = new Hitter();
  readonly visual: AtletaVisual;

  /** Esta' esperando pra sacar? */
  sacando = false;

  constructor(
    readonly nome: string,
    readonly side: Side,
    cor: number,
    protected court: Court,
    protected ball: Ball,
    protected rally: EstadoDoRally,
  ) {
    this.visual = construirAtleta(cor, COURT.serveBallHeight);
    this.motor = new Motor((posicao, out) => this.court.limitarArea(posicao, this.side, out));
    this.voltarParaOSpawn();
  }

  get objeto(): THREE.Object3D { return this.visual.root; }
  get posicao(): THREE.Vector3 { return this.motor.posicao; }
  get ancoraDeSaque(): THREE.Object3D { return this.visual.ancoraDeSaque; }

  abstract update(dt: number): void;

  /** Chamado pelo Match quando este atleta vai sacar. */
  prepararSaque(): void {
    this.sacando = true;
    this.hitter.zerarEspera();
    this.motor.colocarEm(
      this.court.posicaoDeSaque(this.side, _ponto),
      this.court.direcaoParaRede(this.side, _direcao),
    );
    this.sincronizarVisual();
  }

  /** Chamado quando o saque sai e o rally comeca. */
  aoComecarORally(): void {
    this.sacando = false;
  }

  /** Chamado quando o ponto termina: hora de voltar pra base. */
  aoTerminarOPonto(): void {
    this.sacando = false;
    this.hitter.zerarEspera();
    this.voltarParaOSpawn();
  }

  voltarParaOSpawn(): void {
    this.motor.colocarEm(
      this.court.posicaoDeSpawn(this.side, _ponto),
      this.court.direcaoParaRede(this.side, _direcao),
    );
    this.sincronizarVisual();
  }

  /**
   * Leva a posicao do motor pro objeto da cena e toca a animacao.
   *
   * A animacao le' a velocidade REAL do motor, nao a tecla apertada: batendo
   * no limite da area o atleta para, e a perna tem que parar junto — senao ele
   * pedala contra a parede invisivel.
   */
  protected sincronizarVisual(dt = 0): void {
    this.visual.root.position.copy(this.motor.posicao);
    if (dt <= 0) return;

    this.motor.aplicarRotacao(this.visual.root, dt);

    const velocidade = this.motor.velocidadeHorizontal.length();
    this.visual.animar(dt, velocidade, this.motor.noChao, this.bracosLevantados());
  }

  /**
   * Quanto os bracos devem estar levantados, de 0 a 1.
   *
   * Sobe com a bola ao alcance e no ar — as duas situacoes em que um jogador de
   * volei de verdade ja' esta' com os bracos prontos. Nao espera o toque
   * acontecer: um braco que sobe DEPOIS da batida chega atrasado na tela.
   */
  protected bracosLevantados(): number {
    if (this.sacando) return 0.15;
    if (!this.motor.noChao) return 0.85;
    return this.hitter.alcanca(this.ball, this.motor.posicao) ? 0.6 : 0;
  }

  /** Direcao horizontal, em mundo, que aponta deste atleta pra rede. */
  protected direcaoParaRede(out: THREE.Vector3): THREE.Vector3 {
    return this.court.direcaoParaRede(this.side, out);
  }

  /** A bola esta' do meu lado da quadra? */
  protected bolaNoMeuLado(): boolean {
    return this.court.ladoDe(this.ball.posicao) === this.side;
  }

  /** E' o ultimo toque permitido? Entao a bola TEM que cruzar a rede. */
  protected precisaCruzarARede(): boolean {
    return this.rally.toquesDoLado(this.side) >= this.rally.maxToques - 1;
  }

  /**
   * Ponto de armacao no proprio campo, pra manchete e levantamento.
   *
   * O X acompanha a posicao do atleta (limitado a 75% da meia-largura, pra nao
   * armar em cima da linha) e a profundidade e' fixa por acao: a manchete sobe
   * mais atras, o levantamento mais perto da rede.
   */
  protected alvoDeArmacao(profundidade: number, out: THREE.Vector3): THREE.Vector3 {
    this.court.paraLocal(this.motor.posicao, _local);
    const normalizado = Math.max(-0.75, Math.min(0.75, _local.x / Math.max(0.01, this.court.halfWidth)));
    return this.court.pontoDaQuadra(this.side, normalizado, profundidade, out);
  }

  /** Alvo padrao no campo adversario, quando nao ha' mira resolvida. */
  protected alvoPadrao(out: THREE.Vector3): THREE.Vector3 {
    return this.court.pontoDaQuadra(oposto(this.side), 0, PLAYER.defaultAttackDepth, out);
  }

  dispose(): void {
    this.visual.dispose();
  }
}
