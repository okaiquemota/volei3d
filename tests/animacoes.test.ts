import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { camadaDoCorpo, clipeDoCorpo, type EstadoDoCorpo } from '../src/players/animacoes';
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
  noChao: true, mergulhando: false, levantando: false, pousando: false, segurandoBola: false,
  velocidade: 0, anguloDoAndar: 0, gesto: null, marcaDoGesto: 0, ...p,
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

test('no ar toca Pulo, deitado toca Mergulho', () => {
  assert.equal(clipeDoCorpo(corpo({ noChao: false, velocidade: 6.5 })), 'Pulo');
  assert.equal(clipeDoCorpo(corpo({ mergulhando: true, noChao: false, velocidade: 7.5 })), 'Mergulho');
  assert.equal(clipeDoCorpo(corpo({ levantando: true, velocidade: 2 })), 'Mergulho');
});

test('caido ganha do andar: o corpo no chao nao corre', () => {
  // A velocidade ainda esta alta no primeiro quadro depois de aterrissar.
  assert.equal(clipeDoCorpo(corpo({ levantando: true, velocidade: 6.5, anguloDoAndar: 1 })), 'Mergulho');
});

/**
 * A ORDEM entre mergulho, gesto, pulo e andar.
 *
 * E' onde a escolha deixa de ser obvia, e cada linha aqui e' um caso que
 * acontece de verdade num rally — os quatro podem valer no mesmo quadro.
 */
test('o gesto de toque ganha do pulo e do andar', () => {
  assert.equal(clipeDoCorpo(corpo({ gesto: 'cortada', noChao: false })), 'Cortada');
  assert.equal(clipeDoCorpo(corpo({ gesto: 'manchete', velocidade: 6.5 })), 'Manchete');
  assert.equal(clipeDoCorpo(corpo({ gesto: 'levantamento' })), 'Levantamento');
  assert.equal(clipeDoCorpo(corpo({ gesto: 'saque' })), 'Saque');
});

test('mergulhando, o mergulho ganha ate do gesto', () => {
  // Salvar de peixinho toca a bola no meio do voo: os dois gestos brigariam
  // pelo mesmo braco, e uma manchete de pe num corpo deitado enfia o braco na
  // areia.
  assert.equal(clipeDoCorpo(corpo({ gesto: 'manchete', mergulhando: true, noChao: false })), 'Mergulho');
});

/**
 * A batida de pe' e a cortada ja' foram o mesmo clipe, e a cortada saia de
 * perna reta no ar. Agora sao dois: o braco e' o mesmo gesto, a perna nao.
 */
test('a batida de pe e a cortada tem clipes proprios', () => {
  assert.equal(clipeDoCorpo(corpo({ gesto: 'ataque' })), 'Ataque');
  assert.equal(clipeDoCorpo(corpo({ gesto: 'cortada', noChao: false })), 'Cortada');
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
  return estadoDoMotor(m, corpo()).anguloDoAndar;
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

  assert.equal(clipeDoCorpo(estadoDoMotor(m, corpo())), 'Run_Right');
});

/**
 * O POUSO. Sem ele o `Pulo` ficava congelado de braco pro alto ate' o pe'
 * tocar a areia, e cortava seco pro `Idle`: o boneco pousava feito peca de
 * metal.
 */
test('quem acaba de cair de um salto amortece, a nao ser correndo', () => {
  assert.equal(clipeDoCorpo(corpo({ pousando: true })), 'Aterrissagem');
  assert.equal(clipeDoCorpo(corpo({ pousando: true, velocidade: 2 })), 'Aterrissagem');
  // Correndo, a corrida e' o amortecimento: agachar deslizaria pela areia.
  assert.equal(clipeDoCorpo(corpo({ pousando: true, velocidade: 6.5 })), 'Run');
  // O gesto continua na frente: a cortada comeca no ar e termina no chao.
  assert.equal(clipeDoCorpo(corpo({ pousando: true, gesto: 'cortada' })), 'Cortada');
});

test('o Motor marca o pouso de um salto, e so de um salto', () => {
  const m = motorParado();
  // Andar no chao nao e' pousar: o corpo "cai" 2 m/s por quadro no chao.
  m.moverPara(PRA_FRENTE);
  for (let i = 0; i < 30; i++) m.update(1 / 60);
  assert.equal(estadoDoMotor(m, corpo()).pousando, false, 'andando ja marcou pouso');

  m.moverPara(new THREE.Vector3());
  m.pular();
  let quadros = 0;
  do { m.update(1 / 60); quadros++; } while (!m.noChao && quadros < 200);
  assert.ok(m.noChao, 'nao voltou pro chao');
  assert.ok(Math.abs(m.ultimoVoo - quadros / 60) < 0.05, `voo de ${m.ultimoVoo.toFixed(2)} s, contado ${(quadros / 60).toFixed(2)}`);
  assert.equal(estadoDoMotor(m, corpo()).pousando, true, 'caiu do salto e nao amorteceu');

  for (let i = 0; i < 20; i++) m.update(1 / 60);
  assert.equal(estadoDoMotor(m, corpo()).pousando, false, 'o pouso nao acaba');
});

/**
 * A CAMADA da espera do saque: bracos por cima, pernas de baixo.
 *
 * O sacador anda pela linha de fundo escolhendo o lugar; um clipe de corpo
 * inteiro com a bola na mao faria ele deslizar de pe' parado.
 */
test('quem espera pra sacar segura a bola parado e andando, e larga pra bater', () => {
  assert.equal(camadaDoCorpo(corpo({ segurandoBola: true })), 'EsperaDoSaque');
  assert.equal(camadaDoCorpo(corpo({ segurandoBola: true, velocidade: 2 })), 'EsperaDoSaque');
  // As pernas continuam sendo do corpo.
  assert.equal(clipeDoCorpo(corpo({ segurandoBola: true })), 'Idle');
  assert.equal(clipeDoCorpo(corpo({ segurandoBola: true, velocidade: 2 })), 'Walk');

  assert.equal(camadaDoCorpo(corpo()), null);
  assert.equal(camadaDoCorpo(corpo({ segurandoBola: true, gesto: 'saque' })), null, 'bateu segurando');
  assert.equal(camadaDoCorpo(corpo({ segurandoBola: true, noChao: false })), null, 'pulou segurando');
});
