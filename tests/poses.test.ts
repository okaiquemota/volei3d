import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { montarClipes, RECEITAS } from '../src/players/poses';
import { MERGULHO } from '../src/config';

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
 */

const carregar = async (): Promise<THREE.Object3D> => {
  const buf = fs.readFileSync(new URL('../src/assets/atleta.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, err) =>
    new GLTFLoader().parse(ab, '', ok as never, err));
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
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
  /** O tornozelo e' a PONTA da canela: o joelho e' folha, o pe' nao esta' na perna. */
  const tornozelo = (lado: 'R' | 'L'): THREE.Vector3 =>
    ossos.get(`LowerLeg${lado}`)!.localToWorld(new THREE.Vector3(0, 0.433, 0));

  return { onde, tornozelo, soltar };
}

const clipes = async (): Promise<Map<string, THREE.AnimationClip>> => {
  const raiz = await carregar();
  return new Map(montarClipes(raiz, RECEITAS).map((c) => [c.name, c]));
};

test('toda receita vira clipe, e com o nome dela', async () => {
  const feitos = await clipes();
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
test('em todo quadro de pe, a sola continua na areia', async () => {
  const raiz = await carregar();
  const feitos = new Map(montarClipes(raiz, RECEITAS).map((c) => [c.name, c]));

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
        // 0,097 e' a altura do tornozelo em repouso, medida no modelo.
        assert.ok(Math.abs(y - 0.097) < 0.02,
          `${receita.nome} em t=${quadro.t}: tornozelo ${lado} em ${y.toFixed(3)}, esperado ~0.097`);
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
test('a manchete e simetrica: as duas maos na mesma profundidade', async () => {
  const feitos = await clipes();
  const raiz = await carregar();
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
test('no mergulho as maos vao a frente do corpo, e acima da areia', async () => {
  const feitos = await clipes();
  const raiz = await carregar();

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
test('no ataque a mao bate no alto, e a rede tem 2,24 m', async () => {
  const feitos = await clipes();
  const raiz = await carregar();

  const { onde, soltar } = posar(raiz, feitos.get('Ataque')!, 0);
  const mao = onde('WristR');
  assert.ok(mao.y > 1.7, `mao de contato a ${mao.y.toFixed(2)} m com os pes no chao`);
  assert.ok(mao.z > 0.1, 'contato atras do corpo');
  // E o braco ESTICADO: a mao longe do ombro e' o que separa cortada de tapa.
  assert.ok(mao.distanceTo(onde('UpperArmR')) > 0.38, 'cotovelo dobrado no contato');
  soltar();
});

/** Cotovelo dobrado no levantamento, esticado na manchete: e o que separa os dois. */
test('levantamento dobra o cotovelo, manchete nao', async () => {
  const feitos = await clipes();
  const raiz = await carregar();

  const estica = (nome: string): number => {
    const { onde, soltar } = posar(raiz, feitos.get(nome)!, 0);
    const r = onde('WristR').distanceTo(onde('UpperArmR'));
    soltar();
    return r;
  };

  assert.ok(estica('Manchete') > estica('Levantamento') + 0.05,
    'o braco do levantamento nao esta mais recolhido que o da manchete');
});
