import * as THREE from 'three';

/**
 * Utilitarios de matematica. Vem do rpk.fps, podados pro que o volei usa:
 * saiu o raycast de tiro, entrou o que a bola precisa.
 */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Lerp independente de framerate: t = 1 - exp(-rate * dt). */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

/** O fator do damp, pra quem precisa aplicar em Vector3/Quaternion. */
export const dampFactor = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export const randRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

/** Ponto aleatorio dentro do circulo unitario. Erro de mira e de posicao saem daqui. */
export function randomInCircle(radius: number, out: THREE.Vector2): THREE.Vector2 {
  const angulo = Math.random() * Math.PI * 2;
  // sqrt pra distribuir por AREA; sem ele a amostra se concentra no centro.
  const r = Math.sqrt(Math.random()) * radius;
  return out.set(Math.cos(angulo) * r, Math.sin(angulo) * r);
}

/**
 * Caixa alinhada aos eixos, no espaco LOCAL da quadra.
 *
 * A rede, a saia e o chao colidem como AABB — mesma escolha do rpk.fps, pelo
 * mesmo motivo: e' previsivel e cabe em dez linhas. A diferenca e' que aqui a
 * caixa vive no espaco da quadra, nao no do mundo, entao girar a quadra nao
 * exige recalcular colisor nenhum.
 */
export class AABB {
  constructor(
    public min = new THREE.Vector3(),
    public max = new THREE.Vector3(),
  ) {}

  static fromCenterSize(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): AABB {
    return new AABB(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
    );
  }

  /** Ponto da caixa mais proximo de `p`. E' o teste de esfera x caixa inteiro. */
  closestPoint(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      clamp(p.x, this.min.x, this.max.x),
      clamp(p.y, this.min.y, this.max.y),
      clamp(p.z, this.min.z, this.max.z),
    );
  }

  contains(p: THREE.Vector3): boolean {
    return (
      p.x >= this.min.x && p.x <= this.max.x &&
      p.y >= this.min.y && p.y <= this.max.y &&
      p.z >= this.min.z && p.z <= this.max.z
    );
  }
}
