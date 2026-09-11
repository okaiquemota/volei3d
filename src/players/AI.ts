import * as THREE from 'three';
import { AI, AI_SKILL, BALL, PLAYER, type AiSkill } from '../config';
import { randomInCircle } from '../core/math';
import { oposto } from '../world/Court';
import { Athlete } from './Athlete';
import type { Acao } from './Hitter';

const _pouso = new THREE.Vector3();
const _desejado = new THREE.Vector3();
const _paraOAlvo = new THREE.Vector3();
const _paraABola = new THREE.Vector3();
const _alvo = new THREE.Vector3();
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

  /**
   * Este toque fica em casa (armacao) ou cruza a rede (acabamento)?
   *
   * Antes disto existir a IA devolvia TUDO de primeira, sempre num balao alto
   * mirado no fundo do campo adversario. Contra um humano passava — ele ataca,
   * e o ataque termina o ponto. Entre dois bots nao passava: o balao sempre
   * chega, sempre e' alcancado e sempre volta. Medido, dava rally eterno, 0 a
   * 0 depois de dois minutos, e uma praia inteira de quadras congeladas.
   */
  private armando = false;
  /** Com quantos toques do meu lado a decisao acima foi tomada. */
  private decididoCom = -1;

  /**
   * O erro de leitura desta bola, em metros. Um por bola, nao um por quadro.
   *
   * O alvo de corrida e' recalculado 12 vezes por segundo, e sortear o erro
   * junto o transformava em RUIDO: doze desvios aleatorios em torno do ponto
   * certo se cancelam, e a IA chegava exatamente onde a bola ia cair por mais
   * alto que fosse o `positionError`. Era por isso que dois bots dificeis
   * rebatiam pra sempre — nao por serem rapidos, mas por nao errarem nunca.
   *
   * Sorteado uma vez por bola lida, o erro vira o que deveria ser desde o
   * comeco: uma leitura errada, que se paga.
   */
  private readonly erroDeLeitura = new THREE.Vector2();

  definirHabilidade(habilidade: AiSkill): void {
    this.habilidade = habilidade;
    this.hitter.ruidoDeMira = habilidade.aimError;
  }

  override prepararSaque(): void {
    super.prepararSaque();
    this.esperaDoSaque = this.habilidade.serveDelay;
    this.alvoDeCorrida.copy(this.motor.posicao);
    this.esquecerAJogada();
  }

  override aoTerminarOPonto(): void {
    super.aoTerminarOPonto();
    this.alvoDeCorrida.copy(this.motor.posicao);
    this.esquecerAJogada();
  }

  private esquecerAJogada(): void {
    this.querCortar = false;
    this.armando = false;
    this.decididoCom = -1;
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
    // A IA nao carrega: saca sempre com a forca da dificuldade.
    if (this.hitter.sacar(this.ball, this.court, this, _alvo, this.habilidade.attackForce)) {
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

    this.decidirAJogada();

    // Mesmo alvo do marcador: o centro da bola no contato, nao o chao.
    this.ball.preverPouso(this.court.floorY + BALL.radius, _pouso);

    const vemPraMim = this.court.ladoDe(_pouso) === this.side || this.bolaNoMeuLado();
    if (!vemPraMim) {
      this.court.posicaoDeSpawn(this.side, this.alvoDeCorrida);
      this.querCortar = false;
      return;
    }

    _desejado.set(_pouso.x + this.erroDeLeitura.x, 0, _pouso.z + this.erroDeLeitura.y);
    this.court.limitarArea(_desejado, this.side, this.alvoDeCorrida);

    // Bola alta e perto da rede: vale tentar uma cortada. Armando, nao: quem
    // arma toca pra cima e fica no chao.
    const pertoDaRede = Math.abs(this.court.distanciaAteRede(this.alvoDeCorrida)) < this.court.halfLength * 0.45;
    const bolaAlta = this.ball.posicao.y > this.court.netTopY + 0.4;

    // Se a bola que vem e' o MEU proprio levantamento, a cortada nao e' um
    // sorteio: foi pra isso que ela subiu.
    const eOMeuLevantamento = this.rally.toquesDoLado(this.side) > 0;
    this.querCortar = !this.armando && pertoDaRede && bolaAlta
      && (eOMeuLevantamento || Math.random() < this.habilidade.spikeChance);

    this.esperaDeDecisao = AI.decisionCooldown;
  }

  /**
   * Armar ou acabar — decidido UMA vez por posse, nao a cada decisao.
   *
   * O alvo de corrida e' recalculado a cada 0,08 s; sortear aqui dentro faria
   * a intencao piscar entre um quadro e outro, e o toque sairia com a moeda
   * que caiu no ultimo instante. A contagem de toques do lado zera quando a
   * bola cruza a rede, entao ela serve de relogio da posse: uma decisao por
   * valor novo.
   */
  private decidirAJogada(): void {
    const toques = this.rally.toquesDoLado(this.side);
    if (toques === this.decididoCom) return;

    this.decididoCom = toques;
    randomInCircle(this.habilidade.positionError, this.erroDeLeitura);
    this.armando = toques === 0
      && this.rally.rallyVivo
      && !this.precisaCruzarARede()
      && Math.random() < this.habilidade.chanceDeArmar;
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

    const acao = this.escolherToque();
    if (this.armando) this.alvoDeArmacao(PLAYER.setSetupDepth, _alvo);
    else this.escolherAlvoDeAtaque(_alvo);

    // A IA nao carrega: bate sempre com a forca da dificuldade. Mesma fisica
    // do humano, mesma funcao — o que muda e' o numero.
    if (this.hitter.bater(this.ball, this.court, this, acao, _alvo, this.habilidade.attackForce)) {
      this.querCortar = false;
      this.armando = false;
      this.decididoCom = -1;
    }
  }

  /**
   * O toque, dado o que se quer fazer com a bola.
   *
   * O contexto (altura da bola, pes no chao ou nao) decide quase tudo — e' a
   * mesma funcao do humano. So' ha' UM desvio: acabando, de pe', com a bola na
   * altura das maos, o contexto diria `levantamento`, e levantamento mirado no
   * fundo do campo adversario e' o balao lento que nunca termina ponto. Ali
   * cabe `ataque`: a mesma batida de pe' que o jogador da' segurando o botao.
   */
  private escolherToque(): Acao {
    const acao = this.hitter.escolherAcao(this.ball, this.motor.posicao, this.motor.noChao);
    if (this.armando || acao !== 'levantamento') return acao;
    return 'ataque';
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
