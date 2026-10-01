import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import {
  CATALOGO, FAMILIAS, PECAS, VISUAL_PADRAO, acessoriosDe, ajustar, carregarMeuVisual, chaveDoVisual,
  encaixa, guardarMeuVisual, lerVisual, opcoesDe, parteDe, trocarFamilia, visualDaFonte, visualSorteado,
  type Familia, type Peca, type Visual,
} from '../src/players/corpos';
import { Corpos, ESFERA_DO_CORPO, MALHA_DO_CORPO, malhasDoVisual, type ArquivoDeCorpo } from '../src/players/montarCorpo';
import { Animador, estadoDoMotor } from '../src/players/Animador';
import type { EstadoDoCorpo } from '../src/players/animacoes';
import { Motor } from '../src/players/Motor';

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
/** Os arquivos como o loader entrega: a montagem antiga sai deles (ver `montarPorPeca`). */
const lidos = {} as Record<Familia, Record<string, ArquivoDeCorpo>>;
const corpos = (): Promise<Corpos> => {
  pronto ??= (async () => {
    for (const familia of FAMILIAS) {
      lidos[familia] = {};
      for (const [id, fonte] of Object.entries(CATALOGO[familia].fontes)) lidos[familia][id] = await lerArquivo(fonte.arquivo);
    }
    return Corpos.deArquivos(lidos);
  })();
  return pronto;
};

/** A unica malha de um corpo montado. */
function malhaDo(corpo: THREE.Object3D): THREE.SkinnedMesh {
  const malhas: THREE.SkinnedMesh[] = [];
  corpo.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(o as THREE.SkinnedMesh); });
  assert.equal(malhas.length, 1, `o corpo tem ${malhas.length} malhas`);
  return malhas[0]!;
}

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

test('as pecas certas, numa malha so, presa ao esqueleto do proprio corpo', async () => {
  const c = await corpos();
  const v: Visual = { ...visualDaFonte('masculino', 'swat'), cabeca: 'punk', tronco: 'adventurer', acessorio: 'adventurer' };
  const a = c.montar(v);
  const b = c.montar(v);

  const malha = malhaDo(a);
  assert.equal(malha.name, MALHA_DO_CORPO);
  assert.deepEqual([...malha.userData.pecas].sort(), malhasDoVisual(v).sort());
  // Uma malha so' nao quer dizer um shader por corpo: o material e' de todos.
  assert.equal(malha.material, malhaDo(b).material, 'cada corpo com o seu material');

  // Cada osso da pele e' do proprio corpo — e nenhum e' do outro.
  const deA = ossosDe(a);
  const deB = ossosDe(b);
  for (const osso of malha.skeleton.bones) {
    assert.ok(deA.has(osso), `osso ${osso.name} de fora do corpo`);
    assert.ok(!deB.has(osso), `osso ${osso.name} dividido com outro corpo`);
  }

  // E mexer o osso de um nao mexe a pele do outro: a cabeca anda com o corpo.
  const antes = caixaDaPele(b).max.y;
  a.getObjectByName('Head')!.position.y += 0.5;
  assert.ok(caixaDaPele(a).max.y > antes + 0.4, 'a cabeca nao seguiu o osso');
  assert.ok(Math.abs(caixaDaPele(b).max.y - antes) < 1e-6, 'o outro corpo mexeu junto');
  Corpos.descartar(a);
  Corpos.descartar(b);
});

/**
 * A montagem como ela era: cada peca do arquivo, copiada, religada aos ossos
 * do corpo com as inversas DELA. E' a referencia do teste de baixo.
 */
function montarPorPeca(corpo: THREE.Object3D, v: Visual): THREE.SkinnedMesh[] {
  const ossos = new Map<string, THREE.Bone>();
  corpo.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o as THREE.Bone); });
  const pecas: Array<[Peca | 'acessorio', string]> = PECAS.map((p) => [p, v[p]]);
  if (v.acessorio) pecas.push(['acessorio', v.acessorio]);
  const malhas: THREE.SkinnedMesh[] = [];
  for (const [peca, id] of pecas) {
    const parte = parteDe(v.familia, id, peca)!;
    const original = lidos[v.familia][id]!.scene.getObjectByName(parte.malha)!;
    const copia = original.clone(true);
    copia.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.bind(new THREE.Skeleton(m.skeleton.bones.map((b) => ossos.get(b.name)!), m.skeleton.boneInverses), m.bindMatrix);
      malhas.push(m);
    });
    corpo.add(copia);
  }
  return malhas;
}

/** O vertice `i` e a normal dele, com a pele aplicada, no mundo. */
function peleDe(m: THREE.SkinnedMesh, i: number, p: THREE.Vector3, n: THREE.Vector3): void {
  const pos = m.geometry.getAttribute('position');
  const nor = m.geometry.getAttribute('normal');
  p.fromBufferAttribute(pos, i);
  m.applyBoneTransform(i, p);
  p.applyMatrix4(m.matrixWorld);
  // A normal pelo mesmo caminho do shader: a soma das matrizes dos ossos.
  const soma = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const si = m.geometry.getAttribute('skinIndex');
  const sw = m.geometry.getAttribute('skinWeight');
  const parcela = new THREE.Matrix4();
  for (let c = 0; c < 4; c++) {
    const w = sw.getComponent(i, c);
    if (w === 0) continue;
    const k = si.getComponent(i, c);
    parcela.multiplyMatrices(m.skeleton.bones[k]!.matrixWorld, m.skeleton.boneInverses[k]!).multiply(m.bindMatrix);
    for (let e = 0; e < 16; e++) soma.elements[e] += parcela.elements[e]! * w;
  }
  n.fromBufferAttribute(nor, i).applyMatrix3(new THREE.Matrix3().setFromMatrix4(soma)).normalize();
}

/**
 * Juntar as pecas numa malha nao mexe em NADA da imagem: em toda pose, cada
 * vertice e cada normal do corpo junto caem onde caiam com as pecas soltas.
 *
 * E' o que garante que a troca do espaco dos vertices (a quantizacao de cada
 * peca desfeita, as inversas da familia no lugar das da peca) esta' certa —
 * conferido em pose de verdade, e nao so' no repouso, onde quase tudo passa.
 */
test('o corpo junto deforma igual as pecas soltas, em toda pose', async () => {
  const c = await corpos();
  const visuais: Visual[] = [
    { ...visualDaFonte('masculino', 'swat'), cabeca: 'punk', tronco: 'adventurer', acessorio: 'adventurer' },
    { ...visualDaFonte('feminino', 'witch'), cabeca: 'casual', tronco: 'soldier' },
    visualDaFonte('masculino', 'suit'),
    visualDaFonte('feminino', 'scifi'),
  ];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const q = new THREE.Vector3();
  const m2 = new THREE.Vector3();
  for (const v of visuais) {
    const corpo = c.montar(v);
    const junta = malhaDo(corpo);
    const soltas = montarPorPeca(corpo, v);
    const mixer = new THREE.AnimationMixer(corpo);
    for (const nome of ['Idle', 'Run', 'Pulo', 'Manchete', 'Cortada', 'Mergulho']) {
      const clipe = c.animacoes(v.familia).find((a) => a.name === nome);
      if (!clipe) continue;
      mixer.stopAllAction();
      mixer.clipAction(clipe).play();
      mixer.setTime(clipe.duration * 0.37);
      corpo.updateMatrixWorld(true);
      junta.skeleton.update();
      for (const s of soltas) s.skeleton.update();

      let base = 0;
      let pior = 0;
      let piorNormal = 0;
      for (const s of soltas) {
        const total = s.geometry.getAttribute('position').count;
        for (let j = 0; j < total; j += 2) {
          peleDe(junta, base + j, p, n);
          peleDe(s, j, q, m2);
          pior = Math.max(pior, p.distanceTo(q));
          piorNormal = Math.max(piorNormal, n.angleTo(m2));
        }
        base += total;
      }
      assert.equal(base, junta.geometry.getAttribute('position').count, `${chaveDoVisual(v)}: as pecas nao batem com a malha`);
      assert.ok(pior < 1e-4, `${chaveDoVisual(v)} ${nome}: vertice ${(pior * 1000).toFixed(2)} mm fora`);
      assert.ok(piorNormal < 0.01, `${chaveDoVisual(v)} ${nome}: normal ${THREE.MathUtils.radToDeg(piorNormal).toFixed(2)} graus torta`);
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(corpo);
    Corpos.descartar(corpo);
  }
});

/**
 * A esfera de corte e' fixa (`ESFERA_DO_CORPO`): cobre o corpo em toda clipe,
 * das duas familias, com o acessorio — senao o atleta some na borda da tela
 * no meio de um mergulho.
 */
test('a esfera de corte cobre o corpo em toda clipe', async () => {
  const c = await corpos();
  const p = new THREE.Vector3();
  const centro = ESFERA_DO_CORPO.center;
  let maior = 0;
  let onde = '';
  for (const v of [{ ...visualDaFonte('masculino', 'adventurer') }, visualDaFonte('feminino', 'witch')]) {
    const corpo = c.montar(v);
    const malha = malhaDo(corpo);
    const pos = malha.geometry.getAttribute('position');
    const mixer = new THREE.AnimationMixer(corpo);
    for (const clipe of c.animacoes(v.familia)) {
      mixer.stopAllAction();
      mixer.clipAction(clipe).play();
      for (let t = 0; t <= 1; t += 0.125) {
        mixer.setTime(clipe.duration * t);
        corpo.updateMatrixWorld(true);
        malha.skeleton.update();
        for (let i = 0; i < pos.count; i += 5) {
          p.fromBufferAttribute(pos, i);
          malha.applyBoneTransform(i, p);
          const d = p.distanceTo(centro);
          if (d > maior) { maior = d; onde = `${v.familia} ${clipe.name} t=${t}`; }
        }
      }
    }
    mixer.uncacheRoot(corpo);
    Corpos.descartar(corpo);
  }
  assert.ok(maior < ESFERA_DO_CORPO.radius, `${onde}: o corpo vai a ${maior.toFixed(2)} m do centro`);
  // E nao e' folgada a toa: uma esfera grande demais nao corta nada.
  assert.ok(maior > ESFERA_DO_CORPO.radius - 0.5, `a esfera sobra ${(ESFERA_DO_CORPO.radius - maior).toFixed(2)} m`);
});

test('a cor pinta o que deve, e so naquele corpo', async () => {
  const c = await corpos();
  const vermelho = 0xc8312b;
  const pele = 0x4a2c1c;
  const loiro = 0xd9b25c;
  const v: Visual = { ...visualDaFonte('masculino', 'casual_hoodie'), pele, camisa: vermelho, cabelo: loiro };
  const pintado = c.montar(v);
  const original = c.montar(visualDaFonte('masculino', 'casual_hoodie'));

  /** A cor de cada material, lida no primeiro vertice da fatia dele. */
  const cores = (corpo: THREE.Object3D): Array<[string, string]> => {
    const m = malhaDo(corpo);
    const cor = m.geometry.getAttribute('color');
    return (m.userData.fatias as Array<{ peca: string; material: string; inicio: number }>)
      .map((f) => [`${f.peca}/${f.material}`, new THREE.Color(cor.getX(f.inicio), cor.getY(f.inicio), cor.getZ(f.inicio)).getHexString()]);
  };
  const a = cores(pintado);
  const b = cores(original);
  const principal = parteDe('masculino', 'casual_hoodie', 'tronco')!.principal!;
  const hex = (h: number): string => new THREE.Color(h).getHexString();
  assert.ok(a.some(([k]) => k === `tronco/${principal}`), 'sem a camisa');
  for (const [k, cor] of a) {
    if (k === `tronco/${principal}`) assert.equal(cor, hex(vermelho), 'a camisa nao pintou');
    if (k.endsWith('/Skin')) assert.equal(cor, hex(pele), `${k} sem a pele`);
    if (/\/(Hair|Moustache)/.test(k)) assert.equal(cor, hex(loiro), `${k} sem o cabelo`);
  }
  // O que nao foi escolhido fica como o pack desenhou, nos dois corpos.
  const doPack = new Map(b);
  for (const [k, cor] of a) {
    if (k.endsWith('/Skin') || k.endsWith('/Skin_Darker') || /\/(Hair|Moustache|Eyebrows)/.test(k) || k === `tronco/${principal}`) continue;
    assert.equal(cor, doPack.get(k), `${k} mudou de cor sem ninguem pedir`);
  }
  // O original continua como veio: a cor e' por corpo.
  for (const [k, cor] of b) if (k === `tronco/${principal}`) assert.notEqual(cor, hex(vermelho), `${k} pintou no corpo errado`);
  Corpos.descartar(pintado);
  Corpos.descartar(original);
});

/**
 * O que deixa juntar as pecas sem mudar a imagem: o pack inteiro usa o mesmo
 * material, e so' a cor muda. Se um arquivo novo trouxer outro (com textura,
 * outra aspereza), juntar apagaria a diferenca — este teste avisa antes.
 */
test('o pack inteiro usa o mesmo material, so muda a cor', async () => {
  await corpos();
  const vistos = new Set<string>();
  for (const familia of FAMILIAS) {
    for (const arquivo of Object.values(lidos[familia])) {
      arquivo.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        const j = (m.material as THREE.Material).toJSON() as unknown as Record<string, unknown>;
        for (const k of ['uuid', 'name', 'color', 'vertexColors', 'metadata', 'userData']) delete j[k];
        vistos.add(JSON.stringify(j));
      });
    }
  }
  assert.equal(vistos.size, 1, [...vistos].join('\n'));
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

/**
 * Apertando varias teclas juntas, de qualquer jeito: o sapato nao estica e
 * nenhum clipe salta de peso.
 *
 * As duas coisas que o jogador viu como "bug nos pes". O mixer mistura o giro
 * da canela e a posicao do pe' por caminhos diferentes, e o sapato esticava
 * 35 cm no meio de uma mistura (`PesNaCanela` prende os dois). E trocar de
 * clipe antes da mistura anterior acabar fazia peso saltar — o `fadeOut` do
 * three recomeca do 1 —, e o pe' pulava meio metro de um quadro pro outro.
 * O roteiro e' de teclas sorteadas, com pulos, por 20 s, nos dois esqueletos.
 */
test('apertando varias teclas, o sapato nao estica e nenhum clipe salta de peso', async () => {
  const c = await corpos();
  for (const familia of FAMILIAS) {
    const corpo = c.montar(visualDaFonte(familia, 'worker'));
    const anim = new Animador(corpo, c.animacoes(familia));
    const osso = (n: string): THREE.Object3D => corpo.getObjectByName(n)!;
    corpo.updateMatrixWorld(true);
    const coxa = osso('UpperLegL').getWorldPosition(new THREE.Vector3()).distanceTo(osso('LowerLegL').getWorldPosition(new THREE.Vector3()));
    const vao = (l: string): number => osso(`LowerLeg${l}`).localToWorld(new THREE.Vector3(0, coxa, 0))
      .distanceTo(osso(`Foot${l}`).getWorldPosition(new THREE.Vector3()));
    const repouso = { L: vao('L'), R: vao('R') };

    const motor = new Motor((p, out) => out.copy(p));
    const estado = { gesto: null, marcaDoGesto: 0, segurandoBola: false } as unknown as EstadoDoCorpo;
    const sorte = semente(11);
    const teclas = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    const dir = new THREE.Vector3(0, 0, 1);
    let ate = 0;
    let antes = new Map<string, number>();
    let trocas = 0;
    let ultimo = '';
    for (let i = 0; i < 60 * 20; i++) {
      const t = i / 60;
      if (t >= ate) {
        const [x, z] = teclas[Math.floor(sorte() * teclas.length)]!;
        dir.set(x!, 0, z!).normalize();
        ate = t + 0.1 + sorte() * 0.2;
        if (sorte() < 0.15) motor.pular();
      }
      motor.moverPara(dir);
      motor.encarar(new THREE.Vector3(0, 0, 1));
      motor.update(1 / 60);
      anim.update(estadoDoMotor(motor, estado), 1 / 60);
      corpo.updateMatrixWorld(true);

      for (const l of ['L', 'R'] as const) {
        const d = Math.abs(vao(l) - repouso[l]);
        assert.ok(d < 0.005, `${familia} t=${t.toFixed(2)}: sapato ${l} esticado ${(d * 100).toFixed(1)} cm`);
      }
      const pesos = anim.pesosDoCorpo();
      const soma = [...pesos.values()].reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(soma - 1) < 1e-6, `${familia} t=${t.toFixed(2)}: pesos somam ${soma.toFixed(3)}`);
      // No primeiro quadro o primeiro clipe entra sozinho, e sozinho e' peso 1.
      for (const [nome, peso] of i === 0 ? [] : pesos) {
        const salto = Math.abs(peso - (antes.get(nome) ?? 0));
        // A mistura mais rapida (o gesto, 0,06 s) anda 0,28 por quadro.
        assert.ok(salto < 0.3, `${familia} t=${t.toFixed(2)}: ${nome} saltou ${salto.toFixed(2)} de peso`);
      }
      const nome = [...pesos].sort((a, b) => b[1] - a[1])[0]![0];
      if (nome !== ultimo) { trocas++; ultimo = nome; }
      antes = pesos;
    }
    // E o roteiro mexeu de verdade: trocou de clipe dezenas de vezes.
    assert.ok(trocas > 40, `${familia}: so ${trocas} trocas`);
    anim.dispose();
    Corpos.descartar(corpo);
  }
});
