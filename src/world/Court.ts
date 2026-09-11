import * as THREE from 'three';
import { COURT } from '../config';
import { clamp } from '../core/math';

/** Lado da quadra. Home e' o jogador (Z negativo), Away e' a CPU (Z positivo). */
export type Side = 'home' | 'away';

export const oposto = (lado: Side): Side => (lado === 'home' ? 'away' : 'home');

/** Sinal do eixo Z local associado ao lado: home = -1, away = +1. */
export const sinalDe = (lado: Side): number => (lado === 'home' ? -1 : 1);

const _local = new THREE.Vector3();
const _local2 = new THREE.Vector3();

/**
 * A quadra. E' a UNICA fonte de verdade sobre geometria de jogo: limites,
 * lados, rede, pontos de saque e spawn.
 *
 * Tudo e' calculado em espaco LOCAL e convertido pra mundo por uma matriz. Isso
 * nao e' preciosismo: e' o que permite mover e girar a quadra sem tocar em
 * nenhuma linha de bola, jogador ou IA — e, mais pra frente, ter varias quadras
 * espalhadas por um mundo aberto, cada uma com medidas proprias.
 *
 * A classe nao importa nada de render. A geometria visual e' construida em
 * buildCourt.ts, a partir DESTES mesmos numeros: e' impossivel o que se ve'
 * divergir do que colide.
 */
export class Court {
  /** Transformacao da quadra no mundo. Hoje identidade; amanha, uma entre varias. */
  readonly matrix = new THREE.Matrix4();
  private readonly matrixInv = new THREE.Matrix4();

  /**
   * A rotacao da quadra, separada da matriz.
   *
   * Velocidade se converte por ROTACAO, nunca por transformDirection: aquele
   * normaliza o resultado, e uma bola a 20 m/s viraria uma bola a 1 m/s sem
   * erro de tipo nenhum pra avisar.
   */
  readonly quaternion = new THREE.Quaternion();
  readonly quaternionInv = new THREE.Quaternion();

  readonly halfLength = COURT.length / 2;
  readonly halfWidth = COURT.width / 2;

  /** Meia quadra + zona livre: o limite de corrida dos atletas. */
  readonly halfLengthFree = COURT.length / 2 + COURT.freeZone;
  readonly halfWidthFree = COURT.width / 2 + COURT.freeZone;

  /** Vao entre o atleta e a rede. Sem ele da' pra encostar o corpo na malha. */
  static readonly NET_GAP = 0.35;

  constructor(posicao = new THREE.Vector3(), rotacaoY = 0) {
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotacaoY);
    this.quaternionInv.copy(this.quaternion).invert();
    this.matrix.compose(posicao, this.quaternion, new THREE.Vector3(1, 1, 1));
    this.matrixInv.copy(this.matrix).invert();
  }

  paraMundo(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(local).applyMatrix4(this.matrix);
  }

  paraLocal(mundo: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(mundo).applyMatrix4(this.matrixInv);
  }

  /** Y do chao da quadra, em mundo. */
  get floorY(): number {
    return this.matrix.elements[13]!;
  }

  /** Altura do topo da rede, em mundo. */
  get netTopY(): number {
    return this.floorY + COURT.netHeight;
  }

  /** Em que lado da quadra esta' este ponto do mundo? */
  ladoDe(mundo: THREE.Vector3): Side {
    return this.paraLocal(mundo, _local).z < 0 ? 'home' : 'away';
  }

  /** Distancia com sinal ate' o plano da rede, em espaco local. */
  distanciaAteRede(mundo: THREE.Vector3): number {
    return this.paraLocal(mundo, _local).z;
  }

  /** Esta' dentro das linhas? A linha conta como dentro. */
  dentroDaQuadra(mundo: THREE.Vector3, tolerancia = 0): boolean {
    this.paraLocal(mundo, _local);
    return (
      Math.abs(_local.x) <= this.halfWidth + tolerancia &&
      Math.abs(_local.z) <= this.halfLength + tolerancia
    );
  }

  /**
   * Ponto no chao de um dos lados.
   * `normalizedX`: -1 (lateral esquerda) a 1 (direita).
   * `depth01`: 0 = colado na rede, 1 = linha de fundo.
   */
  pontoDaQuadra(lado: Side, normalizedX: number, depth01: number, out = new THREE.Vector3()): THREE.Vector3 {
    const x = clamp(normalizedX, -1, 1) * this.halfWidth;
    const z = sinalDe(lado) * clamp(depth01, 0, 1) * this.halfLength;
    return this.paraMundo(_local2.set(x, 0, z), out);
  }

  /** Posicao base do atleta no seu lado. */
  posicaoDeSpawn(lado: Side, out = new THREE.Vector3()): THREE.Vector3 {
    return this.pontoDaQuadra(lado, 0, COURT.spawnDepthRatio, out);
  }

  /** Onde o sacador se posiciona: atras da linha de fundo. */
  posicaoDeSaque(lado: Side, out = new THREE.Vector3()): THREE.Vector3 {
    const z = sinalDe(lado) * (this.halfLength + COURT.serveBackOffset);
    return this.paraMundo(_local2.set(0, 0, z), out);
  }

  /** Pra onde o atleta olha quando encara a rede. */
  direcaoParaRede(lado: Side, out = new THREE.Vector3()): THREE.Vector3 {
    // -sinal porque home (Z negativo) precisa olhar pra Z positivo.
    return out.set(0, 0, -sinalDe(lado)).transformDirection(this.matrix);
  }

  /**
   * Traz um alvo de mira pra dentro das linhas do lado indicado.
   *
   * O recuo evita mirar em cima da linha, onde meio metro de erro vira bola
   * fora. E o minimo de 0.8 em Z evita mirar colado na rede, que na pratica e'
   * jogar a bola na propria fita.
   */
  limitarMira(mundo: THREE.Vector3, lado: Side, recuo = 0.4, out = new THREE.Vector3()): THREE.Vector3 {
    this.paraLocal(mundo, _local);

    const maxX = Math.max(0.2, this.halfWidth - recuo);
    const maxZ = Math.max(0.4, this.halfLength - recuo);
    _local.x = clamp(_local.x, -maxX, maxX);
    _local.z = sinalDe(lado) > 0
      ? clamp(_local.z, 0.8, maxZ)
      : clamp(_local.z, -maxZ, -0.8);
    _local.y = 0;

    return this.paraMundo(_local, out);
  }

  /**
   * Limita uma posicao a' area de corrida de um lado: meia quadra + zona livre,
   * parando antes da rede.
   *
   * Isto substitui a IMovementArea do Unity. A abstracao existia pra que o
   * motor do atleta nao conhecesse a quadra — e continua valendo: o Motor
   * recebe uma funcao de clamp, nao a quadra.
   */
  limitarArea(mundo: THREE.Vector3, lado: Side, out = new THREE.Vector3()): THREE.Vector3 {
    this.paraLocal(mundo, _local);

    _local.x = clamp(_local.x, -this.halfWidthFree, this.halfWidthFree);
    _local.z = lado === 'home'
      ? clamp(_local.z, -this.halfLengthFree, -Court.NET_GAP)
      : clamp(_local.z, Court.NET_GAP, this.halfLengthFree);

    return this.paraMundo(_local, out);
  }
}
