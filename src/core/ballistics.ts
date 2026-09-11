import * as THREE from 'three';
import { BALL } from '../config';
import { PASSO, passoDaBola } from '../world/Physics';
import { clamp01 } from './math';

/**
 * Matematica de trajetoria: usada pelo toque do jogador, pelo saque e pela IA.
 *
 * Nao conhece quadra nem cena — recebe tudo por parametro. E' logica pura, e
 * por isso e' a parte do jogo que da' pra testar sem navegador.
 *
 * Dois solvers, porque sao dois problemas diferentes:
 *
 * - passe, levantamento e saque sao definidos pelo APICE: o que importa e' a
 *   bola subir o bastante pra dar tempo de alguem chegar embaixo dela;
 * - a cortada e' definida pelo TEMPO de voo: o que importa e' a bola chegar
 *   rapido, e a altura e' consequencia.
 */

/** Folga minima do apice sobre os dois extremos. Sem ela nao existe parabola. */
const MARGEM_APICE = 0.15;

const _horizontal = new THREE.Vector3();
const _simPos = new THREE.Vector3();
const _simVel = new THREE.Vector3();
const _anterior = new THREE.Vector3();
const _pouso = new THREE.Vector3();
const _erro = new THREE.Vector3();
const _mira = new THREE.Vector3();

/**
 * Velocidade pra sair de `de`, atingir o apice em `apiceY` e cair em `para`.
 *
 * Devolve false quando nao existe parabola — alvo acima do apice pedido, por
 * exemplo. O chamador decide o que fazer; aqui nao se inventa uma solucao.
 */
export function arcoPorApice(
  de: THREE.Vector3,
  para: THREE.Vector3,
  apiceY: number,
  out: THREE.Vector3,
): boolean {
  const g = BALL.gravity;

  // O apice precisa estar acima dos DOIS extremos, senao nao ha' parabola.
  const minimo = Math.max(de.y, para.y) + MARGEM_APICE;
  const apice = Math.max(apiceY, minimo);

  const subida = apice - de.y;
  const queda = apice - para.y;
  if (subida <= 0 || queda < 0) return false;

  const velocidadeVertical = Math.sqrt(2 * g * subida);
  const tempo = velocidadeVertical / g + Math.sqrt((2 * queda) / g);
  if (tempo <= 1e-4) return false;

  _horizontal.subVectors(para, de);
  _horizontal.y = 0;

  out.copy(_horizontal).divideScalar(tempo);
  out.y = velocidadeVertical;
  return true;
}

/** Velocidade pra sair de `de` e chegar em `para` em exatamente `tempo` segundos. */
export function arcoPorTempo(
  de: THREE.Vector3,
  para: THREE.Vector3,
  tempo: number,
  out: THREE.Vector3,
): boolean {
  if (tempo <= 1e-4) return false;

  out.subVectors(para, de).divideScalar(tempo);
  out.y += 0.5 * BALL.gravity * tempo;
  return true;
}

/**
 * Onde a bola cruza a altura `alvoY` descendo, e em quanto tempo.
 *
 * Integra com `passoDaBola` — a MESMA funcao da simulacao, com o MESMO passo.
 * E' isso que faz a IA correr pro lugar certo. No prototipo em Unity a previsao
 * usava passo de 0,02 s enquanto a fisica rodava a 0,01: a IA mirava um ponto
 * que a bola nao visitava.
 *
 * Nao ha' colisao aqui de proposito: e' uma previsao de voo livre. Bola que
 * bate na rede no caminho e' um caso que a IA descobre quando acontece.
 */
export function preverQueda(
  posicao: THREE.Vector3,
  velocidade: THREE.Vector3,
  alvoY: number,
  out: THREE.Vector3,
  tempoMaximo = 8,
): number {
  _simPos.copy(posicao);
  _simVel.copy(velocidade);

  let decorrido = 0;
  while (decorrido < tempoMaximo) {
    // `_anterior`, e nao `out`: o chamador pode passar o mesmo vetor que este
    // modulo usa de rascunho, e a interpolacao leria lixo.
    _anterior.copy(_simPos);
    passoDaBola(_simPos, _simVel, PASSO);

    if (_simPos.y <= alvoY && _simVel.y < 0) {
      // Interpolacao no ultimo passo pra nao "pular" o alvo.
      const vao = _anterior.y - _simPos.y;
      const t = vao > 1e-5 ? clamp01((_anterior.y - alvoY) / vao) : 0;
      out.lerpVectors(_anterior, _simPos, t);
      out.y = alvoY;
      return decorrido + PASSO * t;
    }

    decorrido += PASSO;
  }

  out.copy(_simPos);
  out.y = alvoY;
  return tempoMaximo;
}

/**
 * Altura da trajetoria quando ela cruza o plano da rede.
 *
 * Recebe posicao e velocidade em espaco LOCAL da quadra, onde a rede e'
 * simplesmente z = 0 — o tempo ate' cruzar sai de uma divisao. Misturar mundo
 * e local aqui daria certo enquanto a quadra estivesse na origem e quebraria
 * no dia em que houvesse duas.
 *
 * Analitico de proposito, sem arrasto: e' um teste feito ate' oito vezes por
 * toque, e o erro do arrasto em 8 m de voo e' menor que a folga de 0,35 m que
 * se exige sobre a fita.
 *
 * Devolve NaN quando a trajetoria nao cruza o plano indo pra frente — o que
 * significa "nao precisa passar por cima de nada".
 */
export function alturaAoCruzarRede(posLocal: THREE.Vector3, velLocal: THREE.Vector3): number {
  if (Math.abs(velLocal.z) < 1e-6) return NaN;

  const tempo = -posLocal.z / velLocal.z;
  if (tempo <= 0) return NaN;

  return posLocal.y + velLocal.y * tempo - 0.5 * BALL.gravity * tempo * tempo;
}

/**
 * Corrige o alvo pelo erro que o arrasto introduz.
 *
 * Os dois solvers sao resolvidos no vacuo. Com arrasto a bola cai antes, entao
 * simula-se a queda, mede-se o erro no chao e empurra-se o ponto de mira por
 * ele. Duas passadas bastam: a terceira muda menos de um centimetro.
 *
 * Devolve false quando o erro e' grande demais pra convergir — normalmente um
 * alvo absurdo, e nesse caso e' melhor nao tocar na bola do que mandar pro
 * espaco.
 */
export function corrigirArrasto(
  de: THREE.Vector3,
  alvo: THREE.Vector3,
  velocidade: THREE.Vector3,
  resolver: (de: THREE.Vector3, para: THREE.Vector3, out: THREE.Vector3) => boolean,
  passadas = 2,
): boolean {
  _mira.copy(alvo);

  for (let i = 0; i <= passadas; i++) {
    if (!resolver(de, _mira, velocidade)) return false;
    if (i === passadas) break;

    preverQueda(de, velocidade, alvo.y, _pouso);
    _erro.subVectors(alvo, _pouso);
    _erro.y = 0;

    if (_erro.lengthSq() > 400) return false;
    _mira.add(_erro);
  }

  return true;
}
