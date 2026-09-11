import * as THREE from 'three';
import type { Input } from '../core/Input';

const _frente = new THREE.Vector3();
const _direita = new THREE.Vector3();

/**
 * A direcao que o teclado esta' pedindo, em espaco de MUNDO.
 *
 * Relativa a' CAMERA, nao ao corpo: com a camera mantendo o rumo, "pra frente"
 * e' sempre pra frente na tela, e o controle nao inverte quando o personagem
 * vira pra pegar uma bola lateral.
 *
 * Mora aqui porque quem joga e quem passeia leem o mesmo teclado, e duas copias
 * desta conta e' exatamente uma a mais do que se pode manter certa.
 */
export function direcaoDoTeclado(
  input: Input,
  camera: THREE.PerspectiveCamera | null,
  out: THREE.Vector3,
): THREE.Vector3 {
  const x = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
          - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
  const z = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
          - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);

  if (camera) {
    camera.getWorldDirection(_frente);
    _frente.y = 0;
    _frente.normalize();
    /**
     * `cross(frente, cima)` JA' e' a direita da tela — nao inverta.
     *
     * Com a camera olhando pra -Z (o caso canonico) a conta devolve +X, que e'
     * a direita. Com a nossa camera, que fica atras do jogador Home e olha pra
     * +Z, ela devolve -X — e -X e' mesmo a direita de quem olha naquela
     * direcao. Um negate() aqui troca o A com o D, e como o D passa a andar pra
     * esquerda o erro parece "o controle esta' espelhado" em vez de "a conta
     * esta' errada".
     */
    _direita.crossVectors(_frente, THREE.Object3D.DEFAULT_UP);
  } else {
    _frente.set(0, 0, 1);
    _direita.set(1, 0, 0);
  }

  return out.set(0, 0, 0)
    .addScaledVector(_frente, z)
    .addScaledVector(_direita, x);
}
