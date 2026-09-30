import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BALL, COURT, REDE } from '../src/config';
import { AABB } from '../src/core/math';
import { Court } from '../src/world/Court';
import { PASSO, novoContatoNaRede, simularBola, type TipoDeContato } from '../src/world/Physics';
import { TecidoDaRede, VAO_DA_REDE, molaDoCorpo } from '../src/world/tecidoDaRede';
import { Motor } from '../src/players/Motor';
import type { Colisores } from '../src/world/buildCourt';

/**
 * O que estes testes protegem:
 *
 * A rede deixou de ser parede e passou a CEDER — a bola afunda varios passos
 * numa mola em vez de refletir num passo so'. Isso abre defeitos que nenhum
 * olho pega no jogo rodando: a bola que atravessa a rede quando a mola nao
 * segura, a que passa por baixo depois de estufar a malha, a que volta com
 * mais forca do que chegou. E o pano, que e' so' desenho, pode explodir
 * (instabilidade numerica) ou nunca parar — e um pano que nunca dorme custa
 * simulacao todo quadro, pra sempre.
 */

const court = new Court();
const saia = COURT.netHeight - COURT.netDepth;
const colisores: Colisores = {
  rede: [AABB.fromCenterSize(0, saia / 2, 0, REDE.meiaLargura * 2, saia, COURT.netThickness)],
  postes: [-1, 1].map((s) => ({ x: s * (COURT.width / 2 + COURT.postOffset), raio: COURT.postRadius, altura: COURT.postHeight })),
};

interface Voo {
  contatos: TipoDeContato[];
  maiorZ: number;
  menorZ: number;
  maiorAfundamento: number;
  /** Velocidade em z no primeiro passo depois de a malha soltar a bola. */
  saidaZ: number | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** O ponto do primeiro toque no chao, se houve. */
  chao: THREE.Vector3 | null;
}

/** Joga a bola por `segundos`, no passo da fisica, e anota o que interessa. */
function voar(pos0: THREE.Vector3, vel0: THREE.Vector3, segundos = 2): Voo {
  const pos = pos0.clone();
  const vel = vel0.clone();
  const rede = novoContatoNaRede();
  const contato = new THREE.Vector3();
  const voo: Voo = { contatos: [], maiorZ: -Infinity, menorZ: Infinity, maiorAfundamento: 0, saidaZ: null, pos, vel, chao: null };
  let estavaNaMalha = false;

  for (let t = 0; t < segundos; t += PASSO) {
    const tipo = simularBola(pos, vel, court, colisores, PASSO, contato, rede);
    if (tipo) voo.contatos.push(tipo);
    if ((tipo === 'chao' || tipo === 'fora') && !voo.chao) voo.chao = contato.clone();
    voo.maiorZ = Math.max(voo.maiorZ, pos.z);
    voo.menorZ = Math.min(voo.menorZ, pos.z);
    voo.maiorAfundamento = Math.max(voo.maiorAfundamento, rede.afundamento);
    if (estavaNaMalha && rede.lado === 0 && voo.saidaZ === null) voo.saidaZ = vel.z;
    estavaNaMalha = rede.lado !== 0;
    assert.ok(Number.isFinite(pos.x + pos.y + pos.z + vel.x + vel.y + vel.z), 'a bola virou NaN');
  }
  return voo;
}

test('a cortada na malha afunda, nao atravessa, e volta pro lado de onde veio', () => {
  const voo = voar(new THREE.Vector3(0, 1.7, -3), new THREE.Vector3(0, 0, 22));

  assert.ok(voo.contatos.includes('rede'), 'nem encostou na rede');
  assert.ok(voo.maiorAfundamento > 0.15, `afundou so' ${voo.maiorAfundamento.toFixed(2)} m: a malha nao cedeu`);
  assert.ok(voo.maiorAfundamento <= REDE.afundamentoMaximo + 1e-9, 'passou do fundo da malha');
  assert.ok(voo.maiorZ < REDE.afundamentoMaximo, `a bola chegou a z = ${voo.maiorZ.toFixed(2)}: atravessou`);
  assert.ok(voo.chao && voo.chao.z < 0, `caiu em z = ${voo.chao?.z.toFixed(2)}: devia cair do lado de quem bateu`);
});

/** A rede MATA a bola — era a regra da caixa antiga (0,05), e continua sendo. */
test('a malha devolve a bola cansada', () => {
  for (const v of [8, 16, 24, 34]) {
    // Perto da rede: de longe a bola lenta cai antes e bate na saia, nao na malha.
    const voo = voar(new THREE.Vector3(0, 1.75, -0.8), new THREE.Vector3(0, 0, v));
    assert.ok(voo.saidaZ !== null, `a ${v} m/s a bola nao saiu da malha`);
    const volta = -voo.saidaZ!;
    assert.ok(volta >= 0, `a ${v} m/s a bola saiu indo pro outro lado`);
    assert.ok(volta < v * 0.15, `a ${v} m/s voltou a ${volta.toFixed(1)} m/s: rede nao e' trampolim`);
  }
});

test('a bola que passa por cima da fita nao encosta em nada', () => {
  // Saindo a 1 m da rede, cruza o plano a ~2,65 m: 30 cm de folga sobre a fita.
  const voo = voar(new THREE.Vector3(0, 2.7, -1), new THREE.Vector3(0, 0, 12), 0.4);
  assert.ok(!voo.contatos.includes('rede'), 'tocou uma rede que estava 30 cm abaixo');
  assert.ok(voo.maiorZ > 3, 'nao chegou ao outro lado');
});

/** A fita e' um cabo esticado: bola que cai nela quica, e pode ir pra qualquer lado. */
test('a bola que cai na fita quica pra cima', () => {
  const topo = COURT.netHeight - REDE.fita.raio;
  const voo = voar(new THREE.Vector3(0, topo + 0.6, -0.08), new THREE.Vector3(0, -2, 0.6), 0.5);
  assert.ok(voo.contatos.includes('rede'), 'passou pela fita sem tocar');

  // Depois do toque a bola sobe: e' o "bola na fita".
  const pos = new THREE.Vector3(0, topo + 0.6, -0.08);
  const vel = new THREE.Vector3(0, -2, 0.6);
  const rede = novoContatoNaRede();
  const c = new THREE.Vector3();
  let subiu = false;
  for (let t = 0; t < 0.5; t += PASSO) {
    const tipo = simularBola(pos, vel, court, colisores, PASSO, c, rede);
    if (tipo === 'rede' && vel.y > 0) subiu = true;
  }
  assert.ok(subiu, 'a fita nao devolveu a bola pra cima');
  assert.ok(rede.batidaNaFita !== 0, 'a batida na fita nao ficou registrada pro pano');
});

/**
 * A caixa antiga tinha os 8 m da quadra e sobravam 70 cm ate' cada poste —
 * um buraco na altura da rede. A malha de pano vai de poste a poste.
 */
test('o vao entre a malha e o poste fechou', () => {
  const voo = voar(new THREE.Vector3(4.35, 1.8, -3), new THREE.Vector3(0, 0, 15), 1.2);
  assert.ok(voo.contatos.includes('rede'), 'passou pelo vao ao lado da rede');
  assert.ok(voo.maiorZ < REDE.afundamentoMaximo, 'atravessou a rede na ponta');
});

/** A bola no teto de velocidade anda mais que o proprio diametro por passo. */
test('nem a bola mais rapida do jogo atravessa a rede', () => {
  for (const y of [1.3, 1.75, 2.1, COURT.netHeight - REDE.fita.raio + 0.05, 0.6]) {
    const voo = voar(new THREE.Vector3(0, y, -0.8), new THREE.Vector3(0, 0, 34), 1);
    assert.ok(voo.maiorZ < REDE.afundamentoMaximo, `a 34 m/s, na altura ${y.toFixed(2)}, a bola passou pra z = ${voo.maiorZ.toFixed(2)}`);
  }
});

test('o mesmo lance da o mesmo resultado', () => {
  const a = voar(new THREE.Vector3(0.3, 1.5, -2), new THREE.Vector3(0.4, 1, 19));
  const b = voar(new THREE.Vector3(0.3, 1.5, -2), new THREE.Vector3(0.4, 1, 19));
  assert.deepEqual(a.pos.toArray(), b.pos.toArray());
  assert.deepEqual(a.vel.toArray(), b.vel.toArray());
});

// ------------------------------------------------------------------- o pano

const segundos = (t: TecidoDaRede, s: number): void => {
  for (let i = 0; i < Math.round(s * 60); i++) t.update(1 / 60);
};

test('o pano afundado volta pro plano e dorme', () => {
  const t = new TecidoDaRede();
  assert.ok(t.dormindo, 'o pano nasce acordado');
  t.afundar(0, 1.7, 0.4, 1);
  assert.ok(!t.dormindo);
  // O ponto mais perto do centro esta' a 6 cm dele, entao o funil ali e' ~0,3.
  assert.ok(t.maiorDeslocamento > 0.25, `afundou so' ${t.maiorDeslocamento.toFixed(2)} m`);

  segundos(t, 10);
  assert.ok(t.dormindo, `depois de 10 s ainda mexe ${t.maiorDeslocamento.toFixed(4)} m: nunca para de simular`);
  assert.equal(t.maiorDeslocamento, 0);
});

test('as pontas amarradas nos postes nunca saem do lugar, e nada passa do fundo', () => {
  const t = new TecidoDaRede();
  for (let k = 0; k < 20; k++) {
    t.afundar(-REDE.meiaLargura + 0.1, 1.7, 0.6, 1);
    t.cutucar(REDE.meiaLargura - 0.1, COURT.netHeight, 1, -40);
    t.update(1 / 60);
  }
  for (let s = 0; s < 120; s++) {
    t.update(1 / 60);
    for (let l = 0; l < t.linhas; l++) {
      assert.equal(t.z[t.indice(0, l)], 0, 'a ponta da esquerda saiu do poste');
      assert.equal(t.z[t.indice(t.colunas - 1, l)], 0, 'a ponta da direita saiu do poste');
    }
    assert.ok(t.maiorDeslocamento <= REDE.afundamentoMaximo + 1e-6, 'o pano passou do fundo');
    for (const z of t.z) assert.ok(Number.isFinite(z), 'o pano virou NaN');
  }
});

/**
 * O tranco de uma ponta tem que chegar na outra — pela FITA, que e' o cabo
 * esticado. E' o que faz a rede parecer uma peca so', e nao retalhos.
 */
test('o tranco anda pela rede', () => {
  const t = new TecidoDaRede();
  t.cutucar(-3, COURT.netHeight, 0.6, 3);
  const fita = t.linhas - 1;
  const perto = t.indice(t.colunas - 26, fita);   // ~ x = -1,8
  const longe = t.indice(t.colunas - 8, fita);    // ~ x = +3
  let maiorPerto = 0;
  let maiorLonge = 0;
  let chegou = -1;
  for (let i = 0; i < 90; i++) {
    t.update(1 / 60);
    maiorPerto = Math.max(maiorPerto, Math.abs(t.z[perto]!));
    maiorLonge = Math.max(maiorLonge, Math.abs(t.z[longe]!));
    if (chegou < 0 && Math.abs(t.z[longe]!) > 1e-3) chegou = i / 60;
  }
  // A fita ancorada com forca (o defeito da primeira versao) dava 0,9 mm aqui.
  assert.ok(maiorLonge > 2e-3, `a 6 m do tranco a fita mexeu so' ${(maiorLonge * 1000).toFixed(1)} mm`);
  assert.ok(maiorPerto > maiorLonge, 'o tranco chegou mais forte longe do que perto');
  assert.ok(chegou > 0.15, `a onda andou 6 m em ${chegou.toFixed(2)} s: nao e' onda, e' teleporte`);
});

test('o corpo encostado empurra a malha pro lado de la', () => {
  for (const lado of [-1, 1]) {
    const t = new TecidoDaRede();
    t.encostar(0, 1.4, lado * 0.35, 0.4, 0);
    const meio = t.indice(Math.floor(t.colunas / 2), 1);
    assert.ok(t.z[meio]! * lado < 0, `o corpo do lado ${lado} puxou a malha pra ele`);
  }
});

/** A bola fica fora da malha: nada no pano pode empurrar a bola. */
test('o pano nao mexe na bola', () => {
  const t = new TecidoDaRede();
  t.afundar(0, 1.7, 0.5, 1);
  segundos(t, 0.3);
  const voo = voar(new THREE.Vector3(0, 1.7, -3), new THREE.Vector3(0, 0, 22));
  const semPano = voar(new THREE.Vector3(0, 1.7, -3), new THREE.Vector3(0, 0, 22));
  assert.deepEqual(voo.pos.toArray(), semPano.pos.toArray());
  assert.ok(BALL.radius > 0);
});

// -------------------------------------------------------------- o corpo na rede

test('o vao da rede e o do Court sao o mesmo numero', () => {
  assert.equal(Court.NET_GAP, VAO_DA_REDE);
});

/**
 * O corpo entra na malha ate' o fundo, e nao passa pro outro lado.
 *
 * Perto dos postes nao ha' malha pra ceder: ali o limite continua nos 35 cm.
 */
test('o corpo entra na rede ate o fundo, e perto do poste nao entra', () => {
  const p = new THREE.Vector3();
  court.limitarCorpo(new THREE.Vector3(0, 0, -0.01), 'home', p);
  assert.ok(Math.abs(p.z + REDE.corpo.folgaMinima) < 1e-9, `no meio parou em ${p.z.toFixed(3)}`);
  court.limitarCorpo(new THREE.Vector3(0, 0, 0.5), 'home', p);
  assert.ok(p.z < 0, 'o corpo passou pro outro lado da rede');
  court.limitarCorpo(new THREE.Vector3(REDE.meiaLargura, 0, -0.01), 'home', p);
  assert.ok(Math.abs(p.z + Court.NET_GAP) < 1e-9, `junto do poste parou em ${p.z.toFixed(3)}`);
  court.limitarCorpo(new THREE.Vector3(0, 0, 0.01), 'away', p);
  assert.ok(Math.abs(p.z - REDE.corpo.folgaMinima) < 1e-9, 'o lado away nao e o espelho do home');
});

/** Um corpo que corre pra rede, com a mola dela, do jeito que a arena aplica. */
function correrPraRede(segurando: number, soltando: number): { menorDistancia: number; distanciaSegurando: number; final: number } {
  const m = new Motor((pos, out) => court.limitarCorpo(pos, 'home', out));
  m.colocarEm(new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 1));
  let menor = Infinity;
  let zAntes = m.posicao.z;
  const passo = (dir: number): void => {
    const vz = (m.posicao.z - zAntes) * 60;
    zAntes = m.posicao.z;
    m.empurrar(0, molaDoCorpo(m.posicao.z, vz));
    m.moverPara(new THREE.Vector3(0, 0, dir));
    m.update(1 / 60);
    menor = Math.min(menor, Math.abs(m.posicao.z));
  };
  for (let i = 0; i < segurando * 60; i++) passo(1);
  const distanciaSegurando = Math.abs(m.posicao.z);
  for (let i = 0; i < soltando * 60; i++) passo(0);
  return { menorDistancia: menor, distanciaSegurando, final: Math.abs(m.posicao.z) };
}

test('segurando o passo contra a rede, o corpo entra e para no equilibrio', () => {
  const { menorDistancia, distanciaSegurando, final } = correrPraRede(3, 2);
  // O motor acelera a 45 m/s2: a mola equilibra em 45 / rigidez de entrada.
  const esperado = Court.NET_GAP - 45 / REDE.corpo.rigidez;
  assert.ok(Math.abs(distanciaSegurando - esperado) < 0.04,
    `segurando, parou a ${distanciaSegurando.toFixed(2)} m do plano; o equilibrio e ${esperado.toFixed(2)}`);
  assert.ok(menorDistancia >= REDE.corpo.folgaMinima - 1e-9, 'passou do fundo da rede');
  assert.ok(menorDistancia < Court.NET_GAP - 0.15, `o corpo so' chegou a ${menorDistancia.toFixed(2)} m: a rede nao cedeu`);
  assert.ok(final >= Court.NET_GAP - 0.02, `soltando, a rede deixou o corpo a ${final.toFixed(2)} m: nao devolveu`);
});
