import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CATALOGO, FAMILIAS, type Familia } from './corpos';
import { Corpos, type ArquivoDeCorpo } from './montarCorpo';

/**
 * As URLs dos 21 arquivos, que o Vite resolve no build.
 *
 * Fora de `montarCorpo.ts` de proposito: `import.meta.glob` so' existe no
 * Vite, e os testes rodam no node, lendo os mesmos arquivos do disco.
 */
const URLS = import.meta.glob<string>('../assets/corpos/*.glb', { query: '?url', import: 'default', eager: true });

/**
 * Carrega o pack inteiro. Uma vez, pro jogo inteiro.
 *
 * Tudo de uma vez, e nao so' as pecas de quem esta' em quadra: o elenco usa
 * quase todas, a CPU sorteia entre todas, e o criador mostra todas. Sao 4 MB
 * (2,8 com o gzip do servidor), em paralelo.
 */
export async function carregarCorpos(): Promise<Corpos> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const arquivos = {} as Record<Familia, Record<string, ArquivoDeCorpo>>;
  await Promise.all(FAMILIAS.flatMap((familia) => {
    arquivos[familia] = {};
    return Object.entries(CATALOGO[familia].fontes).map(async ([id, fonte]) => {
      const url = URLS[`../assets/corpos/${fonte.arquivo}.glb`];
      if (!url) throw new Error(`o build nao tem o corpo ${fonte.arquivo}`);
      const gltf = await loader.loadAsync(url);
      arquivos[familia][id] = { scene: gltf.scene, animations: gltf.animations };
    });
  }));

  return Corpos.deArquivos(arquivos);
}
