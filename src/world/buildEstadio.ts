import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import urlDoEstadio from '../assets/estadio.glb?url';

/**
 * O estadio: "Low Poly Football Stadium", de ismeteren07 (CC-BY).
 *
 * E' CENARIO e so' cenario. Nao tem colisor, nao entra em nenhuma conta, e a
 * fisica nao sabe que existe — igual a' pele de quadra do cenario QUADRA. A
 * areia, as linhas, a rede e o julgamento de dentro e fora continuam saindo do
 * `Court` como sempre.
 *
 * O arquivo cru do Sketchfab tem 45 MB e e' um estadio de FUTEBOL. O que esta'
 * em `src/assets` ja' veio limpo e alinhado por `scripts/preparar-estadio.mjs`:
 * gol, alambrado e gramado fora (73% dos triangulos eram isso), superficie de
 * jogo trazida pra y=0 e centro do campo pra origem. A receita esta' versionada;
 * o arquivo cru, nao.
 */

/** Um estadio carregado, pronto pra ser clonado por arena. */
export interface ModeloDoEstadio {
  readonly molde: THREE.Object3D;
  dispose(): void;
}

export async function carregarEstadio(): Promise<ModeloDoEstadio> {
  const loader = new GLTFLoader();

  /**
   * Sem o decoder o arquivo nao abre — `EXT_meshopt_compression` e' obrigatoria
   * nele, e nao um enfeite.
   *
   * Vale o que custa: com meshopt o asset tem 1,5 MB, sem ele 4,2 MB. O decoder
   * vem junto com o three (29 kB) e nao acrescenta dependencia nenhuma.
   */
  loader.setMeshoptDecoder(MeshoptDecoder);

  const gltf = await loader.loadAsync(urlDoEstadio);
  const molde = gltf.scene;

  const geometrias = new Set<THREE.BufferGeometry>();
  const materiais = new Set<THREE.Material>();
  molde.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    geometrias.add(malha.geometry);
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) materiais.add(m);

    /**
     * O estadio nao projeta nem recebe sombra.
     *
     * Nao e' economia: e' que a luz do jogo e' de PRAIA, mirada na quadra, e o
     * mapa de sombra cobre a area de jogo. Um estadio de 92 m dentro dele
     * espalharia a resolucao do mapa por vinte vezes mais area, e a sombra dos
     * atletas — que e' a unica que o jogador olha — viraria um borrao.
     */
    malha.castShadow = false;
    malha.receiveShadow = false;

    // Sem isto a arquibancada some quando a camera chega perto da rede: a caixa
    // do estadio e' enorme e o teste de frustum descarta a peca inteira.
    malha.frustumCulled = false;
  });

  return {
    molde,
    dispose(): void {
      for (const g of geometrias) g.dispose();
      for (const m of materiais) m.dispose();
    },
  };
}

/** Quanto o campo do modelo mede, pro teste conferir que a quadra cabe. */
export const CAMPO_DO_MODELO = { x: 20.3, z: 33.4 };
