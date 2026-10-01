import * as THREE from 'three';
import { AI, BALL, COURT, PLAYER } from '../config';
import type { Ball, Tocador } from '../ball/Ball';
import { Court, oposto, type Side } from '../world/Court';
import { BOLA_NA_MAO, construirAtleta, type AtletaVisual } from './buildAthlete';
import { Corpos } from './montarCorpo';
import { VISUAL_PADRAO, chaveDoVisual, type Visual } from './corpos';
import { Animador, estadoDoMotor } from './Animador';
import type { EstadoDoCorpo } from './animacoes';
import { Hitter, type Acao } from './Hitter';
import { duracaoDoToque } from './poses';
import { Motor } from './Motor';
import { Olhar } from './olhar';

const _direcao = new THREE.Vector3();
const _ponto = new THREE.Vector3();
const _local = new THREE.Vector3();
const _palma = new THREE.Vector3();
const _dedos = new THREE.Vector3();
/** Do osso da palma ate' a pele, com a mao virada pra cima. */
const MEIA_MAO = 0.02;
const _estado: EstadoDoCorpo = {
  noChao: true, mergulhando: false, levantando: false, pousando: false, segurandoBola: false,
  velocidade: 0, anguloDoAndar: 0, gesto: null, marcaDoGesto: 0,
};

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

  /** O corpo de modelo, quando ha' um. Null enquanto o atleta e' capsula. */
  private corpo: THREE.Object3D | null = null;
  /** As pecas do pack, quando chegam. */
  private corpos: Corpos | null = null;
  /** De que combinacao e' o corpo montado agora: vestir de novo o mesmo nao remonta. */
  private montado = '';
  /**
   * As pecas ainda estao chegando. Enquanto isso o atleta NAO aparece: a
   * capsula e' o corpo de quem ficou sem modelo (o arquivo falhou), e mostrar
   * ela no carregamento parecia o boneco antigo voltando.
   */
  private esperandoCorpo = true;

  /**
   * Quem este atleta parece, ou null pro corpo de sempre dele (`visualPadrao`).
   *
   * Guardado, e nao so' aplicado: as pecas chegam DEPOIS (carregam em segundo
   * plano), e um personagem vestido enquanto ainda era capsula tem que
   * continuar vestido quando o boneco aparecer.
   */
  private aparencia: Visual | null = null;
  /** O corpo de quem nao e' personagem. A CPU sorteia o dela. */
  protected visualPadrao: Visual = VISUAL_PADRAO;
  private animador: Animador | null = null;
  private olhar: Olhar | null = null;
  /** Os dois ossos que marcam a palma esquerda: a bola do saque vai em cima. */
  private palma: readonly [THREE.Object3D, THREE.Object3D] | null = null;

  /**
   * O gesto de toque tocando agora, e quanto falta dele.
   *
   * Existe porque o `Hitter` resolve o toque num quadro so' e some: a bola sai
   * e nada no estado do atleta lembra que houve uma batida. Sem este relogio o
   * gesto apareceria por 1/60 de segundo e nunca seria visto.
   */
  private gesto: Acao | null = null;
  private tempoDoGesto = 0;
  private toquesVistos = 0;

  constructor(
    /**
     * Mutavel por um motivo so': o CIRCUITO da' nome ao adversario. Os avisos
     * de saque e de ponto ja' leem o nome daqui, entao renomear o bot faz
     * "PONTO DE NANDO SAQUE" sair em todo lugar sem tocar no HUD.
     */
    public nome: string,
    readonly side: Side,
    private readonly cor: number,
    protected court: Court,
    protected ball: Ball,
    protected rally: EstadoDoRally,
  ) {
    this.visual = construirAtleta(cor, COURT.serveBallHeight);
    this.visual.capsulas.visible = false;
    /**
     * A area de corrida muda durante o saque.
     *
     * Sacando, o limite e' a faixa atras da linha de fundo; em jogo, a meia
     * quadra inteira. O Motor nao sabe disso — ele recebe uma funcao de limite
     * e pergunta a cada quadro, que e' exatamente pra isso que a abstracao
     * existe.
     */
    // O CORPO usa `limitarCorpo`, que deixa entrar na rede; alvo de corrida e
    // mira continuam em `limitarArea`, que para antes dela.
    this.motor = new Motor((posicao, out) => (this.sacando
      ? this.court.limitarAreaDeSaque(posicao, this.side, out)
      : this.court.limitarCorpo(posicao, this.side, out)));
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
   * Troca a capsula por um corpo de modelo. `null` volta pra capsula.
   *
   * A raiz do visual NAO muda: ela e' o que o `Motor` posiciona e gira, e a
   * pele entra dentro dela. Por isso o tombo do mergulho, o giro do corpo e o
   * limite de area continuam funcionando sem saber que o desenho mudou.
   */
  usarModelo(corpos: Corpos | null): void {
    this.corpos = corpos;
    this.esperandoCorpo = false;
    this.montado = '';
    this.remontar();
  }

  /** Veste um corpo. `null` volta pro corpo de sempre deste atleta. */
  vestir(visual: Visual | null): void {
    this.aparencia = visual;
    const v = visual ?? this.visualPadrao;
    this.visual.pintar(v.camisa ?? this.cor);
    this.remontar();
  }

  /** O corpo que este atleta esta' usando agora. */
  get visualAtual(): Visual {
    return this.aparencia ?? this.visualPadrao;
  }

  private remontar(): void {
    const v = this.visualAtual;
    const chave = this.corpos ? chaveDoVisual(v) : '';
    if (chave === this.montado && (this.corpo !== null) === (this.corpos !== null)) return;
    this.montado = chave;

    if (this.corpo) {
      this.visual.root.remove(this.corpo);
      Corpos.descartar(this.corpo);
      this.corpo = null;
    }
    this.animador?.dispose();
    this.animador = null;
    this.olhar = null;
    this.palma = null;
    this.visual.ancoraDeSaque.position.set(BOLA_NA_MAO.lado, COURT.serveBallHeight, BOLA_NA_MAO.frente);

    if (this.corpos) {
      this.corpo = this.corpos.montar(v);
      this.visual.root.add(this.corpo);
      this.animador = new Animador(this.corpo, this.corpos.animacoes(v.familia));
      // Depois de pendurar na raiz: o olhar mede a frente da cabeca contra ela.
      this.olhar = new Olhar(this.visual.root, this.corpo);
      const base = this.corpo.getObjectByName('Middle1L');
      const ponta = this.corpo.getObjectByName('Middle2L');
      this.palma = base && ponta ? [base, ponta] : null;
    }

    this.visual.capsulas.visible = this.corpos === null && !this.esperandoCorpo;
  }

  /** Leva a posicao do motor pro objeto da cena. Chamar no fim do update. */
  protected sincronizarVisual(dt = 0): void {
    this.visual.root.position.copy(this.motor.posicao);
    if (dt > 0) {
      this.motor.aplicarRotacao(this.visual.root, dt);
      this.animar(dt);
    }
  }

  private animar(dt: number): void {
    if (!this.animador) return;

    if (this.hitter.toques !== this.toquesVistos) {
      this.toquesVistos = this.hitter.toques;
      this.gesto = this.hitter.ultimaAcao;
      this.tempoDoGesto = this.gesto ? duracaoDoToque(this.gesto) : 0;
    } else if (this.tempoDoGesto > 0) {
      this.tempoDoGesto -= dt;
      if (this.tempoDoGesto <= 0) this.gesto = null;
    }

    const estado = estadoDoMotor(this.motor, _estado);
    estado.gesto = this.gesto;
    estado.marcaDoGesto = this.toquesVistos;
    estado.segurandoBola = this.sacando;

    this.olhar?.antesDoClipe();
    this.animador.update(estado, dt);
    // Quem vai sacar olha pra frente, e nao pra bola na propria mao.
    this.olhar?.depoisDoClipe(this.sacando ? null : this.ball.posicao, dt);
    if (this.sacando) this.levarBolaNaMao();
  }

  /**
   * A bola do saque vai EM CIMA DA PALMA, e nao num ponto fixo do corpo.
   *
   * O ponto fixo (`BOLA_NA_MAO`) e' a palma com o corpo em repouso. Mas o
   * `Idle` curva o tronco e desce a mao 5 cm, e andando ela ainda sobe e desce
   * outros 5: a bola boiava acima da mao. Seguindo o osso ela fica apoiada
   * seja qual for o clipe de baixo — e sobe junto com a mao quando o sacador
   * ergue a bola. O saque sai de onde a bola estiver (`Hitter.sacar` le' a
   * posicao dela), entao nada na mira muda. Sem modelo, fica o ponto fixo.
   */
  private levarBolaNaMao(): void {
    if (!this.palma) return;
    const [base, ponta] = this.palma;
    ponta.updateWorldMatrix(true, false);
    _palma.setFromMatrixPosition(base.matrixWorld)
      .add(_dedos.setFromMatrixPosition(ponta.matrixWorld)).multiplyScalar(0.5);
    // Sacando o corpo esta' de pe': o "cima" da raiz e' o do mundo.
    this.visual.root.worldToLocal(_palma);
    this.visual.ancoraDeSaque.position.set(_palma.x, _palma.y + BALL.radius + MEIA_MAO, _palma.z);
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
    this.animador?.dispose();
    if (this.corpo) Corpos.descartar(this.corpo);
    this.visual.dispose();
  }
}
