import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import {
  CATALOGO, FAMILIAS, PECAS, VISUAL_PADRAO, acessoriosDe, ajustar, carregarMeuVisual, chaveDoVisual,
  encaixa, guardarMeuVisual, lerVisual, opcoesDe, parteDe, trocarFamilia, visualDaFonte, visualSorteado,
  type Familia, type Visual,
} from '../src/players/corpos';
import { Corpos, malhasDoVisual, type ArquivoDeCorpo } from '../src/players/montarCorpo';

/**
 * O que estes testes protegem:
 *
 * O criador deixa o jogador juntar qualquer cabeca com qualquer tronco, e a
 * CPU sorteia o mesmo. Isso so' funciona se duas coisas forem verdade sempre:
 * a combinacao FECHA (calca ate' o sapato, nada de canela sem malha), e a
 * montagem religa cada peca ao esqueleto certo — senao a cabeca de um fica
 * parada no ar enquanto o corpo do outro corre.
 */

/** Gerador com semente, pro sorteio dar o mesmo em todo teste. */
function semente(n: number): () => number {
  let s = n;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

test('cada personagem do pack, inteiro, fecha', () => {
  for (const familia of FAMILIAS) {
    for (const id of Object.keys(CATALOGO[familia].fontes)) {
      assert.ok(encaixa(visualDaFonte(familia, id)), `${familia}/${id} nao fecha com as proprias pecas`);
    }
  }
});

test('todas as pecas de todas as familias estao no catalogo', () => {
  for (const familia of FAMILIAS) {
    assert.ok(CATALOGO[familia].fontes[CATALOGO[familia].base], `${familia} sem a base`);
    for (const peca of PECAS) assert.ok(opcoesDe(familia, peca).length >= 10, `${familia}: poucas opcoes de ${peca}`);
  }
  assert.deepEqual(acessoriosDe('masculino'), ['adventurer']);
});

/**
 * A regra do cano: calca curta com tenis baixo NAO fecha. Conferido num par
 * de verdade — a calca da futurista termina a 43 cm, o tenis casual a 18.
 */
test('calca que entra em bota alta nao fecha com tenis baixo', () => {
  const v: Visual = { ...visualDaFonte('feminino', 'scifi'), pes: 'casual' };
  assert.equal(encaixa(v), false);
  assert.ok(parteDe('feminino', 'scifi', 'pernas')!.y[0] > parteDe('feminino', 'casual', 'pes')!.y[1] + 0.2);
});

test('trocar uma peca que abre conserta a outra, e mantem a escolhida', () => {
  const antes = visualDaFonte('feminino', 'scifi');
  const depois = ajustar({ ...antes, pes: 'casual' }, 'pes');
  assert.equal(depois.pes, 'casual', 'a peca escolhida mudou');
  assert.ok(encaixa(depois));
  // O conserto e' o par que veio junto com a peca escolhida.
  assert.equal(depois.pernas, 'casual');
  assert.equal(depois.cabeca, 'scifi', 'mexeu no que nao precisava');

  // Ja' fechando, nao mexe em nada.
  const certo = { ...antes, cabeca: 'witch' };
  assert.equal(ajustar(certo, 'cabeca'), certo);
});

test('o sorteio da CPU sempre fecha e sobrevive ao save', () => {
  const sorte = semente(7);
  const vistos = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const v = visualSorteado(sorte);
    assert.ok(encaixa(v), `sorteio ${i} nao fecha: ${chaveDoVisual(v)}`);
    assert.deepEqual(lerVisual(JSON.parse(JSON.stringify(v))), v);
    vistos.add(chaveDoVisual(v));
  }
  // E sorteia de verdade: 400 sorteios nao podem ser meia duzia de bonecos.
  assert.ok(vistos.size > 300, `so ${vistos.size} corpos diferentes`);
  const familias = new Set([...vistos].map((k) => k.split('|')[0]));
  assert.equal(familias.size, 2, 'o sorteio esqueceu uma familia');
});

test('trocar de familia leva as pecas de mesmo nome, ou a base', () => {
  const punk = trocarFamilia(visualDaFonte('masculino', 'punk'), 'feminino');
  assert.equal(punk.familia, 'feminino');
  assert.equal(punk.cabeca, 'punk');
  assert.ok(encaixa(punk));
  const praia = trocarFamilia(visualDaFonte('masculino', 'beach'), 'feminino');
  assert.equal(praia.cabeca, CATALOGO.feminino.base, 'nao ha praia feminina: vai pra base');
  assert.equal(praia.acessorio, null);
  assert.ok(encaixa(praia));
});

/**
 * O save vem de fora e pode estar podre: peca que sumiu do pack, peca de
 * outra familia, cor que nao e' cor. Em todos, o visual inteiro e' recusado —
 * e quem carrega cai no padrao, sem derrubar o jogo.
 */
test('o save do corpo recusa o que nao da pra montar', () => {
  const bom = { ...VISUAL_PADRAO };
  assert.deepEqual(lerVisual(JSON.parse(JSON.stringify(bom))), bom);
  for (const ruim of [
    null, 'texto', {}, { ...bom, familia: 'robo' }, { ...bom, cabeca: 'nao-existe' },
    { ...bom, tronco: 'witch' }, { ...bom, pele: -1 }, { ...bom, pele: '#fff' }, { ...bom, camisa: 1.5 },
    { ...bom, acessorio: 'punk' }, { ...visualDaFonte('feminino', 'scifi'), pes: 'casual' },
  ]) {
    assert.equal(lerVisual(ruim), null, `aceitou ${JSON.stringify(ruim)}`);
  }

  const guardado = new Map<string, string>();
  const armazem = { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, v); } };
  const meu: Visual = { ...visualDaFonte('feminino', 'witch'), pele: 0x6e4428, camisa: 0xc8312b };
  assert.ok(guardarMeuVisual(armazem, meu));
  assert.deepEqual(carregarMeuVisual(armazem), meu);

  const quebrado = { getItem: (): string => { throw new Error('bloqueado'); }, setItem: (): void => { throw new Error('cheio'); } };
  assert.deepEqual(carregarMeuVisual(quebrado), VISUAL_PADRAO);
  assert.equal(guardarMeuVisual(quebrado, meu), false);
  guardado.set('volei3d.jogador', '{"familia":');
  assert.deepEqual(carregarMeuVisual(armazem), VISUAL_PADRAO);
});

// ------------------------------------------------------------- a montagem

const lerArquivo = async (arquivo: string): Promise<ArquivoDeCorpo> => {
  const buf = fs.readFileSync(new URL(`../src/assets/corpos/${arquivo}.glb`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((ok, err) => loader.parse(ab, '', (g) => ok({ scene: g.scene, animations: g.animations }), err));
};

let pronto: Promise<Corpos> | null = null;
const corpos = (): Promise<Corpos> => {
  pronto ??= (async () => {
    const arquivos = {} as Record<Familia, Record<string, ArquivoDeCorpo>>;
    for (const familia of FAMILIAS) {
      arquivos[familia] = {};
      for (const [id, fonte] of Object.entries(CATALOGO[familia].fontes)) arquivos[familia][id] = await lerArquivo(fonte.arquivo);
    }
    return Corpos.deArquivos(arquivos);
  })();
  return pronto;
};

/** A caixa da PELE, com os ossos aplicados — e nao a da geometria crua. */
function caixaDaPele(corpo: THREE.Object3D): THREE.Box3 {
  corpo.updateMatrixWorld(true);
  const caixa = new THREE.Box3();
  const p = new THREE.Vector3();
  corpo.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      p.fromBufferAttribute(pos, i);
      m.applyBoneTransform(i, p);
      caixa.expandByPoint(p.applyMatrix4(m.matrixWorld));
    }
  });
  return caixa;
}

const ossosDe = (corpo: THREE.Object3D): Set<THREE.Bone> => {
  const s = new Set<THREE.Bone>();
  corpo.traverse((o) => { if ((o as THREE.Bone).isBone) s.add(o as THREE.Bone); });
  return s;
};

/**
 * Todo personagem do pack, montado, fica DE PE' NA AREIA e na altura certa.
 *
 * E' a prova de que cada peca levou a matriz inversa DELA: com a de outra
 * peca, a compressao do arquivo nao se desfaz direito e a malha sai do tamanho
 * errado — uma cabeca de meio metro, um pe' enterrado.
 */
test('todo corpo montado fica de pe na areia, com a altura de gente', async () => {
  const c = await corpos();
  for (const familia of FAMILIAS) {
    for (const id of Object.keys(CATALOGO[familia].fontes)) {
      const v = visualDaFonte(familia, id);
      const corpo = c.montar(v);
      const caixa = caixaDaPele(corpo);
      assert.ok(Math.abs(caixa.min.y) < 0.02, `${familia}/${id}: pe a ${caixa.min.y.toFixed(3)} da areia`);
      assert.ok(caixa.max.y > 1.75 && caixa.max.y < 2.1, `${familia}/${id}: ${caixa.max.y.toFixed(2)} m de altura`);
      assert.ok(caixa.max.x - caixa.min.x < 1.6, `${familia}/${id}: ${(caixa.max.x - caixa.min.x).toFixed(2)} m de largura`);
      Corpos.descartar(corpo);
    }
  }
});

test('as pecas certas, presas ao esqueleto do proprio corpo', async () => {
  const c = await corpos();
  const v: Visual = { ...visualDaFonte('masculino', 'swat'), cabeca: 'punk', tronco: 'adventurer', acessorio: 'adventurer' };
  const a = c.montar(v);
  const b = c.montar(v);

  const nomes: string[] = [];
  a.traverse((o) => { if (o.parent?.name === 'CharacterArmature' && !(o as THREE.Bone).isBone) nomes.push(o.name); });
  assert.deepEqual(nomes.sort(), malhasDoVisual(v).sort());

  // Cada osso da pele e' do proprio corpo — e nenhum e' do outro.
  const deA = ossosDe(a);
  const deB = ossosDe(b);
  a.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    for (const osso of m.skeleton.bones) {
      assert.ok(deA.has(osso), `${m.name}: osso ${osso.name} de fora do corpo`);
      assert.ok(!deB.has(osso), `${m.name}: osso ${osso.name} dividido com outro corpo`);
    }
  });

  // E mexer o osso de um nao mexe a pele do outro: a cabeca anda com o corpo.
  const antes = caixaDaPele(b).max.y;
  a.getObjectByName('Head')!.position.y += 0.5;
  assert.ok(caixaDaPele(a).max.y > antes + 0.4, 'a cabeca nao seguiu o osso');
  assert.ok(Math.abs(caixaDaPele(b).max.y - antes) < 1e-6, 'o outro corpo mexeu junto');
});

test('a cor pinta o que deve, e so naquele corpo', async () => {
  const c = await corpos();
  const vermelho = 0xc8312b;
  const pele = 0x4a2c1c;
  const v: Visual = { ...visualDaFonte('masculino', 'casual_hoodie'), pele, camisa: vermelho, cabelo: 0xd9b25c };
  const pintado = c.montar(v);
  const original = c.montar(visualDaFonte('masculino', 'casual_hoodie'));

  const cores = (corpo: THREE.Object3D): Map<string, string> => {
    const m = new Map<string, string>();
    corpo.traverse((o) => {
      const malha = o as THREE.Mesh;
      if (!malha.isMesh) return;
      for (const mat of [malha.material].flat() as THREE.MeshStandardMaterial[]) m.set(`${o.parent?.name}/${mat.name}`, mat.color.getHexString());
    });
    return m;
  };
  const a = cores(pintado);
  const b = cores(original);
  const principal = parteDe('masculino', 'casual_hoodie', 'tronco')!.principal!;
  const tronco = parteDe('masculino', 'casual_hoodie', 'tronco')!.malha;
  const doTronco = [...a].find(([k]) => k.endsWith(`/${principal}`) && k.includes(tronco)) ?? [...a].find(([k]) => k.endsWith(`/${principal}`));
  assert.equal(doTronco?.[1], new THREE.Color(vermelho).getHexString(), 'a camisa nao pintou');
  for (const [k, cor] of a) if (k.endsWith('/Skin')) assert.equal(cor, new THREE.Color(pele).getHexString(), `${k} sem a pele`);
  // O original continua como veio: a cor e' por corpo.
  for (const [k, cor] of b) if (k.endsWith(`/${principal}`)) assert.notEqual(cor, new THREE.Color(vermelho).getHexString(), `${k} pintou no corpo errado`);
});

test('as duas familias tem as clipes do pack e as escritas a mao', async () => {
  const c = await corpos();
  for (const familia of FAMILIAS) {
    const nomes = c.animacoes(familia).map((a) => a.name);
    for (const n of ['Idle', 'Walk', 'Run', 'Pulo', 'Manchete', 'Cortada', 'EsperaDoSaque']) {
      assert.ok(nomes.includes(n), `${familia} sem ${n}`);
    }
  }
});
