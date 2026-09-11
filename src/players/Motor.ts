import * as THREE from 'three';
import { ATHLETE } from '../config';
import { dampFactor } from '../core/math';

const _alvo = new THREE.Vector3();
const _limitado = new THREE.Vector3();
const _olhar = new THREE.Quaternion();
const _matriz = new THREE.Matrix4();
const _frente = new THREE.Vector3();

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

  constructor(private limitarArea: LimitarArea) {}

  /** Direcao desejada em espaco de MUNDO (ja' relativa a' camera). */
  moverPara(direcao: THREE.Vector3): void {
    this.direcaoDesejada.set(direcao.x, 0, direcao.z);
    if (this.direcaoDesejada.lengthSq() > 1) this.direcaoDesejada.normalize();
  }

  /** Pra onde o atleta olha. Zero mantem o que estava. */
  encarar(direcao: THREE.Vector3): void {
    if (direcao.x * direcao.x + direcao.z * direcao.z < 1e-4) return;
    this.direcaoDeFrente.set(direcao.x, 0, direcao.z).normalize();
  }

  pular(): void {
    this.pediuPulo = true;
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
    this.encarar(olharPara);
  }

  update(dt: number): void {
    if (dt <= 0) return;

    if (this.noChao) this.tempoForaDoChao = 0;
    else this.tempoForaDoChao += dt;

    // ---------------------------------------------------------- horizontal
    _alvo.copy(this.direcaoDesejada).multiplyScalar(ATHLETE.moveSpeed);
    const taxa = this.direcaoDesejada.lengthSq() > 1e-4 ? ATHLETE.acceleration : ATHLETE.deceleration;
    moverEmDirecaoA(this.velocidadeHorizontal, _alvo, taxa * dt);

    // ------------------------------------------------------------ vertical
    // Colar no chao: sem esse -2 o atleta "flutua" um quadro a cada degrau de
    // ponto flutuante e o noChao pisca.
    if (this.noChao && this.velocidadeVertical <= 0) this.velocidadeVertical = -2;

    // Coyote time: o pulo pedido logo depois de sair do chao ainda vale. E' o
    // que separa "pulei tarde" de "o jogo comeu meu pulo".
    if (this.pediuPulo && this.tempoForaDoChao <= ATHLETE.coyoteTime) {
      this.velocidadeVertical = Math.sqrt(2 * ATHLETE.gravity * ATHLETE.jumpHeight);
      this.tempoForaDoChao = ATHLETE.coyoteTime + 1;
      this.noChao = false;
    }
    this.pediuPulo = false;

    this.velocidadeVertical -= ATHLETE.gravity * dt;

    this.posicao.addScaledVector(this.velocidadeHorizontal, dt);
    this.posicao.y += this.velocidadeVertical * dt;

    // O chao da quadra e' plano: nao ha' colisao a resolver, so' o piso.
    if (this.posicao.y <= 0) {
      this.posicao.y = 0;
      this.velocidadeVertical = 0;
      this.noChao = true;
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
  }

  /** Rotacao suavizada, pra aplicar no objeto visual. */
  aplicarRotacao(objeto: THREE.Object3D, dt: number): void {
    _frente.copy(this.direcaoDeFrente);
    if (_frente.lengthSq() < 1e-4) return;

    _matriz.lookAt(new THREE.Vector3(), _frente, THREE.Object3D.DEFAULT_UP);
    _olhar.setFromRotationMatrix(_matriz);
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
