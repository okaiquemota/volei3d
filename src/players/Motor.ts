import * as THREE from 'three';
import { ATHLETE, MERGULHO } from '../config';
import { damp, dampFactor } from '../core/math';

const _alvo = new THREE.Vector3();
const _limitado = new THREE.Vector3();
const _olhar = new THREE.Quaternion();
const _matriz = new THREE.Matrix4();
const _frente = new THREE.Vector3();
/** Fixo, e fora do laco: alocar um Vector3 por quadro por atleta e' lixo de graca. */
const _ORIGEM = new THREE.Vector3();
const _ZERO = new THREE.Vector3();
const _EIXO_X = new THREE.Vector3(1, 0, 0);
const _tombo = new THREE.Quaternion();

/** Limita uma posicao a' area onde o atleta pode correr. */
export type LimitarArea = (posicao: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;

/**
 * Corrida e pulo.
 *
 * O corpo e' CINEMATICO: ele nao participa de colisao nenhuma, e em particular
 * nao empurra a bola. Todo contato com a bola e' intencional e passa pelo
 * Hitter. Sem isso, correr encostado na bola vira caos — foi assim no
 * prototipo e continua sendo a regra.
 *
 * O motor tambem nao conhece a quadra: recebe uma funcao de limite. Hoje ela
 * vem do Court (meia quadra + zona livre); num mundo aberto seria a area de
 * exploracao, e o motor nao mudaria uma linha.
 */
export class Motor {
  readonly posicao = new THREE.Vector3();
  readonly velocidadeHorizontal = new THREE.Vector3();

  velocidadeVertical = 0;
  noChao = true;

  private direcaoDesejada = new THREE.Vector3();
  private direcaoDeFrente = new THREE.Vector3(0, 0, 1);
  private tempoForaDoChao = 0;
  private pediuPulo = false;

  // ------------------------------------------------------------- mergulho
  private pediuMergulho = false;
  private direcaoDoMergulho = new THREE.Vector3();
  private voando = false;
  private tempoDeLevantar = 0;
  /** 0 de pe', 1 deitado. E' so' visual, e por isso e' amaciado. */
  private deitado = 0;

  constructor(private limitarArea: LimitarArea) {}

  /** Direcao desejada em espaco de MUNDO (ja' relativa a' camera). */
  moverPara(direcao: THREE.Vector3): void {
    this.direcaoDesejada.set(direcao.x, 0, direcao.z);
    if (this.direcaoDesejada.lengthSq() > 1) this.direcaoDesejada.normalize();
  }

  /**
   * Pra onde o atleta olha. Zero mantem o que estava.
   *
   * Mergulhando nao muda: o corpo aponta pra onde ele se jogou, e nao pra onde
   * a bola foi parar. Quem chama isto e' o `Human`, que encara a bola a cada
   * quadro — e um corpo deitado girando pra seguir a bola parece um boneco
   * rodando no chao, nao um atleta esticado.
   */
  encarar(direcao: THREE.Vector3): void {
    if (!this.livre) return;
    if (direcao.x * direcao.x + direcao.z * direcao.z < 1e-4) return;
    this.direcaoDeFrente.set(direcao.x, 0, direcao.z).normalize();
  }

  pular(): void {
    this.pediuPulo = true;
  }

  /** O corpo esta' no ar, estendido? E' a janela em que o alcance e maior. */
  get mergulhando(): boolean { return this.voando; }

  /** Caido, esperando pra levantar. Nao corre, nao pula, nao mergulha. */
  get levantando(): boolean { return this.tempoDeLevantar > 0; }

  /** Da' pra correr, pular e mergulhar? */
  get livre(): boolean { return !this.voando && this.tempoDeLevantar <= 0; }

  /** O quanto o corpo esta' deitado, de 0 a 1. Pro visual e pro que mais quiser. */
  get inclinacaoDoCorpo(): number { return this.deitado; }

  /**
   * Pra onde o corpo esta' virado, em mundo. So' leitura.
   *
   * Quem anima precisa disto: o atleta encara a bola enquanto anda relativo a'
   * camera, entao "pra onde ele anda" e "pra onde ele olha" sao coisas
   * diferentes quase o tempo todo, e e' a diferenca entre as duas que decide se
   * o passo e' pra frente ou de lado.
   */
  get frente(): THREE.Vector3 { return this.direcaoDeFrente; }

  /**
   * Joga o corpo na direcao pedida.
   *
   * `direcao` zerada mergulha pra FRENTE: quem aperta sem andar quer o peixinho
   * pra onde esta' olhando, e um mergulho que nao sai do lugar nao salva nada.
   *
   * Sem direcao pra corrigir depois: o `direcaoDeFrente` e' escrito aqui, direto,
   * porque o `encarar` se recusa a mexer nele durante o mergulho — e e' esta
   * chamada que define pra onde o corpo aponta o voo inteiro.
   */
  mergulhar(direcao: THREE.Vector3): void {
    if (!this.livre || !this.noChao) return;

    this.direcaoDoMergulho.set(direcao.x, 0, direcao.z);
    if (this.direcaoDoMergulho.lengthSq() < 1e-4) this.direcaoDoMergulho.copy(this.direcaoDeFrente);
    this.direcaoDoMergulho.normalize();
    this.direcaoDeFrente.copy(this.direcaoDoMergulho);
    this.pediuMergulho = true;
  }

  /** Altura atual acima do chao. Zero quando plantado. */
  get alturaDoSalto(): number {
    return this.posicao.y;
  }

  /** Reposiciona com seguranca, zerando o movimento. */
  colocarEm(posicao: THREE.Vector3, olharPara: THREE.Vector3): void {
    this.posicao.copy(posicao);
    this.velocidadeHorizontal.set(0, 0, 0);
    this.velocidadeVertical = 0;
    this.direcaoDesejada.set(0, 0, 0);
    this.noChao = true;
    this.tempoForaDoChao = 0;
    // O mergulho morre junto: reposicionar acontece no fim do ponto, e herdar
    // um corpo caido do rally anterior travaria o saque seguinte.
    this.pediuMergulho = false;
    this.voando = false;
    this.tempoDeLevantar = 0;
    this.deitado = 0;
    this.encarar(olharPara);
  }

  update(dt: number): void {
    if (dt <= 0) return;

    if (this.noChao) this.tempoForaDoChao = 0;
    else this.tempoForaDoChao += dt;
    if (this.tempoDeLevantar > 0) this.tempoDeLevantar = Math.max(0, this.tempoDeLevantar - dt);

    /**
     * O arranco do mergulho SUBSTITUI a corrida deste quadro.
     *
     * Escrito direto na velocidade, e nao somado: somar faria o mergulho de
     * quem ja' estava correndo a toda ir mais longe que o de quem estava
     * parado, e o alcance do gesto viraria funcao da corrida anterior.
     *
     * O `tempoForaDoChao` vai pro fim da janela de coyote de proposito: sem
     * isso um Espaco apertado junto com o mergulho ainda seria aceito, e o
     * atleta sairia voando pra cima no meio do peixinho.
     */
    if (this.pediuMergulho) {
      this.velocidadeHorizontal.copy(this.direcaoDoMergulho).multiplyScalar(MERGULHO.impulso);
      this.velocidadeVertical = MERGULHO.impulsoVertical;
      this.voando = true;
      this.noChao = false;
      this.tempoForaDoChao = ATHLETE.coyoteTime + 1;
      this.pediuMergulho = false;
      this.pediuPulo = false;
    }

    // ---------------------------------------------------------- horizontal
    /**
     * Mergulhando ou caido, o teclado nao manda.
     *
     * E' o custo do gesto e nao um detalhe: um mergulho corrigivel no meio do
     * voo seria uma corrida mais rapida sem nenhuma desvantagem, e mergulhar
     * viraria o jeito normal de andar.
     */
    const controlando = this.livre;
    _alvo.copy(controlando ? this.direcaoDesejada : _ZERO).multiplyScalar(ATHLETE.moveSpeed);

    const taxa = this.voando ? MERGULHO.arrastoNoAr
      : this.tempoDeLevantar > 0 ? MERGULHO.arrastoNoChao
      : this.direcaoDesejada.lengthSq() > 1e-4 ? ATHLETE.acceleration
      : ATHLETE.deceleration;
    moverEmDirecaoA(this.velocidadeHorizontal, _alvo, taxa * dt);

    // ------------------------------------------------------------ vertical
    // Colar no chao: sem esse -2 o atleta "flutua" um quadro a cada degrau de
    // ponto flutuante e o noChao pisca.
    if (this.noChao && this.velocidadeVertical <= 0) this.velocidadeVertical = -2;

    // Coyote time: o pulo pedido logo depois de sair do chao ainda vale. E' o
    // que separa "pulei tarde" de "o jogo comeu meu pulo".
    if (this.pediuPulo && this.livre && this.tempoForaDoChao <= ATHLETE.coyoteTime) {
      this.velocidadeVertical = Math.sqrt(2 * ATHLETE.gravity * ATHLETE.jumpHeight);
      this.tempoForaDoChao = ATHLETE.coyoteTime + 1;
      this.noChao = false;
    }
    this.pediuPulo = false;

    // O mergulho cai com a sua propria gravidade, bem menor: e' o que deixa o
    // voo durar 0,42 s sem o corpo precisar subir 40 cm pra isso.
    this.velocidadeVertical -= (this.voando ? MERGULHO.gravidade : ATHLETE.gravity) * dt;

    this.posicao.addScaledVector(this.velocidadeHorizontal, dt);
    this.posicao.y += this.velocidadeVertical * dt;

    // O chao da quadra e' plano: nao ha' colisao a resolver, so' o piso.
    if (this.posicao.y <= 0) {
      this.posicao.y = 0;
      this.velocidadeVertical = 0;
      this.noChao = true;
      // Caiu de peixinho: acabou o voo, comeca o preco.
      if (this.voando) {
        this.voando = false;
        this.tempoDeLevantar = MERGULHO.levantar;
      }
    } else {
      this.noChao = false;
    }

    // Limite de area. Bater no limite tambem mata a velocidade naquele eixo,
    // senao o atleta fica "empurrando" a parede invisivel e demora pra sair.
    this.limitarArea(this.posicao, _limitado);
    if (_limitado.x !== this.posicao.x) this.velocidadeHorizontal.x = 0;
    if (_limitado.z !== this.posicao.z) this.velocidadeHorizontal.z = 0;
    this.posicao.x = _limitado.x;
    this.posicao.z = _limitado.z;

    // O corpo deita e levanta amaciado. Sem isto o atleta pisca entre de pe' e
    // deitado no quadro do arranco e no quadro em que o tempo de levantar zera.
    this.deitado = damp(this.deitado, this.livre ? 0 : 1, MERGULHO.velocidadeDaInclinacao, dt);
  }

  /**
   * Rotacao suavizada, pra aplicar no objeto visual.
   *
   * A ordem dos argumentos do `lookAt` nao e' detalhe. `Matrix4.lookAt(olho,
   * alvo, cima)` usa a convencao de CAMERA: o +Z da matriz aponta do alvo pro
   * olho, ou seja, pra TRAS do que se olha. Chamado como `lookAt(origem,
   * frente, ...)`, o corpo ficava com o +Z apontando pro lado oposto ao que o
   * atleta encara — e tudo que mora no +Z do corpo ia junto.
   *
   * Duas coisas moram la': o marcador branco de frente, cujo unico trabalho e'
   * dizer pra onde o atleta esta' virado, e a ANCORA DO SAQUE, que segura a
   * bola. O marcador virou marcador de costas, e o sacador segurava a bola
   * atras do proprio corpo — meio metro atras da linha de fundo em vez de meio
   * metro a' frente dela, que e' de onde o solver do saque partia.
   *
   * Invertendo os dois argumentos, o +Z passa a ser a frente de verdade.
   */
  aplicarRotacao(objeto: THREE.Object3D, dt: number): void {
    _frente.copy(this.direcaoDeFrente);
    if (_frente.lengthSq() < 1e-4) return;

    _matriz.lookAt(_frente, _ORIGEM, THREE.Object3D.DEFAULT_UP);
    _olhar.setFromRotationMatrix(_matriz);

    /**
     * Deitar e' um giro em torno do X do PROPRIO corpo, e por isso vem DEPOIS
     * do olhar (multiplicacao a' direita): assim o peixinho tomba pra frente
     * seja qual for o rumo, em vez de tombar sempre pro mesmo lado do mundo.
     *
     * O pivo do corpo esta' nos pes, entao o tombo varre a cabeca pra frente e
     * pra baixo — a 1,35 rad o corpo fica deitado rente ao chao, que e'
     * exatamente a pose que se queria e nao custou osso nenhum.
     */
    if (this.deitado > 1e-3) {
      _tombo.setFromAxisAngle(_EIXO_X, MERGULHO.inclinacao * this.deitado);
      _olhar.multiply(_tombo);
    }

    objeto.quaternion.slerp(_olhar, dampFactor(ATHLETE.turnSpeed, dt));
  }
}

/** Vector3.moveTowards, que o three nao tem. */
function moverEmDirecaoA(atual: THREE.Vector3, alvo: THREE.Vector3, passoMaximo: number): void {
  const dx = alvo.x - atual.x;
  const dy = alvo.y - atual.y;
  const dz = alvo.z - atual.z;
  const distancia = Math.hypot(dx, dy, dz);

  if (distancia <= passoMaximo || distancia < 1e-6) {
    atual.copy(alvo);
    return;
  }

  const k = passoMaximo / distancia;
  atual.set(atual.x + dx * k, atual.y + dy * k, atual.z + dz * k);
}
