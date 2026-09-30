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
  /**
   * So' as capsulas.
   *
   * Separadas da raiz porque a raiz e' o que o `Motor` posiciona e gira, e ela
   * tem que continuar existindo quando o corpo vira um modelo. O que some e'
   * este grupo.
   */
  capsulas: THREE.Group;
  /** Ancora onde a bola fica presa no saque. Acompanha o corpo. */
  ancoraDeSaque: THREE.Object3D;
  /** Troca a cor das capsulas. E' o colete de quem ainda nao tem modelo. */
  pintar(cor: number): void;
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

/**
 * Onde a bola do saque fica, no espaco do corpo (frente +Z, esquerda +X).
 *
 * MEDIDO: e' a palma esquerda da pose `EsperaDoSaque`, com o corpo em repouso,
 * mais o raio da bola; a altura e' o `COURT.serveBallHeight`, que a pose foi
 * ajustada pra bater. Com modelo, a bola segue o osso da palma
 * (`Athlete.levarBolaNaMao`) e este ponto so' vale ate' o primeiro quadro; na
 * capsula ele e' a mao. O teste das poses confere que os dois batem.
 */
export const BOLA_NA_MAO = { lado: 0.25, frente: 0.48 } as const;

export function construirAtleta(cor: number, alturaDaBolaNoSaque: number): AtletaVisual {
  const g = garantirGeometrias();
  const root = new THREE.Group();
  const capsulas = new THREE.Group();
  root.add(capsulas);

  const material = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, metalness: 0 });
  const materialClaro = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.9, metalness: 0 });

  const adicionar = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    capsulas.add(mesh);
    return mesh;
  };

  adicionar(g.tronco, material, 0, 0.92, 0);
  adicionar(g.cabeca, material, 0, 1.68, 0);
  adicionar(g.braco, material, -0.36, 1.05, 0.05);
  adicionar(g.braco, material, 0.36, 1.05, 0.05);

  // Marcador de frente: e' o que diz pra onde o atleta esta' virado quando ele
  // e' uma capsula. Sem ele nao da' pra saber se vai encarar a bola ou a rede.
  adicionar(g.frente, materialClaro, 0, 1.68, 0.17);

  /**
   * A bola do saque: NA MAO ESQUERDA, a' frente do corpo e pra fora do eixo.
   *
   * Centrada, ela some. A camera olha o sacador de cima e de tras, e uma bola
   * a' frente do peito fica exatamente atras do tronco nessa linha de visao — o
   * jogador perde de vista justamente a bola que esta' prestes a sacar.
   *
   * O ponto e' a palma da pose `EsperaDoSaque` (ver `BOLA_NA_MAO`). Antes era
   * um ponto escolhido a olho, do outro lado do corpo, e a bola boiava ao lado
   * de um braco caido.
   */
  const ancoraDeSaque = new THREE.Object3D();
  ancoraDeSaque.position.set(BOLA_NA_MAO.lado, alturaDaBolaNoSaque, BOLA_NA_MAO.frente);
  root.add(ancoraDeSaque);

  return {
    root,
    capsulas,
    ancoraDeSaque,
    pintar: (novaCor) => { material.color.setHex(novaCor); },
    dispose: () => {
      material.dispose();
      materialClaro.dispose();
    },
  };
}
