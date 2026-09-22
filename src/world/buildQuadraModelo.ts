import * as THREE from 'three';
import { COLORS } from '../config';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BORDA_DA_QUADRA, PISO_DE_JOGO, encaixarNoCampo, tirarEnfeites } from './encaixarQuadra';
import { EMPURRAO_DA_PELE, empurrarParaFrente } from './chao';
import urlDaQuadra from '../assets/quadra.glb?url';

/**
 * A quadra de MODELO: "Volleyball court", de Konstantin (CC-BY).
 *
 * O jogo desenha a sua quadra por codigo, com as medidas oficiais — e continua
 * desenhando. Este modulo e' uma segunda PELE pro mesmo campo: a fisica, os
 * limites, o julgamento de dentro e fora e a mira nao sabem que ele existe.
 * Trocar de cenario troca o que se ve', nunca o que vale.
 *
 * Nada e' descartado do modelo. A laje, os bancos, a bola de enfeite e os cones
 * vem todos, e e' de proposito: o que sobra decide o proximo passo melhor do
 * que uma lista de exclusoes decidida antes de ver.
 */

/** Um modelo carregado, pronto pra ser clonado por quadra. */
export interface ModeloDaQuadra {
  /** O molde. Cada arena recebe um `clone()`, que compartilha geometria e material. */
  readonly molde: THREE.Object3D;
  dispose(): void;
}

/**
 * Carrega e encaixa o modelo. Uma vez, pro jogo inteiro.
 *
 * Clonar sai barato porque `Object3D.clone` COMPARTILHA geometria e material —
 * tres quadras na tela custam tres arvores de nos e uma copia da malha.
 */
export async function carregarQuadraModelo(): Promise<ModeloDaQuadra> {
  const gltf = await new GLTFLoader().loadAsync(urlDaQuadra);
  const molde = gltf.scene;
  tirarEnfeites(molde);
  encaixarNoCampo(molde);

  const geometrias = new Set<THREE.BufferGeometry>();
  const materiais = new Set<THREE.Material>();
  molde.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    geometrias.add(malha.geometry);
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) materiais.add(m);
    // A quadra recebe sombra dos atletas, como a areia recebe.
    malha.receiveShadow = true;
  });

  /**
   * O piso de jogo troca o marrom por LARANJA — o mesmo das placas.
   *
   * O modelo vem com um marrom-mostarda (#b0823d) que, ao lado do turquesa da
   * borda e do laranja da propaganda, le' como terra batida. Quadra de verdade
   * e' laranja contra azul, e a cor sai de `COLORS.placas.laranja` pra nao
   * existirem dois laranjas quase iguais no jogo.
   *
   * So' a PECA do piso, e nao o material `brown` inteiro: ele e' compartilhado
   * com a madeira dos bancos, que continua madeira.
   */
  const piso = molde.getObjectByName(PISO_DE_JOGO) as THREE.Mesh | undefined;
  if (piso) {
    const proprio = (piso.material as THREE.MeshStandardMaterial).clone();
    proprio.color.setHex(COLORS.placas.laranja);
    piso.material = proprio;
    materiais.add(proprio);
  }

  /**
   * A borda passa a ser pintada pelo `config`, e nao o contrario.
   *
   * O valor e' o mesmo que ja' vinha no modelo — o ponto nao e' mudar a cor, e'
   * mudar de onde ela vem. No cenario ESTADIO o piso da arena usa essa mesma
   * constante, porque num ginasio a borda da quadra nao acaba: ela continua
   * ate' a arquibancada. Com a cor em dois lugares, a primeira mexida num deles
   * abriria uma emenda visivel no meio do quadro.
   */
  for (const m of materiais) {
    if (m.name === BORDA_DA_QUADRA) (m as THREE.MeshStandardMaterial).color.setHex(COLORS.azulDaQuadra);
  }

  /**
   * A laje do modelo e a areia do mundo sao coplanares, e quem ganha muda com a
   * DISTANCIA.
   *
   * De perto a laje azul aparecia inteira; de longe ela sumia e a quadra ficava
   * so' rede, postes e bancos boiando na areia. Nao e' bug de posicao — e' a
   * precisao do z-buffer, que cai com a distancia: o milimetro que separa as
   * duas superficies deixa de existir antes de a quadra sair da tela.
   *
   * Subir a geometria resolveria a briga e criaria outra: o chao da fisica e'
   * y = 0, entao levantar a laje o bastante pra ganhar de longe afundaria a
   * bola no piso desenhado na hora de quicar.
   *
   * `polygonOffset` empurra o modelo na DIREcAO DA CAMERA so' no teste de
   * profundidade, sem mover um milimetro. A ordem entre as pecas do proprio
   * modelo nao muda, porque o empurrao e' o mesmo pra todas.
   *
   * O quanto vem de `chao.ts`, junto com o empurrao dos MARCADORES — que tem
   * que ser maior. Este mesmo empurrao, escolhido aqui sozinho, foi o que fez
   * os aneis de queda e de mira sumirem dentro do piso do modelo.
   */
  for (const m of materiais) empurrarParaFrente(m, EMPURRAO_DA_PELE);

  return {
    molde,
    dispose(): void {
      for (const g of geometrias) g.dispose();
      for (const m of materiais) m.dispose();
    },
  };
}
