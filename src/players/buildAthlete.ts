import * as THREE from 'three';

/**
 * O corpo do atleta: capsula, cabeca, dois bracos e um marcador de frente.
 *
 * Low-poly de proposito, como os inimigos do rpk.fps. Nao ha' animacao
 * esqueletal nem modelo — o que o jogador precisa ler daqui e' POSICAO e
 * DIRECAO, e a leitura sai da silhueta, nao do detalhe.
 *
 * As geometrias sao compartilhadas entre os dois atletas: sao criadas uma vez
 * e reaproveitadas. So' o material muda de cor.
 */

export interface AtletaVisual {
  root: THREE.Group;
  /** Ancora onde a bola fica presa no saque. Acompanha o corpo. */
  ancoraDeSaque: THREE.Object3D;
  dispose(): void;
}

let geometrias: {
  tronco: THREE.CapsuleGeometry;
  cabeca: THREE.SphereGeometry;
  braco: THREE.CapsuleGeometry;
  frente: THREE.BoxGeometry;
} | null = null;

function garantirGeometrias(): NonNullable<typeof geometrias> {
  if (geometrias) return geometrias;

  // As medidas vem do prototipo. A capsula do three e' (raio, comprimento do
  // meio), entao o comprimento total e' meio + 2 x raio.
  geometrias = {
    tronco: new THREE.CapsuleGeometry(0.29, 0.87, 4, 10),
    cabeca: new THREE.SphereGeometry(0.15, 12, 10),
    braco: new THREE.CapsuleGeometry(0.085, 0.58, 3, 8),
    frente: new THREE.BoxGeometry(0.12, 0.08, 0.14),
  };
  return geometrias;
}

/** Libera as geometrias compartilhadas. So' no fim do jogo. */
export function descartarGeometriasDeAtleta(): void {
  if (!geometrias) return;
  for (const g of Object.values(geometrias)) g.dispose();
  geometrias = null;
}

export function construirAtleta(cor: number, alturaDaBolaNoSaque: number): AtletaVisual {
  const g = garantirGeometrias();
  const root = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, metalness: 0 });
  const materialClaro = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.9, metalness: 0 });

  const adicionar = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  adicionar(g.tronco, material, 0, 0.92, 0);
  adicionar(g.cabeca, material, 0, 1.68, 0);
  adicionar(g.braco, material, -0.36, 1.05, 0.05);
  adicionar(g.braco, material, 0.36, 1.05, 0.05);

  // Marcador de frente: e' o que diz pra onde o atleta esta' virado quando ele
  // e' uma capsula. Sem ele nao da' pra saber se vai encarar a bola ou a rede.
  adicionar(g.frente, materialClaro, 0, 1.68, 0.17);

  // A bola do saque fica a' frente do corpo, na altura da mao.
  const ancoraDeSaque = new THREE.Object3D();
  ancoraDeSaque.position.set(0, alturaDaBolaNoSaque, 0.55);
  root.add(ancoraDeSaque);

  return {
    root,
    ancoraDeSaque,
    dispose: () => {
      material.dispose();
      materialClaro.dispose();
    },
  };
}
