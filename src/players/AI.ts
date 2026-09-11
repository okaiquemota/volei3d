import * as THREE from 'three';
import { AI, AI_SKILL, BALL, type AiSkill } from '../config';
import { randomInCircle } from '../core/math';
import { oposto } from '../world/Court';
import { Athlete } from './Athlete';

const _pouso = new THREE.Vector3();
const _desejado = new THREE.Vector3();
const _paraOAlvo = new THREE.Vector3();
const _paraABola = new THREE.Vector3();
const _alvo = new THREE.Vector3();
const _erro = new THREE.Vector2();
const _direcao = new THREE.Vector3();

/**
 * O oponente.
 *
 * Escopo deliberado: REAGIR e DEVOLVER. Nao ha' jogada combinada, nao ha'
 * leitura do que o humano vai fazer. Ele preve onde a bola cai, corre pra la'
 * com um erro, e devolve por cima da rede mirando um ponto aleatorio.
 *
 * A dificuldade e' so' um punhado de numeros — tempo de reacao, erro de
 * posicao, erro de mira, chance de cortada. Nenhum deles e' trapaca: a IA usa
 * exatamente a mesma fisica de toque do humano, e erra por ter erro, nao por
 * ter regra propria.
 */
export class AIPlayer extends Athlete {
  private habilidade: AiSkill = AI_SKILL.normal;
  private alvoDeCorrida = new THREE.Vector3();
  private esperaDoSaque = 0;
  private esperaDeDecisao = 0;
  private querCortar = false;

  definirHabilidade(habilidade: AiSkill): void {
    this.habilidade = habilidade;
    this.hitter.ruidoDeMira = habilidade.aimError;
  }

  override prepararSaque(): void {
    super.prepararSaque();
    this.esperaDoSaque = this.habilidade.serveDelay;
    this.alvoDeCorrida.copy(this.motor.posicao);
  }

  override aoTerminarOPonto(): void {
    super.aoTerminarOPonto();
    this.querCortar = false;
    this.alvoDeCorrida.copy(this.motor.posicao);
  }

  override update(dt: number): void {
    this.hitter.update(dt);

    if (this.sacando) this.atualizarSaque(dt);
    else {
      this.atualizarAlvoDeCorrida(dt);
      this.atualizarMovimento();
      this.atualizarToque();
    }

    this.motor.update(dt);
    this.sincronizarVisual(dt);
  }

  private atualizarSaque(dt: number): void {
    this.motor.moverPara(_direcao.set(0, 0, 0));
    this.motor.encarar(this.direcaoParaRede(_direcao));

    this.esperaDoSaque -= dt;
    if (this.esperaDoSaque > 0) return;

    this.escolherAlvoDeAtaque(_alvo);
    if (this.hitter.sacar(this.ball, this.court, this, _alvo)) {
      this.esperaDoSaque = this.habilidade.serveDelay;
    }
  }

  /**
   * Pra onde correr.
   *
   * Se a bola vem pro meu campo, vou pra onde ela vai cair; senao, volto pra
   * posicao base. O erro de posicao entra aqui, uma vez por decisao — e nao a
   * cada quadro, senao ele vira tremor em vez de imprecisao.
   */
  private atualizarAlvoDeCorrida(dt: number): void {
    if (this.esperaDeDecisao > 0) {
      this.esperaDeDecisao -= dt;
      return;
    }

    /**
     * Tempo de reacao: logo depois do adversario bater, a IA ainda "nao viu".
     *
     * E' o que a torna bativel. Sem isso ela ja' esta' embaixo da bola no
     * instante do toque, e nao existe cortada que passe.
     */
    const meu = this.ball.ultimoTocador?.side === this.side;
    if (!meu && this.ball.tempoDesdeOToque < this.habilidade.reactionDelay) return;

    // Mesmo alvo do marcador: o centro da bola no contato, nao o chao.
    this.ball.preverPouso(this.court.floorY + BALL.radius, _pouso);

    const vemPraMim = this.court.ladoDe(_pouso) === this.side || this.bolaNoMeuLado();
    if (!vemPraMim) {
      this.court.posicaoDeSpawn(this.side, this.alvoDeCorrida);
      this.querCortar = false;
      return;
    }

    randomInCircle(this.habilidade.positionError, _erro);
    _desejado.set(_pouso.x + _erro.x, 0, _pouso.z + _erro.y);
    this.court.limitarArea(_desejado, this.side, this.alvoDeCorrida);

    // Bola alta e perto da rede: vale tentar uma cortada.
    const pertoDaRede = Math.abs(this.court.distanciaAteRede(this.alvoDeCorrida)) < this.court.halfLength * 0.45;
    const bolaAlta = this.ball.posicao.y > this.court.netTopY + 0.4;
    this.querCortar = pertoDaRede && bolaAlta && Math.random() < this.habilidade.spikeChance;

    this.esperaDeDecisao = AI.decisionCooldown;
  }

  private atualizarMovimento(): void {
    _paraOAlvo.subVectors(this.alvoDeCorrida, this.motor.posicao);
    _paraOAlvo.y = 0;

    if (_paraOAlvo.length() <= AI.arriveThreshold) this.motor.moverPara(_direcao.set(0, 0, 0));
    else this.motor.moverPara(_paraOAlvo.normalize());

    if (this.bolaNoMeuLado()) {
      _paraABola.subVectors(this.ball.posicao, this.motor.posicao);
      this.motor.encarar(_paraABola);
    } else {
      this.motor.encarar(this.direcaoParaRede(_paraABola));
    }
  }

  private atualizarToque(): void {
    if (!this.rally.rallyVivo) return;
    if (!this.bolaNoMeuLado()) return;
    if (!this.hitter.pronto) return;

    if (this.querCortar && this.motor.noChao && this.devePularAgora()) {
      this.motor.pular();
    }

    if (!this.hitter.alcanca(this.ball, this.motor.posicao)) return;

    const acao = this.hitter.escolherAcao(this.ball, this.motor.posicao, this.motor.noChao);
    this.escolherAlvoDeAtaque(_alvo);

    if (this.hitter.bater(this.ball, this.court, this, acao, _alvo)) {
      this.querCortar = false;
    }
  }

  /** Pula quando a bola ja' esta' em cima dele e alta o bastante pra virar ataque. */
  private devePularAgora(): boolean {
    const dx = this.ball.posicao.x - this.motor.posicao.x;
    const dz = this.ball.posicao.z - this.motor.posicao.z;
    if (Math.hypot(dx, dz) > 1.3 * 1.4) return false;

    const dy = this.ball.posicao.y - this.motor.posicao.y;
    return dy > 1.75 * 0.9 && dy < 2.7 + 0.9;
  }

  /** Um ponto aleatorio do campo adversario, longe das linhas. */
  private escolherAlvoDeAtaque(out: THREE.Vector3): THREE.Vector3 {
    const x = -0.72 + Math.random() * 1.44;
    const profundidade = AI.attackDepthMin + Math.random() * (AI.attackDepthMax - AI.attackDepthMin);

    this.court.pontoDaQuadra(oposto(this.side), x, profundidade, out);
    return this.court.limitarMira(out, oposto(this.side), 0.5, out);
  }
}
