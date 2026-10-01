/**
 * Transforma os personagens do pack da Quaternius nas PECAS que o jogo monta.
 *
 * Fonte: "Ultimate Modular Men Pack" e "Ultimate Modular Women Pack", de
 * Quaternius, CC0 — https://quaternius.com — a pasta "Individual Characters",
 * versao glTF. Cada personagem vem em quatro malhas presas ao mesmo esqueleto
 * (cabeca, tronco, pernas, pes) e as vezes um acessorio (mochila). E' isso que
 * deixa montar personagem: a cabeca de um com o tronco de outro.
 *
 * O que este script faz, e por que:
 *
 * - As 24 animacoes que vem em CADA arquivo sao iguais dentro da familia (os
 *   hashes batem byte a byte). O jogo usa seis. Elas ficam so' no arquivo BASE
 *   de cada familia; os outros saem so' com malha e esqueleto.
 * - Arma nao e' acessorio de volei: pistola e espada saem.
 * - Malha soldada, quantizada e comprimida com meshopt, como o estadio.
 * - E escreve o CATALOGO (`src/players/catalogoDeCorpos.ts`): que peca cada
 *   arquivo tem, e a faixa de altura que ela ocupa no corpo. E' com essa faixa
 *   que o jogo sabe que uma calca que entra numa bota alta nao fecha com um
 *   tenis baixo — sobraria canela de fora. E o material PRINCIPAL de cada
 *   peca (o de maior area, tirando pele, olho e cabelo): e' ele que muda de
 *   cor quando o jogador escolhe a cor da camisa ou da calca.
 *
 * As ferramentas NAO estao no package.json, como no estadio:
 *
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 \
 *                   @gltf-transform/functions@4 meshoptimizer
 *   node scripts/preparar-corpos.mjs <pasta-crua>
 *
 * `<pasta-crua>` tem duas subpastas, `masculino/` e `feminino/`, com os
 * `.gltf` de cada familia com o nome original (Worker.gltf, Punk.gltf...).
 * Homem e mulher NAO se misturam: os ossos tem os mesmos nomes e a mesma
 * ordem, mas as proporcoes sao outras, e uma perna de homem num esqueleto de
 * mulher sai deformada.
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [cru] = process.argv.slice(2);
if (!cru) {
  console.error('uso: node scripts/preparar-corpos.mjs <pasta-crua com masculino/ e feminino/>');
  process.exit(1);
}

const SAIDA = 'src/assets/corpos';
const CATALOGO = 'src/players/catalogoDeCorpos.ts';
/** O arquivo de cada familia que leva as animacoes. */
const BASE = 'Worker';
/** As animacoes do pack que o jogo toca. O resto e' feito a mao (`poses.ts`). */
const USADAS = new Set(['Idle', 'Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right']);
const FORA = /^(Pistol|Sword)$/;
/** O que nao e' roupa: nao conta pra achar a cor principal da peca. */
const CORPO = /^(Skin|Eye|Hair|Moustache)/;

/** Area de um primitivo, em m2, somando os triangulos. */
function area(prim) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const n = idx ? idx.getCount() : pos.getCount();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < n; i += 3) {
    pos.getElement(idx ? idx.getScalar(i) : i, a);
    pos.getElement(idx ? idx.getScalar(i + 1) : i + 1, b);
    pos.getElement(idx ? idx.getScalar(i + 2) : i + 2, c);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const x = u[1] * v[2] - u[2] * v[1];
    const y = u[2] * v[0] - u[0] * v[2];
    const z = u[0] * v[1] - u[1] * v[0];
    total += Math.sqrt(x * x + y * y + z * z) / 2;
  }
  return total;
}

/** O sufixo da malha diz a peca. `Formad_Head` e `Farmer_Pants` sao do pack assim. */
function pecaDe(nome) {
  if (/Head$/.test(nome)) return 'cabeca';
  if (/Body$/.test(nome)) return 'tronco';
  if (/(Legs|Pants)$/.test(nome)) return 'pernas';
  if (/Feet$/.test(nome)) return 'pes';
  return 'acessorio';
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

await mkdir(SAIDA, { recursive: true });
const catalogo = {};
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
let total = 0;

for (const familia of ['masculino', 'feminino']) {
  const pasta = join(cru, familia);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.gltf')).sort();
  catalogo[familia] = { base: BASE.toLowerCase(), fontes: {} };

  for (const arquivo of arquivos) {
    const nome = arquivo.replace(/\.gltf$/, '');
    const id = nome.toLowerCase();
    const doc = await io.read(join(pasta, arquivo));
    const raiz = doc.getRoot();

    // Canal e sampler saem junto, e na mao: `Animation.dispose` nao leva os
    // dois, e sao eles que seguram os dados. Sem isto o `prune` nao achava
    // nada pra tirar e metade do arquivo continuava sendo animacao.
    for (const anim of raiz.listAnimations()) {
      if (nome === BASE && USADAS.has(anim.getName())) continue;
      for (const c of anim.listChannels()) c.dispose();
      for (const s of anim.listSamplers()) s.dispose();
      anim.dispose();
    }
    for (const no of raiz.listNodes()) {
      if (FORA.test(no.getName())) no.dispose();
    }

    // O catalogo sai ANTES de quantizar: a faixa de altura e' a da malha em
    // metros, no repouso, e e' isso que a regra de encaixe compara.
    const partes = {};
    for (const no of raiz.listNodes()) {
      const malha = no.getMesh();
      if (!malha) continue;
      let y0 = Infinity;
      let y1 = -Infinity;
      const materiais = new Set();
      const areas = new Map();
      for (const prim of malha.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        y0 = Math.min(y0, pos.getMin([])[1]);
        y1 = Math.max(y1, pos.getMax([])[1]);
        const mat = prim.getMaterial();
        if (!mat) continue;
        materiais.add(mat.getName());
        if (!CORPO.test(mat.getName())) areas.set(mat.getName(), (areas.get(mat.getName()) ?? 0) + area(prim));
      }
      const principal = [...areas].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      const peca = pecaDe(no.getName());
      if (partes[peca]) throw new Error(`${familia}/${arquivo}: duas malhas de ${peca}`);
      partes[peca] = {
        malha: no.getName(),
        y: [Number(y0.toFixed(3)), Number(y1.toFixed(3))],
        materiais: [...materiais],
        principal,
      };
    }
    for (const peca of ['cabeca', 'tronco', 'pernas', 'pes']) {
      if (!partes[peca]) throw new Error(`${familia}/${arquivo}: falta ${peca}`);
    }

    await doc.transform(prune(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), prune());
    doc.createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

    const destino = join(SAIDA, `${familia}-${id}.glb`);
    await io.write(destino, doc);
    const tamanho = (await stat(destino)).size;
    total += tamanho;
    catalogo[familia].fontes[id] = { arquivo: `${familia}-${id}`, partes };
    console.log(`${familia.padEnd(10)} ${nome.padEnd(14)} ${kb((await stat(join(pasta, arquivo))).size).padStart(8)} -> ${kb(tamanho).padStart(7)}  ${Object.keys(partes).join(', ')}`);
  }
}

const ts = `/**
 * GERADO por scripts/preparar-corpos.mjs — nao editar a mao.
 *
 * As pecas de cada personagem do pack, por familia, e a faixa de altura que
 * cada uma ocupa no corpo em repouso (metros), e o material que muda de cor
 * quando o jogador pinta a peca. Ver \`corpos.ts\`.
 */
export const CATALOGO_DE_CORPOS = ${JSON.stringify(catalogo, null, 2).replace(/"([a-z_0-9]+)":/g, '$1:').replace(/"/g, "'")} as const;
`;
await writeFile(CATALOGO, ts);
console.log(`\ntotal: ${kb(total)} em ${Object.values(catalogo).reduce((n, f) => n + Object.keys(f.fontes).length, 0)} arquivos`);
