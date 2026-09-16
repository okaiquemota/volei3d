import * as THREE from 'three';
import { AI, COURT, PLAYER } from '../config';
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
    /**
     * A area de corrida muda durante o saque.
     *
     * Sacando, o limite e' a faixa atras da linha de fundo; em jogo, a meia
     * quadra inteira. O Motor nao sabe disso — ele recebe uma funcao de limite
     * e pergunta a cada quadro, que e' exatamente pra isso que a abstracao
     * existe.
     */
    this.motor = new Motor((posicao, out) => (this.sacando
      ? this.court.limitarAreaDeSaque(posicao, this.side, out)
      : this.court.limitarArea(posicao, this.side, out)));
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

  /** Leva a posicao do motor pro objeto da cena. Chamar no fim do update. */
  protected sincronizarVisual(dt = 0): void {
    this.visual.root.position.copy(this.motor.posicao);
    if (dt > 0) this.motor.aplicarRotacao(this.visual.root, dt);
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
   * Bate agora, ou deixa a bola chegar mais perto?
   *
   * `hitter.alcanca` responde "da' pra tocar", e o PRIMEIRO quadro em que ela
   * responde sim e' justamente o pior: a bola acabou de entrar no cilindro de
   * alcance, a 1,3 m do corpo, na ponta do braco.
   *
   * Vale igual pros dois lados, por motivos diferentes que dao no mesmo. A IA
   * batia no primeiro quadro e queimava metade dos toques. O humano tem o
   * buffer de toque, que existe pra nao perder um clique adiantado — e um
   * buffer que dispara no pior quadro da janela nao esta' perdoando nada, esta'
   * escolhendo o pior momento por ele.
   *
   * No ar nao se espera: quem pulou pra cortar bate no alto e na frente do
   * corpo, e esperar significa ver a bola passar.
   */
  protected esperarPelaBola(): boolean {
    if (!this.motor.noChao) return false;
    if (this.hitter.qualidadeDoContato(this.ball, this.motor.posicao) >= AI.qualidadeParaBater) return false;

    // Ultima chance: a bola esta' saindo da faixa alcancavel pra baixo.
    const altura = this.ball.posicao.y - this.motor.posicao.y;
    return !(altura <= AI.alturaDaUltimaChance && this.ball.velocidade.y < 0);
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
