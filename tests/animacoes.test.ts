import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { clipeDoCorpo, type EstadoDoCorpo } from '../src/players/animacoes';
import { estadoDoMotor } from '../src/players/Animador';
import { Motor } from '../src/players/Motor';

/**
 * O que estes testes protegem:
 *
 * O atleta encara a BOLA enquanto anda relativo a' camera, entao ele anda de
 * lado quase o tempo todo. Se a escolha de clipe perder a direcao, o sintoma
 * nao e' "a animacao errada": e' um boneco deslizando de lado com as pernas
 * correndo pra frente, a partida inteira, e ninguem consegue apontar o que esta'
 * errado olhando.
 *
 * O sinal do angulo e' a parte que erra calado — trocar direita com esquerda da'
 * um passo cruzado que parece so' "meio estranho".
 */

const corpo = (p: Partial<EstadoDoCorpo> = {}): EstadoDoCorpo => ({
  noChao: true, mergulhando: false, levantando: false,
  velocidade: 0, anguloDoAndar: 0, ...p,
});

test('parado e parado, e quase parado tambem', () => {
  assert.equal(clipeDoCorpo(corpo()), 'Idle');
  assert.equal(clipeDoCorpo(corpo({ velocidade: 0.4 })), 'Idle');
});

test('a caminhada existe, e e a ponta entre parado e correndo', () => {
  assert.equal(clipeDoCorpo(corpo({ velocidade: 1.5 })), 'Walk');
  assert.equal(clipeDoCorpo(corpo({ velocidade: 3.1 })), 'Walk');
  assert.equal(clipeDoCorpo(corpo({ velocidade: 3.3 })), 'Run');
});

test('correndo, a direcao escolhe o clipe — e o sinal nao pode inverter', () => {
  const rapido = (angulo: number) => clipeDoCorpo(corpo({ velocidade: 6.5, anguloDoAndar: angulo }));

  assert.equal(rapido(0), 'Run', 'pra frente');
  assert.equal(rapido(Math.PI / 2), 'Run_Right', 'pra direita de quem olha');
  assert.equal(rapido(-Math.PI / 2), 'Run_Left', 'pra esquerda de quem olha');
  assert.equal(rapido(Math.PI), 'Run_Back', 'de costas');
  assert.equal(rapido(-Math.PI), 'Run_Back', 'de costas, pelo outro lado');
});

test('as fronteiras caem pro lado certo', () => {
  const rapido = (angulo: number) => clipeDoCorpo(corpo({ velocidade: 6.5, anguloDoAndar: angulo }));
  // 45 graus ainda e' "pra frente"; um fio depois ja' e' lateral.
  assert.equal(rapido(Math.PI / 4), 'Run');
  assert.equal(rapido(Math.PI / 4 + 0.01), 'Run_Right');
  // 135 graus ja' e' "de costas".
  assert.equal(rapido((Math.PI * 3) / 4), 'Run_Back');
  assert.equal(rapido((Math.PI * 3) / 4 - 0.01), 'Run_Right');
});

test('no ar e no mergulho o corpo fica rigido: quem deita e o Motor', () => {
  assert.equal(clipeDoCorpo(corpo({ noChao: false, velocidade: 6.5 })), 'Idle_Neutral');
  assert.equal(clipeDoCorpo(corpo({ mergulhando: true, noChao: false, velocidade: 7.5 })), 'Idle_Neutral');
  assert.equal(clipeDoCorpo(corpo({ levantando: true, velocidade: 2 })), 'Idle_Neutral');
});

test('caido ganha do andar: o corpo no chao nao corre', () => {
  // A velocidade ainda esta alta no primeiro quadro depois de aterrissar.
  assert.equal(clipeDoCorpo(corpo({ levantando: true, velocidade: 6.5, anguloDoAndar: 1 })), 'Idle_Neutral');
});

/**
 * E o leitor do Motor, que e' onde o sinal erra.
 *
 * `clipeDoCorpo` e' testada acima com angulos a mao, e passava mesmo com o
 * leitor invertido — o contrato estava certo e quem traduzia pra ele e' que
 * nao. So' um teste que parte do MOTOR pega isso.
 */
const motorParado = (): Motor => new Motor((p, out) => out.copy(p));

/** Poe o corpo virado pra `frente` andando pra `andar`, e le o angulo. */
function angulo(frente: THREE.Vector3, andar: THREE.Vector3): number {
  const m = motorParado();
  m.encarar(frente);
  m.moverPara(andar);
  // Um quadro basta pra velocidade sair do zero e o leitor ter o que medir.
  m.update(1 / 60);
  const out: EstadoDoCorpo = {
    noChao: true, mergulhando: false, levantando: false, velocidade: 0, anguloDoAndar: 0,
  };
  return estadoDoMotor(m, out).anguloDoAndar;
}

const PRA_FRENTE = new THREE.Vector3(0, 0, 1);

test('o leitor do Motor concorda com o contrato: positivo e a DIREITA', () => {
  // Com o corpo virado pra +Z, a direita dele e -X — a mesma conta do controle.ts.
  const direita = new THREE.Vector3(-1, 0, 0);
  const esquerda = new THREE.Vector3(1, 0, 0);

  assert.ok(Math.abs(angulo(PRA_FRENTE, PRA_FRENTE)) < 0.01, 'andar pra frente nao e zero');
  assert.ok(Math.abs(angulo(PRA_FRENTE, direita) - Math.PI / 2) < 0.01,
    `direita deu ${angulo(PRA_FRENTE, direita).toFixed(2)}, esperado +pi/2`);
  assert.ok(Math.abs(angulo(PRA_FRENTE, esquerda) + Math.PI / 2) < 0.01,
    `esquerda deu ${angulo(PRA_FRENTE, esquerda).toFixed(2)}, esperado -pi/2`);
});

test('e a ponta a ponta: andar pra direita toca Run_Right', () => {
  const m = motorParado();
  m.encarar(PRA_FRENTE);
  m.moverPara(new THREE.Vector3(-1, 0, 0));
  for (let i = 0; i < 30; i++) m.update(1 / 60);   // chega na velocidade de corrida

  const out: EstadoDoCorpo = {
    noChao: true, mergulhando: false, levantando: false, velocidade: 0, anguloDoAndar: 0,
  };
  assert.equal(clipeDoCorpo(estadoDoMotor(m, out)), 'Run_Right');
});
