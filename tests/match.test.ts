import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Match, type AtletaDaPartida, type MotivoDoPonto } from '../src/match/Match';
import { Court, type Side } from '../src/world/Court';
import { MATCH } from '../src/config';

/**
 * As regras sao logica pura, entao da' pra testa-las sem navegador — e vale,
 * porque sao o tipo de coisa que quebra silenciosamente: um saque que vai pro
 * lado errado nao trava nada, so' deixa a partida estranha.
 *
 * A bola aqui e' um dublê. O Match so' precisa dela pra prender no saque,
 * esquecer toques e saber quem tocou por ultimo.
 */

class AtletaFalso implements AtletaDaPartida {
  readonly ancoraDeSaque = new THREE.Object3D();
  preparou = 0;
  terminou = 0;

  constructor(readonly side: Side, readonly nome: string) {}

  prepararSaque(): void { this.preparou++; }
  aoComecarORally(): void {}
  aoTerminarOPonto(): void { this.terminou++; }
}

function montar() {
  const court = new Court();
  const home = new AtletaFalso('home', 'VOCE');
  const away = new AtletaFalso('away', 'CPU');

  const bola = {
    posicao: new THREE.Vector3(0, 1, -4),
    ultimoTocador: null as { side: Side } | null,
    aoTocarOChao: null as ((tipo: 'chao' | 'fora', ponto: THREE.Vector3) => void) | null,
    prender(): void {},
    esquecerToques(): void { this.ultimoTocador = null; },
  };

  const pontos: Array<{ lado: Side; motivo: MotivoDoPonto }> = [];
  // O dublê da bola tem so' o que o Match usa; o cast reconhece isso.
  const match = new Match(court, bola as never, home, away, {
    pontoFeito: (lado, motivo) => pontos.push({ lado, motivo }),
  });

  return { match, court, bola, home, away, pontos };
}

/** Leva a partida ate' o rally: comeca, saca e registra o toque do sacador. */
function iniciarRally(m: ReturnType<typeof montar>): void {
  m.match.comecar();
  m.match.registrarToque(m.match.quemSaca);
}

test('bola no chao dentro da quadra: ponto de quem NAO tem aquele lado', () => {
  const m = montar();
  iniciarRally(m);

  // Caiu no campo Home -> ponto do Away.
  m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, -4));

  assert.equal(m.match.placar.away, 1);
  assert.equal(m.match.placar.home, 0);
  assert.equal(m.pontos[0]!.motivo, 'BOLA NO CHAO');
});

test('bola fora: ponto de quem NAO tocou por ultimo', () => {
  const m = montar();
  iniciarRally(m);

  m.bola.ultimoTocador = { side: 'home' };
  m.bola.aoTocarOChao!('fora', new THREE.Vector3(20, 0, -4));

  assert.equal(m.match.placar.away, 1, 'quem mandou pra fora perde o ponto');
});

test('quarto toque do mesmo lado e' + "' ponto do adversario", () => {
  const m = montar();
  iniciarRally(m);

  // O saque ja' contou como inicio do rally; agora tres toques seguidos do Home.
  for (let i = 0; i < MATCH.maxTouches + 1; i++) m.match.registrarToque('home');

  assert.equal(m.match.placar.away, 1);
  assert.equal(m.pontos[0]!.motivo, 'QUATRO TOQUES');
});

test('a contagem de toques zera quando a bola cruza a rede', () => {
  const m = montar();
  iniciarRally(m);

  m.match.registrarToque('home');
  m.match.registrarToque('home');
  assert.equal(m.match.toquesDoLado('home'), 2);

  // A bola atravessa: o Match percebe pelo lado em que ela esta'.
  m.bola.posicao.set(0, 2, 4);
  m.match.update(1 / 60);
  assert.equal(m.match.toquesDoLado('home'), 0, 'o cruzamento devolve a posse');

  // E agora o Home pode tocar tres vezes de novo sem perder o ponto.
  m.bola.posicao.set(0, 2, -4);
  m.match.update(1 / 60);
  for (let i = 0; i < MATCH.maxTouches; i++) m.match.registrarToque('home');
  assert.equal(m.match.placar.away, 0);
});

test('um rally marca UM ponto so', () => {
  const m = montar();
  iniciarRally(m);

  m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, -4));
  m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, -4));
  m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, -4));

  assert.equal(m.match.placar.away, 1, 'a bola quicando de novo nao pode pontuar');
});

test('quem faz o ponto passa a sacar', () => {
  const m = montar();
  iniciarRally(m);
  assert.equal(m.match.quemSaca, 'home');

  m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, -4)); // ponto do Away
  assert.equal(m.match.quemSaca, 'away');

  // Passado o intervalo, o Away saca de fato.
  m.match.update(MATCH.pointBreak + 0.1);
  assert.equal(m.away.preparou, 1);
});

test('vitoria exige dois pontos de vantagem, com teto', () => {
  const m = montar();
  m.match.comecar();

  const pontoPara = (lado: Side): void => {
    m.match.registrarToque(m.match.quemSaca);
    // Quem perde o ponto e' o dono do lado em que a bola cai.
    const z = lado === 'home' ? 4 : -4;
    m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, z));
    m.match.update(MATCH.pointBreak + 0.1);
  };

  // 14 a 14: ninguem venceu ainda.
  for (let i = 0; i < 14; i++) { pontoPara('home'); pontoPara('away'); }
  assert.equal(m.match.estadoAtual === 'acabou', false, `14 a 14 nao acaba`);

  // 15 a 14 tambem nao, porque falta a vantagem de dois.
  pontoPara('home');
  assert.equal(m.match.estadoAtual === 'acabou', false, '15 a 14 nao acaba');

  // 16 a 14 acaba.
  pontoPara('home');
  assert.equal(m.match.vencedor, 'home');
});

test('o teto encerra uma partida que nao sai do lugar', () => {
  const m = montar();
  m.match.comecar();

  const pontoPara = (lado: Side): void => {
    m.match.registrarToque(m.match.quemSaca);
    m.bola.aoTocarOChao!('chao', new THREE.Vector3(0, 0, lado === 'home' ? 4 : -4));
    m.match.update(MATCH.pointBreak + 0.1);
  };

  // Alternando sempre, ninguem abre dois de vantagem: quem decide e' o teto.
  for (let i = 0; i < 60 && !m.match.vencedor; i++) {
    pontoPara(i % 2 === 0 ? 'home' : 'away');
  }

  assert.ok(m.match.vencedor, 'o teto tem que encerrar');
  const placar = m.match.placar;
  assert.equal(Math.max(placar.home, placar.away), MATCH.hardCap);
});

test('so o lado que saca inicia o rally', () => {
  const m = montar();
  m.match.comecar();
  assert.equal(m.match.rallyVivo, false);

  m.match.registrarToque('away'); // nao e' o sacador
  assert.equal(m.match.rallyVivo, false, 'toque do outro lado nao inicia nada');

  m.match.registrarToque('home');
  assert.equal(m.match.rallyVivo, true);
});
