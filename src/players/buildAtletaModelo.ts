import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ATHLETE } from '../config';
import { montarClipes } from './poses';
import urlDoAtleta from '../assets/atleta.glb?url';

/**
 * O corpo de MODELO do atleta: "Ultimate Modular Men Pack", de Quaternius (CC0).
 *
 * Segunda pele, como a quadra: o `Motor` continua sendo quem diz onde o corpo
 * esta' e pra onde ele olha, e o `Hitter` continua medindo alcance a partir dos
 * pes. O modelo so' desenha. Nenhuma regra sabe que ele existe.
 *
 * A escala e' um presente e vale registrar: o modelo mede 1,86 m com os pes em
 * y = 0, que e' exatamente o `ATHLETE.height`. Nao ha' transform na raiz, nao
 * ha' Z-up e nao ha' escala 0,01 — as tres armadilhas que a quadra de modelo
 * teve. Ele entra sem encaixe nenhum, e a conferencia disso e' um teste.
 */

/** O material que recebe a cor do time. E' o colete, que e' a peca mais visivel. */
const MATERIAL_DO_TIME = 'Worker_Vest';

export interface ModeloDoAtleta {
  /** O molde. Cada atleta recebe uma copia com esqueleto proprio. */
  readonly molde: THREE.Object3D;
  readonly animacoes: readonly THREE.AnimationClip[];
  dispose(): void;
}

/**
 * Uma copia do modelo, pronta pra entrar num atleta.
 *
 * `SkeletonUtils.clone` e' obrigatorio aqui, e `Object3D.clone` NAO serve: o
 * clone comum copia a arvore mas deixa as malhas apontando pro esqueleto
 * ORIGINAL. Dois atletas com o mesmo esqueleto significam dois bonecos fazendo
 * exatamente a mesma pose, o tempo todo — e o sintoma nao parece um bug de
 * clone, parece a IA copiando o jogador.
 */
export function copiarModelo(molde: THREE.Object3D, cor: number): THREE.Object3D {
  const copia = clonarEsqueleto(molde);

  copia.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;

    malha.castShadow = true;
    /**
     * A caixa de corte sai da pose de REPOUSO, e um braco esticado num
     * mergulho sai dela. Sem isto o atleta pisca fora da tela quando a caixa
     * antiga deixa o quadro e a nova ainda nao existe.
     */
    malha.frustumCulled = false;

    // Materiais por copia, senao pintar um time pinta os dois.
    const lista = Array.isArray(malha.material) ? malha.material : [malha.material];
    const pintados = lista.map((m) => {
      const novo = (m as THREE.MeshStandardMaterial).clone();
      if (novo.name === MATERIAL_DO_TIME) novo.color.setHex(cor);
      return novo;
    });
    malha.material = Array.isArray(malha.material) ? pintados : pintados[0]!;
  });

  return copia;
}

/** Carrega o modelo. Uma vez, pro jogo inteiro. */
export async function carregarAtletaModelo(): Promise<ModeloDoAtleta> {
  const gltf = await new GLTFLoader().loadAsync(urlDoAtleta);

  const geometrias = new Set<THREE.BufferGeometry>();
  const materiais = new Set<THREE.Material>();
  gltf.scene.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    geometrias.add(malha.geometry);
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) materiais.add(m);
  });

  /**
   * As animacoes do pack MAIS as escritas a mao.
   *
   * Tem que ser aqui, depois de carregar e antes de qualquer copia: as poses
   * sao resolvidas contra o esqueleto de verdade — eixo de osso e rotacao de
   * pai saem do modelo. Uma tabela fixa de angulos teria que ser reescrita a
   * cada troca de pack, e erraria calada.
   */
  return {
    molde: gltf.scene,
    animacoes: [...gltf.animations, ...montarClipes(gltf.scene)],
    dispose(): void {
      for (const g of geometrias) g.dispose();
      for (const m of materiais) m.dispose();
    },
  };
}

/** A altura que o modelo TEM que ter pra caber no jogo. Exportada pro teste. */
export const ALTURA_ESPERADA = ATHLETE.height;
