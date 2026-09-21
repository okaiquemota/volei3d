/**
 * Transforma o estadio cru do Sketchfab no asset que o jogo carrega.
 *
 * Existe como SCRIPT, e nao como "eu abri no Blender e exportei", porque o que
 * sai daqui e' um binario que ninguem revisa. O arquivo cru tem 45 MB e nao
 * cabe no repositorio; o que fica versionado e' esta receita, que diz
 * exatamente o que foi tirado e por que.
 *
 * Fonte: "Low Poly Football Stadium", de ismeteren07, CC-BY-4.0
 * https://sketchfab.com/3d-models/low-poly-football-stadium-c5b5277cebf647fd863f3b37da118c9b
 *
 * As ferramentas NAO estao no package.json de proposito: sharp sozinho pesa mais
 * que o jogo inteiro, e isto roda uma vez por asset, nao a cada `npm install`.
 * Instale na hora de usar:
 *
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 \
 *                   @gltf-transform/functions@4 meshoptimizer sharp
 *   node scripts/preparar-estadio.mjs <cru.glb> <saida.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import {
  dedup, flatten, join, prune, quantize, weld, textureCompress, getBounds,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';

/**
 * O que e' futebol e sai.
 *
 * A conta que justifica cada linha: o modelo inteiro tem 472 mil triangulos, e
 * gol mais alambrado sozinhos sao 345 mil deles — 73%. Os dois tem a malha
 * (rede de gol, tela do alambrado) modelada em GEOMETRIA, nao em textura, que e'
 * de onde vem o absurdo. Nenhum dos dois faz sentido num jogo de volei.
 */
const FUTEBOL_FORA = new Set([
  // As quatro redes de gol, 32 mil triangulos CADA. Sozinhas, 55% do modelo.
  'Plane.004__0', 'Plane.005__0',
  // As traves e o que pendura nelas.
  'Cylinder.004__0', 'Cylinder.011__0',
  'Cylinder.005__0', 'Cylinder.006__0', 'Cylinder.007__0', 'Cylinder.008__0',
  'Cylinder.009__0', 'Cylinder.010__0',
  'Cylinder.012__0', 'Cylinder.013__0', 'Cylinder.014__0', 'Cylinder.015__0',
  'Cylinder.016__0', 'Cylinder.017__0',

  // Alambrado do perimetro: 83 mil triangulos de tela que, da camera de jogo,
  // e' uma linha cinza.
  'Plane__0', 'Plane.001__0', 'Plane.002__0', 'Plane.003__0',
  'Cylinder__0', 'Cylinder.001__0', 'Cylinder.002__0', 'Cylinder.003__0',

  // Bandeirinhas de escanteio, com mastro.
  'Plane.006_Material.023_0', 'Plane.006_Material.022_0',
  'Plane.007_Material.026_0', 'Plane.007_Material.025_0',
  'Plane.008_Material.029_0', 'Plane.008_Material.028_0',
  'Plane.009_Material.002_0', 'Plane.009_Material_0',
  'Cylinder.018_Material.021_0', 'Cylinder.019_Material.024_0',
  'Cylinder.020_Material.027_0', 'Cylinder.021_Material.003_0',

  /**
   * O gramado. Sao DOIS triangulos com a textura de grama e as linhas de
   * futebol pintadas — e e' exatamente em cima dele que a quadra de areia vai.
   * Sai o plano e sai a textura junto, que e' o unico uso dela.
   */
  'saha_Material.001_0',
]);

const [, , entrada, saida] = process.argv;
if (!entrada || !saida) {
  console.error('uso: node scripts/preparar-estadio.mjs <cru.glb> <saida.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(entrada);
const raiz = doc.getRoot();

const conta = () => {
  let tri = 0;
  for (const m of raiz.listMeshes()) {
    for (const p of m.listPrimitives()) {
      const i = p.getIndices();
      tri += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(tri);
};
const triAntes = conta();
const malhasAntes = raiz.listMeshes().length;

/**
 * ALINHAR, e alinhar ANTES de apagar o gramado.
 *
 * O jogo poe a quadra na origem, com o chao em y=0. O modelo vem com a
 * superficie de jogo em y=1,4 e o centro do gramado deslocado. Em vez de deixar
 * esse numero escrito no codigo do jogo — onde ninguem conseguiria conferir de
 * onde veio — ele e' MEDIDO aqui, no proprio gramado, e assado no asset.
 *
 * Por isso a ordem importa: depois de apagar o `saha` nao ha' mais o que medir.
 */
const gramado = raiz.listNodes().find((n) => n.getName() === 'saha_Material.001_0');
if (!gramado) throw new Error('o gramado "saha" sumiu do modelo: sem ele nao da pra alinhar');
const g = getBounds(gramado);
const desvio = [
  -(g.min[0] + g.max[0]) / 2,
  -g.max[1],                      // a SUPERFICIE do gramado, nao o meio dele
  -(g.min[2] + g.max[2]) / 2,
];
for (const no of raiz.listScenes()[0].listChildren()) {
  const t = no.getTranslation();
  no.setTranslation([t[0] + desvio[0], t[1] + desvio[1], t[2] + desvio[2]]);
}
const campo = { x: g.max[0] - g.min[0], z: g.max[2] - g.min[2] };

// ------------------------------------------------------- tirar o futebol
let tirados = 0;
for (const no of raiz.listNodes()) {
  if (FUTEBOL_FORA.has(no.getName())) { no.dispose(); tirados++; }
}

/**
 * Normal map e metallicRoughness saem de TODO material.
 *
 * As duas texturas de 2048 que eles usam pesam 6,3 MB em disco e 45 MB de VRAM,
 * e estao nos MASTROS DOS REFLETORES — treliça vista a 40 metros, no alto do
 * quadro. Relevo e brilho ali nao chegam a virar pixel.
 */
for (const m of raiz.listMaterials()) {
  m.setNormalTexture(null);
  m.setMetallicRoughnessTexture(null);
}

await doc.transform(
  // A ordem importa: limpar antes de comprimir, pra nao comprimir lixo.
  prune(),
  dedup(),
  flatten(),
  join(),

  /**
   * O baseColor de 2048 dos refletores vira 256.
   *
   * Nao e' chute de qualidade: a torre tem 8 m de largura e fica a uns 30 m da
   * camera. Com o jogo em 1280 de largura ela ocupa umas 150 colunas de pixel,
   * e 256 ja' e' mais do que se enxerga.
   */
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256] }),

  /**
   * `weld` junta vertice repetido, `quantize` troca float32 por inteiro.
   *
   * E' de onde vem a maior parte do corte: o arquivo do Sketchfab guarda
   * posicao, normal e UV em float32 e indice em uint32 — o dobro do que precisa
   * pra um modelo desta escala.
   */
  weld(),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
);

doc.createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

await io.write(saida, doc);

const b = getBounds(raiz.listScenes()[0]);
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`nos de futebol tirados: ${tirados}`);
console.log(`triangulos: ${triAntes.toLocaleString()} -> ${conta().toLocaleString()}`);
console.log(`malhas:     ${malhasAntes} -> ${raiz.listMeshes().length}`);
console.log(`texturas:   ${raiz.listTextures().length}`);
console.log(`arquivo:    ${kb((await stat(entrada)).size)} -> ${kb((await stat(saida)).size)}`);
console.log(`tamanho:    ${(b.max[0]-b.min[0]).toFixed(1)} x ${(b.max[1]-b.min[1]).toFixed(1)} x ${(b.max[2]-b.min[2]).toFixed(1)} m`);
console.log(`            y ${b.min[1].toFixed(2)} .. ${b.max[1].toFixed(2)}  (o piso de jogo tem que estar em 0)`);
console.log(`campo:      ${campo.x.toFixed(1)} x ${campo.z.toFixed(1)} m  (quadra+zona livre e 16 x 24)`);
