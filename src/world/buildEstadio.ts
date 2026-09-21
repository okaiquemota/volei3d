import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { COLORS } from '../config';
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

/**
 * A paleta: material do modelo -> cor do jogo.
 *
 * Os nomes sao do .glb e nao dizem nada sozinhos; o comentario de cada linha e'
 * o que a peca E'. Material que nao esta' aqui fica com a cor que veio — o que
 * vale pros refletores, que so' precisavam perder o metal.
 */
const PALETA: Record<string, number> = {
  'Material.030': COLORS.arquibancadaAzul,      // a arquibancada longa, azul-marinho no modelo
  'Material.033': COLORS.arquibancadaLaranja,   // a arquibancada de fundo, marrom no modelo
  'Material.031': COLORS.estruturaDoEstadio,    // os degraus, preto puro no modelo
  'Material.038': COLORS.estruturaDoEstadio,    // a trelica dos refletores, preto puro e metal
  'Material.015': COLORS.cascaDoEstadio,        // a casca externa do bowl
  'Material.016': COLORS.pisoDaArena,           // a laje, pra casar com o chao do jogo
  'Cube.003__0': COLORS.escadaDoEstadio,        // as escadas, branco puro no modelo
};

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

    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) {
      pintar(m as THREE.MeshStandardMaterial);
    }

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

/**
 * Tira o metal e aplica a paleta. Uma vez por material, no molde.
 *
 * O METAL e' a metade que importa, e nao e' gosto: o modelo vem com
 * `metalness: 1` em quase todo refletor, e material metalico sem mapa de
 * ambiente o three resolve como PRETO — nao ha' o que refletir. Eram 40 mil
 * triangulos de torre saindo como silhueta morta. Zerar o metal devolve a cor
 * difusa, que e' o que um refletor pintado tem de qualquer jeito.
 *
 * A emissiva fica: e' o painel de LED, a unica peca do modelo que emite luz, e
 * e' ela que da' vida ao fundo da quadra.
 */
function pintar(m: THREE.MeshStandardMaterial): void {
  if (m.userData.pintado) return;
  m.userData.pintado = true;

  if (m.metalness !== undefined) m.metalness = 0;

  const cor = PALETA[m.name];
  if (cor !== undefined) {
    m.color.setHex(cor);
    levantarDoPreto(m);
    return;
  }

  /**
   * O que sobra e' refletor: mastro, carcaca e anel de lampada, todos brancos
   * no modelo. Sem o metal eles ficariam branco de papel no meio de uma cena
   * de cor — entao vao pra um cinza-azulado, que e' o que aluminio pintado e'.
   */
  if (m.emissive && m.emissive.getHex() !== 0) return;   // o painel de LED
  if (m.color.getHex() === 0x000000 || m.color.getHex() === 0xffffff
      || m.color.getHex() === 0xe7e7e7) {
    m.color.setHex(COLORS.metalDoEstadio);
  }
  levantarDoPreto(m);
}

/**
 * Tira o preto que sobrou — e o que sobrou NAO era cor, era luz.
 *
 * Depois de repintar tudo, as faces laterais dos degraus continuavam pretas na
 * tela. Nenhum material era preto: a sonda mostrou a paleta inteira em
 * cinza-azulado e cor viva. O que acontecia e' que a luz do jogo e' de PRAIA —
 * um sol direcional forte e pouca luz de preenchimento — e face virada pro lado
 * contrario do sol cai praticamente a zero. Numa praia aberta isso nao aparece,
 * porque nao ha' superficie vertical grande; uma arquibancada e' feita so'
 * disso.
 *
 * A saida e' local, e nao mexer na luz da cena: um pouco da PROPRIA cor no
 * emissivo levanta o piso do material sem tocar em mais nada. Mexer na luz
 * consertaria a arquibancada e lavaria o volume dos atletas junto, que e'
 * exatamente o que aquele par quente/frio existe pra dar.
 */
function levantarDoPreto(m: THREE.MeshStandardMaterial): void {
  if (!m.emissive) return;
  m.emissive.copy(m.color).multiplyScalar(PISO_DE_LUZ);
}

/** Quanto da propria cor entra no emissivo. Acima de ~0,3 o material chapa. */
const PISO_DE_LUZ = 0.22;

/** Quanto o campo do modelo mede, pro teste conferir que a quadra cabe. */
export const CAMPO_DO_MODELO = { x: 20.3, z: 33.4 };
