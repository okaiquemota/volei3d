import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { limitarOlhar, Olhar } from '../src/players/olhar';

/**
 * O que estes testes protegem:
 *
 * A cabeca gira DEPOIS do mixer, e o mixer nao escreve osso que nenhum clipe
 * ativo anima. Os dois defeitos que isso da' sao silenciosos: a cabeca
 * somando o giro de um quadro no outro ate' rodar, e a cabeca virando pra
 * tras quando a bola passa das costas.
 */

/** Raiz (o corpo que o Motor gira) > modelo > Neck > Head, rosto em +Z. */
function montar(): { raiz: THREE.Object3D; cabeca: THREE.Bone; olhar: Olhar } {
  const raiz = new THREE.Object3D();
  const modelo = new THREE.Object3D();
  const pescoco = new THREE.Bone();
  pescoco.name = 'Neck';
  pescoco.position.set(0, 1.5, 0);
  const cabeca = new THREE.Bone();
  cabeca.name = 'Head';
  cabeca.position.set(0, 0.1, 0);
  raiz.add(modelo);
  modelo.add(pescoco);
  pescoco.add(cabeca);
  return { raiz, cabeca, olhar: new Olhar(raiz, modelo) };
}

/** Pra onde o rosto (+Z da cabeca) aponta, em mundo. */
const rosto = (cabeca: THREE.Object3D): THREE.Vector3 => {
  cabeca.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(cabeca.getWorldQuaternion(new THREE.Quaternion()));
};

/** Um quadro do jeito do atleta: devolve, (o mixer), olha. */
function quadros(o: Olhar, alvo: THREE.Vector3 | null, n: number): void {
  for (let i = 0; i < n; i++) {
    o.antesDoClipe();
    o.depoisDoClipe(alvo, 1 / 60);
  }
}

test('a cabeca vira pra bola, dividindo o giro com o pescoco', () => {
  const { raiz, cabeca, olhar } = montar();
  const bola = new THREE.Vector3(1.5, 1.6, 1.5);   // a' esquerda, 45 graus
  quadros(olhar, bola, 120);

  const para = bola.clone().sub(cabeca.getWorldPosition(new THREE.Vector3())).normalize();
  assert.ok(rosto(cabeca).angleTo(para) < 0.05, `rosto a ${rosto(cabeca).angleTo(para).toFixed(2)} rad da bola`);
  // O pescoco fez parte do giro, e a cabeca so' o resto.
  const doPescoco = new THREE.Vector3(0, 0, 1).applyQuaternion(raiz.getObjectByName('Neck')!.quaternion);
  assert.ok(doPescoco.x > 0.2 && doPescoco.x < 0.6, `pescoco girou ${doPescoco.x.toFixed(2)}`);
});

test('o giro nao acumula de um quadro pro outro', () => {
  const { cabeca, olhar } = montar();
  const bola = new THREE.Vector3(1, 1.6, 2);
  quadros(olhar, bola, 120);
  const antes = rosto(cabeca);
  quadros(olhar, bola, 120);
  assert.ok(rosto(cabeca).angleTo(antes) < 1e-3, 'a cabeca continuou girando com a bola parada');
});

test('bola nas costas: a cabeca para no ombro, e nao vira pra tras', () => {
  const { raiz, cabeca, olhar } = montar();
  quadros(olhar, new THREE.Vector3(0.3, 1.6, -3), 120);
  const r = rosto(cabeca);
  assert.ok(r.z > 0.2, `o rosto foi pra tras: z=${r.z.toFixed(2)}`);

  // E o limite e' da frente do CORPO: virar o corpo leva o olhar junto.
  raiz.rotation.y = Math.PI;
  raiz.updateMatrixWorld(true);
  quadros(olhar, new THREE.Vector3(0, 1.6, -3), 120);
  assert.ok(rosto(cabeca).z < -0.95, 'com o corpo virado pra bola, nao olhou pra ela');
});

test('sem alvo, o olhar volta devagar pro que o clipe mandou', () => {
  const { cabeca, olhar } = montar();
  quadros(olhar, new THREE.Vector3(2, 1.6, 1), 120);
  quadros(olhar, null, 3);
  assert.ok(rosto(cabeca).x > 0.2, 'soltou num estalo');
  quadros(olhar, null, 120);
  assert.ok(rosto(cabeca).angleTo(new THREE.Vector3(0, 0, 1)) < 0.02, 'nao voltou pra frente');
});

test('o limite: de lado ate 70 graus, e sempre unitario', () => {
  const v = limitarOlhar(new THREE.Vector3(-1, 0, -0.01), new THREE.Vector3());
  assert.ok(Math.abs(v.length() - 1) < 1e-9);
  assert.ok(Math.abs(Math.atan2(v.x, v.z) + 1.2) < 1e-6, 'bola a direita e atras: para no ombro direito');
  const cima = limitarOlhar(new THREE.Vector3(0, 10, 0.1), new THREE.Vector3());
  assert.ok(cima.z > 0.5, 'bola bem em cima: olhou pra tras por cima da cabeca');
});
