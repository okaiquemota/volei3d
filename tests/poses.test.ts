import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { CAMADAS, medirPerna, montarClipes, RECEITAS } from '../src/players/poses';
import { FAMILIAS, type Familia } from '../src/players/corpos';
import { BOLA_NA_MAO } from '../src/players/buildAthlete';
import { COURT, MERGULHO } from '../src/config';

/**
 * O que estes testes protegem:
 *
 * As poses sao escritas em direcao ("o braco aponta pra la'") e resolvidas
 * CONTRA o esqueleto carregado. Isso e' o que as deixa legiveis, e e' tambem o
 * que as deixa dependentes de fatos do rig que ninguem ve' no codigo: que o
 * filho de todo osso fica em +Y, que o joelho e' folha, que o `Body` tem 27
 * graus de giro que o `Torso` desfaz.
 *
 * Nenhum desses fatos quebra alto. Se um mudar, o jogo continua rodando e o
 * boneco fica errado de um jeito que so' aparece olhando com atencao — pe'
 * enterrado na areia, tronco de lado, mao no lugar do cotovelo. Os numeros
 * abaixo sao os que a sonda mediu no modelo de verdade.
 *
 * E tudo vale pros DOIS esqueletos, o do homem e o da mulher: as receitas sao
 * as mesmas, e o esqueleto da mulher tem outra perna (mais comprida) e outra
 * convencao de eixo na coxa. Cada teste roda nos dois.
 */

/** O arquivo base de cada familia: e' nele que as clipes sao montadas no jogo. */
const lerBase = async (familia: Familia): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> => {
  const buf = fs.readFileSync(new URL(`../src/assets/corpos/${familia}-worker.glb`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((ok, err) =>
    loader.parse(ab, '', ok as never, err));
  gltf.scene.updateMatrixWorld(true);
  return gltf;
};
const carregar = async (familia: Familia): Promise<THREE.Object3D> => (await lerBase(familia)).scene;
/** As receitas foram afinadas no homem: a mulher e' posada com ele de referencia, como no jogo. */
const referencia = async (familia: Familia): Promise<THREE.Object3D | undefined> =>
  (familia === 'masculino' ? undefined : carregar('masculino'));

/** Os ossos pelo nome. */
const ossosDe = (raiz: THREE.Object3D): Map<string, THREE.Bone> => {
  const ossos = new Map<string, THREE.Bone>();
  raiz.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o as THREE.Bone); });
  return ossos;
};

/**
 * As medidas que a sonda tirou de cada esqueleto, e o eixo do joelho na coxa
 * — o eixo LOCAL que fica de lado (pra +X do corpo) quando a perna dobra de
 * frente. Medido na caminhada do pack, que esta' certa: no homem e' o Z da
 * coxa (-Z na esquerda, +Z na direita); na mulher, o +X dos dois lados.
 */
const SONDA: Readonly<Record<Familia, { osso: number; quadril: number; tornozelo: number; coxa: Record<'L' | 'R', THREE.Vector3> }>> = {
  masculino: {
    osso: 0.433, quadril: 0.928, tornozelo: 0.097,
    coxa: { L: new THREE.Vector3(0, 0, -1), R: new THREE.Vector3(0, 0, 1) },
  },
  feminino: {
    osso: 0.482, quadril: 1.0, tornozelo: 0.073,
    coxa: { L: new THREE.Vector3(1, 0, 0), R: new THREE.Vector3(1, 0, 0) },
  },
};

/** Poe o corpo na pose do clipe no instante `t` e devolve como ler os ossos. */
function posar(raiz: THREE.Object3D, clipe: THREE.AnimationClip, t: number, deitar = false) {
  const mixer = new THREE.AnimationMixer(raiz);
  const acao = mixer.clipAction(clipe);
  acao.setLoop(THREE.LoopOnce, 1);
  acao.clampWhenFinished = true;
  acao.play();
  mixer.setTime(t);

  // O tombo do mergulho e' do Motor: giro em torno do +X do PROPRIO corpo,
  // depois de mirar. Sem ele, medir o mergulho nao quer dizer nada.
  raiz.quaternion.set(0, 0, 0, 1);
  if (deitar) {
    raiz.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), MERGULHO.inclinacao));
  }
  raiz.updateMatrixWorld(true);

  const ossos = new Map<string, THREE.Object3D>();
  raiz.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o); });

  const soltar = (): void => { mixer.stopAllAction(); mixer.uncacheRoot(raiz); raiz.quaternion.set(0, 0, 0, 1); };
  const onde = (nome: string): THREE.Vector3 => ossos.get(nome)!.getWorldPosition(new THREE.Vector3());
  /**
   * O tornozelo e' a PONTA da canela: o joelho e' folha, o pe' nao esta' na
   * perna. A canela tem o comprimento da coxa, que nao muda com a pose.
   */
  const tornozelo = (lado: 'R' | 'L'): THREE.Vector3 => {
    const coxa = onde(`UpperLeg${lado}`).distanceTo(onde(`LowerLeg${lado}`));
    return ossos.get(`LowerLeg${lado}`)!.localToWorld(new THREE.Vector3(0, coxa, 0));
  };

  return { onde, tornozelo, soltar };
}

for (const familia of FAMILIAS) {
/** A perna medida no esqueleto bate com a sonda — e nao com a do outro esqueleto. */
test(`${familia}: a perna e medida no proprio esqueleto`, async () => {
  const raiz = await carregar(familia);
  const perna = medirPerna(ossosDe(raiz));
  const sonda = SONDA[familia];
  assert.ok(Math.abs(perna.osso - sonda.osso) < 0.003, `coxa de ${perna.osso.toFixed(3)}`);
  assert.ok(Math.abs(perna.quadril - sonda.quadril) < 0.005, `quadril a ${perna.quadril.toFixed(3)}`);
  assert.ok(Math.abs(perna.tornozelo - sonda.tornozelo) < 0.005, `tornozelo a ${perna.tornozelo.toFixed(3)}`);
  for (const lado of ['L', 'R'] as const) {
    const medido = perna.lateral.get(`UpperLeg${lado}`)!;
    assert.ok(medido.dot(sonda.coxa[lado]) > 0.999, `eixo do joelho na coxa ${lado}: ${medido.toArray().map((v) => v.toFixed(2))}`);
  }
});

/**
 * A SONDA confere com a caminhada do pack: andando, o eixo do joelho de cada
 * coxa fica de lado, pra +X. E' daqui que a convencao saiu, e e' isto que
 * avisa se um pack novo trouxer outra.
 */
test(`${familia}: na caminhada do pack, o eixo do joelho fica de lado`, async () => {
  const gltf = await lerBase(familia);
  const raiz = gltf.scene;
  const walk = gltf.animations.find((c) => c.name === 'Walk')!;
  const mixer = new THREE.AnimationMixer(raiz);
  mixer.clipAction(walk).play();
  for (let i = 0; i < 8; i++) {
    mixer.setTime((walk.duration * i) / 8);
    raiz.updateMatrixWorld(true);
    for (const lado of ['L', 'R'] as const) {
      const eixo = SONDA[familia].coxa[lado].clone()
        .applyQuaternion(raiz.getObjectByName(`UpperLeg${lado}`)!.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(eixo.x > 0.97, `Walk ${i}/8: coxa ${lado} com o joelho pra ${eixo.toArray().map((v) => v.toFixed(2))}`);
    }
  }
  mixer.stopAllAction();
});

const clipes = async (familia: Familia): Promise<Map<string, THREE.AnimationClip>> => {
  const raiz = await carregar(familia);
  return new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));
};

test(`${familia}: toda receita vira clipe, e com o nome dela`, async () => {
  const feitos = await clipes(familia);
  for (const r of RECEITAS) {
    const c = feitos.get(r.nome);
    assert.ok(c, `faltou o clipe "${r.nome}"`);
    assert.equal(c.duration, r.duracao);
  }
});

/**
 * O agachamento e' a conta mais facil de errar do arquivo inteiro.
 *
 * As pernas PENDURAM no `Body`: dobrar joelho levanta o pe', nao abaixa o
 * quadril. Quem abaixa e' o `Body` descendo, e o joelho tem que dobrar o tanto
 * exato pra sola continuar na areia. Se a conta escorregar, o atleta passa a
 * jogar com o pe' enterrado ou flutuando — e a camera de jogo e' longe o
 * bastante pra isso passar despercebido por muito tempo.
 */
test(`${familia}: em todo quadro de pe, a sola continua na areia`, async () => {
  const raiz = await carregar(familia);
  const feitos = new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));

  // Quadro "de pe" e' o que NAO escreve perna a mao. Quem escreve — pulo,
  // mergulho, o ataque no ar — esta' recolhendo perna de proposito, e nao ha'
  // sola nenhuma pra manter no chao.
  let conferidos = 0;
  for (const receita of RECEITAS) {
    for (const quadro of receita.quadros) {
      if (quadro.pose['UpperLegR']) continue;

      const { tornozelo, soltar } = posar(raiz, feitos.get(receita.nome)!, quadro.t);
      for (const lado of ['R', 'L'] as const) {
        const y = tornozelo(lado).y;
        // A altura do tornozelo em repouso, medida no modelo.
        const esperado = SONDA[familia].tornozelo;
        assert.ok(Math.abs(y - esperado) < 0.02,
          `${receita.nome} em t=${quadro.t}: tornozelo ${lado} em ${y.toFixed(3)}, esperado ~${esperado}`);
      }
      soltar();
      conferidos++;
    }
  }

  // Inclusive o agachamento fundo da manchete, que e' o caso que a conta existe
  // pra resolver: sem uma amostra de pe' com `descer` grande o teste passa a
  // toa.
  assert.ok(conferidos >= 8, `so ${conferidos} quadros de pe conferidos`);
  assert.ok(RECEITAS.some((r) => r.quadros.some((q) => q.descer >= 0.15 && !q.pose['UpperLegR'])),
    'nenhum quadro de pe agacha fundo');
});

/**
 * O `Body` do modelo vem com 27 graus de giro em Y e o `Torso` desfaz com
 * -27,7. Mexer em um sem o outro torce o tronco todo, e o sintoma e' uma mao
 * mais funda que a outra numa pose que deveria ser simetrica.
 */
test(`${familia}: a manchete e simetrica: as duas maos na mesma profundidade`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);
  const clipe = feitos.get('Manchete')!;

  const { onde, soltar } = posar(raiz, clipe, 0);
  const d = onde('WristR');
  const e = onde('WristL');

  assert.ok(Math.abs(d.z - e.z) < 0.03, `maos em profundidades diferentes: ${d.z.toFixed(2)} e ${e.z.toFixed(2)}`);
  assert.ok(Math.abs(d.y - e.y) < 0.03, 'maos em alturas diferentes');
  // Juntas, formando plataforma — e nao dois bracos soltos ao lado do corpo.
  assert.ok(d.distanceTo(e) < 0.25, `maos a ${d.distanceTo(e).toFixed(2)} m uma da outra`);
  // E a' frente do corpo, que e' onde a bola vem.
  assert.ok(d.z > 0.35, `plataforma so a ${d.z.toFixed(2)} m a frente`);
  soltar();
});

/**
 * O mergulho e' o unico gesto medido com o corpo TOMBADO, e o referencial vira
 * do avesso: com o corpo deitado, o "pra cima" dele aponta pra frente no mundo.
 * Escrever a pose com `F` de frente — que foi a primeira tentativa — enfiava os
 * bracos na areia, e o teste que pega isso e' este.
 */
test(`${familia}: no mergulho as maos vao a frente do corpo, e acima da areia`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  const { onde, soltar } = posar(raiz, feitos.get('Mergulho')!, 0, true);
  const mao = onde('WristR');
  const quadril = onde('Hips');

  assert.ok(mao.z - quadril.z > 0.8, `mao so ${(mao.z - quadril.z).toFixed(2)} m a frente do quadril`);
  assert.ok(mao.y > 0.05, `mao enterrada: y=${mao.y.toFixed(2)}`);
  assert.ok(mao.y < 0.6, `mao alta demais pra um peixinho: y=${mao.y.toFixed(2)}`);
  // Cabeca erguida: quem mergulha olha a bola, nao a areia.
  assert.ok(onde('Head').y > quadril.y, 'cabeca abaixo do quadril no mergulho');
  soltar();
});

/** O contato da cortada tem que sair acima da rede, senao o gesto mente. */
test(`${familia}: no ataque a mao bate no alto, e a rede tem 2,24 m`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  const { onde, soltar } = posar(raiz, feitos.get('Ataque')!, 0);
  const mao = onde('WristR');
  assert.ok(mao.y > 1.7, `mao de contato a ${mao.y.toFixed(2)} m com os pes no chao`);
  assert.ok(mao.z > 0.1, 'contato atras do corpo');
  // E o braco ESTICADO: a mao longe do ombro e' o que separa cortada de tapa.
  assert.ok(mao.distanceTo(onde('UpperArmR')) > 0.38, 'cotovelo dobrado no contato');
  soltar();
});

/** Cotovelo dobrado no levantamento, esticado na manchete: e o que separa os dois. */
test(`${familia}: levantamento dobra o cotovelo, manchete nao`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  const estica = (nome: string): number => {
    const { onde, soltar } = posar(raiz, feitos.get(nome)!, 0);
    const r = onde('WristR').distanceTo(onde('UpperArmR'));
    soltar();
    return r;
  };

  assert.ok(estica('Manchete') > estica('Levantamento') + 0.05,
    'o braco do levantamento nao esta mais recolhido que o da manchete');
});

/**
 * A SILHUETA, que e' a unica coisa que se enxerga a' distancia da camera de jogo.
 *
 * Este teste existe por causa de um defeito que nenhum outro pegava: as poses
 * estavam certas uma a uma — braco no lugar, cotovelo no angulo, pe' na areia —
 * e mesmo assim quatro dos seis gestos liam como "levantou os dois bracos". De
 * perto eram diferentes; a oito metros, nao.
 *
 * Por isso a medida aqui nao e' de osso. Sao as tres coisas que sobram quando o
 * boneco tem 90 pixels de altura: quao alta esta' a mao, se UM braco subiu ou os
 * dois, e quao separadas estao as maos.
 */
const silhueta = (raiz: THREE.Object3D, clipe: THREE.AnimationClip, t: number) => {
  const { onde, soltar } = posar(raiz, clipe, t);
  const d = onde('WristR');
  const e = onde('WristL');
  const r = { maoAlta: Math.max(d.y, e.y), desnivel: Math.abs(d.y - e.y), separacao: d.distanceTo(e) };
  soltar();
  return r;
};

test(`${familia}: um braco so no ataque e no saque; os dois no pulo e no levantamento`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  // Um braco bate e o outro desce. E' o que da' a leitura de ataque.
  const ataque = silhueta(raiz, feitos.get('Ataque')!, 0);
  assert.ok(ataque.desnivel > 0.5, `ataque com os bracos emparelhados: desnivel ${ataque.desnivel.toFixed(2)}`);
  assert.ok(ataque.maoAlta > 1.7, `mao de ataque baixa: ${ataque.maoAlta.toFixed(2)}`);

  // No saque a outra mao aponta a bola a' frente, nao sobe junto.
  const saque = silhueta(raiz, feitos.get('Saque')!, 0);
  assert.ok(saque.desnivel > 0.22, `saque com as duas maos no alto: desnivel ${saque.desnivel.toFixed(2)}`);

  // Levantamento e pulo sao de dois bracos — e e' por isso que precisam se
  // separar por ALTURA, no teste seguinte.
  for (const [nome, clipe, t] of [
    ['Levantamento', feitos.get('Levantamento')!, 0],
    ['Pulo', feitos.get('Pulo')!, 0.6],
  ] as const) {
    const s = silhueta(raiz, clipe, t);
    assert.ok(s.desnivel < 0.1, `${nome} deveria ser de dois bracos: desnivel ${s.desnivel.toFixed(2)}`);
  }
});

test(`${familia}: a mao do levantamento para na testa; a do pulo passa da cabeca`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  const levanta = silhueta(raiz, feitos.get('Levantamento')!, 0);
  const pula = silhueta(raiz, feitos.get('Pulo')!, 0.6);

  // A cabeca do modelo fica em 1,55 e o alto dela em ~1,65.
  assert.ok(levanta.maoAlta < 1.62,
    `mao do levantamento acima da cabeca (${levanta.maoAlta.toFixed(2)}): vira o mesmo gesto do pulo`);
  assert.ok(levanta.maoAlta > 1.4, `mao do levantamento baixa demais: ${levanta.maoAlta.toFixed(2)}`);
  assert.ok(pula.maoAlta > 1.75, `mao do pulo baixa: ${pula.maoAlta.toFixed(2)}`);
  assert.ok(pula.maoAlta - levanta.maoAlta > 0.18,
    `pulo e levantamento a ${(pula.maoAlta - levanta.maoAlta).toFixed(2)} m um do outro: pouco pra distinguir`);
});

test(`${familia}: a manchete e o unico gesto com as maos abaixo do peito`, async () => {
  const feitos = await clipes(familia);
  const raiz = await carregar(familia);

  const manchete = silhueta(raiz, feitos.get('Manchete')!, 0);
  assert.ok(manchete.maoAlta < 1.05, `plataforma alta demais: ${manchete.maoAlta.toFixed(2)}`);
  assert.ok(manchete.separacao < 0.25, `maos separadas: ${manchete.separacao.toFixed(2)}`);

  for (const nome of ['Ataque', 'Saque', 'Levantamento']) {
    const s = silhueta(raiz, feitos.get(nome)!, 0);
    assert.ok(s.maoAlta - manchete.maoAlta > 0.4, `${nome} perto demais da manchete`);
  }
});

/**
 * O PE' acompanha a perna em todo quadro de todo clipe.
 *
 * `FootL`/`FootR` sao alvos de IK pendurados no `Root`, fora da perna, e a pele
 * do sapato e' presa a eles E a' canela. Os clipes escritos aqui dobravam a
 * canela e deixavam o pe' onde estava: o sapato esticava ate' virar uma prancha
 * no chao — no pulo, meio metro. Este teste nao existia porque o de cima
 * conferia a PONTA DA CANELA na areia, e ela estava certa; quem estava errado
 * era o osso que segura a sola.
 *
 * A medida: a distancia do tornozelo (ponta da canela) ate' a origem do pe'
 * tem que ser a do repouso. Se mudar, a pele entre os dois esta' esticando.
 */
test(`${familia}: o pe acompanha a canela em todo quadro, e o sapato nao estica`, async () => {
  const raiz = await carregar(familia);
  const ossos = ossosDe(raiz);
  const repouso = (lado: 'R' | 'L'): number =>
    ossos.get(`LowerLeg${lado}`)!.localToWorld(new THREE.Vector3(0, SONDA[familia].osso, 0))
      .distanceTo(ossos.get(`Foot${lado}`)!.getWorldPosition(new THREE.Vector3()));
  const vao = { R: repouso('R'), L: repouso('L') };

  const feitos = new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));
  let conferidos = 0;
  for (const receita of RECEITAS) {
    for (const quadro of receita.quadros) {
      const { tornozelo, onde, soltar } = posar(raiz, feitos.get(receita.nome)!, quadro.t);
      for (const lado of ['R', 'L'] as const) {
        const d = tornozelo(lado).distanceTo(onde(`Foot${lado}`));
        assert.ok(Math.abs(d - vao[lado]) < 0.01,
          `${receita.nome} em t=${quadro.t}: pe ${lado} a ${d.toFixed(3)} m do tornozelo, no repouso ${vao[lado].toFixed(3)}`);
      }
      soltar();
      conferidos++;
    }
  }
  assert.ok(conferidos >= RECEITAS.length * 2, `so ${conferidos} quadros conferidos`);
});

/** No chao, a sola fica plana, DE FRENTE e na altura do repouso. */
test(`${familia}: nos quadros de pe, a sola fica plana, de frente e na altura do repouso`, async () => {
  const raiz = await carregar(familia);
  const y0 = new Map<string, number>();
  raiz.traverse((o) => {
    if (o.name === 'FootL' || o.name === 'FootR') y0.set(o.name, o.getWorldPosition(new THREE.Vector3()).y);
  });
  const feitos = new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));
  for (const receita of RECEITAS) {
    if (receita.camada) continue;
    for (const quadro of receita.quadros) {
      if (quadro.pose['UpperLegR']) continue;
      const { soltar } = posar(raiz, feitos.get(receita.nome)!, quadro.t);
      for (const nome of ['FootL', 'FootR']) {
        const o = raiz.getObjectByName(nome)!;
        const y = o.getWorldPosition(new THREE.Vector3()).y;
        const giro = o.getWorldQuaternion(new THREE.Quaternion());
        const bico = new THREE.Vector3(0, 1, 0).applyQuaternion(giro);
        // O +Z local do pe' sai da sola, pra baixo — como no pe' plantado da caminhada.
        const sola = new THREE.Vector3(0, 0, 1).applyQuaternion(giro);
        assert.ok(Math.abs(y - y0.get(nome)!) < 0.015, `${receita.nome} t=${quadro.t}: ${nome} a ${y.toFixed(3)} do chao`);
        assert.ok(bico.z > 0.99, `${receita.nome} t=${quadro.t}: ${nome} com o bico pra ${bico.toArray().map((v) => v.toFixed(2))}`);
        assert.ok(sola.y < -0.99, `${receita.nome} t=${quadro.t}: ${nome} com a sola inclinada`);
      }
      soltar();
    }
  }
});

/**
 * A TORCAO: joelho dobrando pra frente, pe' de frente, em todo quadro.
 *
 * O defeito que isto protege nao mexe em posicao nenhuma — o joelho estava no
 * lugar, o tornozelo tambem. O que estava errado era o GIRO dos ossos em volta
 * deles mesmos: a perna esquerda herdava os ~50 graus pra fora do repouso, a
 * rotula dobrava de lado e, no pulo, os dois pes apontavam pro mesmo lado.
 * Medido nos eixos que a caminhada do pack usa: a coxa com o eixo do joelho
 * de lado (`SONDA`), canela e pe' com o +X de lado.
 */
test(`${familia}: a perna dobra de frente e o pe nunca vira de lado`, async () => {
  const raiz = await carregar(familia);
  const feitos = new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));
  const eixo = (nome: string, local: THREE.Vector3): THREE.Vector3 =>
    local.clone().applyQuaternion(raiz.getObjectByName(nome)!.getWorldQuaternion(new THREE.Quaternion()));
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  let conferidos = 0;
  for (const receita of RECEITAS) {
    if (receita.camada) continue;
    for (const quadro of receita.quadros) {
      const { soltar } = posar(raiz, feitos.get(receita.nome)!, quadro.t);
      const onde = `${receita.nome} t=${quadro.t}`;
      assert.ok(eixo('UpperLegL', SONDA[familia].coxa.L).x > 0.97, `${onde}: coxa esquerda torcida`);
      assert.ok(eixo('UpperLegR', SONDA[familia].coxa.R).x > 0.97, `${onde}: coxa direita torcida`);
      for (const lado of ['L', 'R']) {
        assert.ok(eixo(`LowerLeg${lado}`, X).x > 0.97, `${onde}: canela ${lado} torcida`);
        assert.ok(eixo(`Foot${lado}`, X).x > 0.97, `${onde}: pe ${lado} virado de lado`);
        // E o bico nunca aponta pra tras: no ar ele desce, mas de frente.
        assert.ok(eixo(`Foot${lado}`, new THREE.Vector3(0, 1, 0)).z > 0, `${onde}: pe ${lado} com o bico pra tras`);
      }
      // O quadril reto, como na caminhada: nada dos 27 graus do repouso.
      const frente = eixo('Body', Z);
      assert.ok(Math.abs(Math.atan2(frente.x, frente.z)) < 0.02, `${onde}: quadril virado`);
      soltar();
      conferidos++;
    }
  }
  assert.ok(conferidos >= 15, `so ${conferidos} quadros`);
});

/**
 * No ar, o pe' vai ESTICADO: bico pra baixo, alem da canela.
 *
 * Aqui o boneco nao sai do chao — quem levanta o corpo no jogo e' o Motor — e
 * por isso a prova e' o GIRO do pe', e nao a altura dele.
 */
test(`${familia}: no pulo e na cortada o pe vai esticado, de bico pra baixo`, async () => {
  const raiz = await carregar(familia);
  const feitos = new Map(montarClipes(raiz, RECEITAS, await referencia(familia)).map((c) => [c.name, c]));
  for (const nome of ['Pulo', 'Cortada', 'Mergulho']) {
    const receita = RECEITAS.find((r) => r.nome === nome)!;
    assert.ok(receita.quadros.every((q) => q.pose['UpperLegR']), `${nome} tem quadro sem perna escrita`);
    const { soltar } = posar(raiz, feitos.get(nome)!, 0);
    for (const pe of ['FootL', 'FootR']) {
      const bico = new THREE.Vector3(0, 1, 0).applyQuaternion(raiz.getObjectByName(pe)!.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(bico.y < -0.3, `${nome}: ${pe} continua plano, como quem pisa`);
    }
    soltar();
  }
});

/**
 * Camada e' so' do peito pra cima: nenhuma trilha de perna, quadril ou pe'.
 *
 * Uma trilha dessas que escapasse brigaria com o `Walk` de baixo, e o
 * sacador andando pela linha de fundo sairia com as pernas meio paradas.
 */
test(`${familia}: a camada nao leva perna, quadril nem pe`, async () => {
  const feitos = await clipes(familia);
  assert.ok(CAMADAS.size > 0, 'nenhuma camada');
  for (const nome of CAMADAS) {
    const trilhas = feitos.get(nome)!.tracks.map((t) => t.name.split('.')[0]!);
    for (const osso of trilhas) {
      assert.ok(!/Leg|Foot|^PT|^Body$/.test(osso), `${nome} escreve ${osso}`);
    }
  }
});

/**
 * A bola do saque esta' NA palma esquerda da `EsperaDoSaque`, e a palma
 * esta' virada pra cima — por baixo da bola, segurando.
 *
 * No jogo a bola segue o osso da palma (`Athlete.levarBolaNaMao`), e vai
 * sempre PRA CIMA dele: se a palma virar de lado, a bola fica ao lado da mao
 * sem nada segurando. Por isso a palma e' conferida com o `Idle` por baixo,
 * como no jogo, e ao longo do ciclo inteiro dele. `BOLA_NA_MAO` e' o ponto
 * de quem nao tem modelo, e tem que bater com a pose sozinha.
 */
test(`${familia}: a bola do saque fica na palma esquerda, com a palma pra cima`, async () => {
  const gltf = await lerBase(familia);
  const raiz = gltf.scene;
  raiz.updateMatrixWorld(true);
  const espera = montarClipes(raiz, RECEITAS, await referencia(familia)).find((c) => c.name === 'EsperaDoSaque')!;
  const idle = gltf.animations.find((c) => c.name === 'Idle')!;

  const palma = (): { centro: THREE.Vector3; normal: THREE.Vector3 } => {
    raiz.updateMatrixWorld(true);
    const w = (n: string): THREE.Vector3 => raiz.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    return {
      centro: w('Middle1L').add(w('Middle2L')).multiplyScalar(0.5),
      normal: new THREE.Vector3(0, 0, -1)
        .applyQuaternion(raiz.getObjectByName('WristL')!.getWorldQuaternion(new THREE.Quaternion())),
    };
  };

  // Sozinha: o ponto fixo de quem nao tem modelo.
  const so = new THREE.AnimationMixer(raiz);
  so.clipAction(espera).play();
  so.setTime(0);
  const p = palma();
  const bola = new THREE.Vector3(BOLA_NA_MAO.lado, COURT.serveBallHeight, BOLA_NA_MAO.frente);
  const acima = bola.y - p.centro.y;
  // Raio da bola (0,105) mais meia mao: a bola apoia, nao atravessa.
  assert.ok(acima > 0.1 && acima < 0.15, `bola ${acima.toFixed(3)} m acima da palma`);
  assert.ok(Math.hypot(bola.x - p.centro.x, bola.z - p.centro.z) < 0.04, 'bola fora da palma');
  so.stopAllAction();
  so.uncacheRoot(raiz);

  // Por cima do Idle, com o peso do `Animador`.
  const jogo = new THREE.AnimationMixer(raiz);
  jogo.clipAction(idle).play();
  const camada = jogo.clipAction(espera);
  camada.setLoop(THREE.LoopOnce, 1);
  camada.clampWhenFinished = true;
  camada.setEffectiveWeight(10).play();
  for (let i = 0; i <= 8; i++) {
    jogo.setTime((idle.duration * i) / 8);
    const { normal } = palma();
    assert.ok(normal.y > 0.9, `Idle ${i}/8: palma virada pra ${normal.toArray().map((v) => v.toFixed(2))}`);
  }
  jogo.stopAllAction();
  jogo.uncacheRoot(raiz);
});
}

/**
 * A mulher e' posada como o homem: em todo quadro de todo clipe, tronco,
 * braco, mao e cabeca ficam com o MESMO giro em mundo nos dois esqueletos.
 *
 * E' a prova da `referencia` de `montarClipes`. Sem ela, o ombro dela (87
 * graus girado em volta do proprio eixo, no repouso) passava o giro pro braco
 * inteiro: posicao certa, torcao errada — a palma do saque de lado e a pele do
 * braco retorcida. A posicao das maos nao pega isso; o giro pega.
 */
test('o esqueleto da mulher faz os gestos com os mesmos giros do homem', async () => {
  const homem = await carregar('masculino');
  const mulher = await carregar('feminino');
  const dele = new Map(montarClipes(homem, RECEITAS).map((c) => [c.name, c]));
  const dela = new Map(montarClipes(mulher, RECEITAS, homem).map((c) => [c.name, c]));
  const OSSOS = ['Chest', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR'];
  let conferidos = 0;
  for (const receita of RECEITAS) {
    if (receita.camada) continue;
    for (const quadro of receita.quadros) {
      const a = posar(homem, dele.get(receita.nome)!, quadro.t);
      const b = posar(mulher, dela.get(receita.nome)!, quadro.t);
      for (const nome of OSSOS) {
        const qa = homem.getObjectByName(nome)!.getWorldQuaternion(new THREE.Quaternion());
        const qb = mulher.getObjectByName(nome)!.getWorldQuaternion(new THREE.Quaternion());
        const graus = (2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))) * 180) / Math.PI;
        assert.ok(graus < 6, `${receita.nome} t=${quadro.t}: ${nome} da mulher ${graus.toFixed(0)} graus fora do homem`);
      }
      a.soltar();
      b.soltar();
      conferidos++;
    }
  }
  assert.ok(conferidos >= 15, `so ${conferidos} quadros`);
});
