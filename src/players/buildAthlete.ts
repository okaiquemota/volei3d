import * as THREE from 'three';
import { ATLETA } from '../config';

/**
 * O corpo do atleta.
 *
 * A primeira versao era o que o prototipo tinha: uma capsula, uma esfera, dois
 * tocos de braco e uma caixinha branca marcando a frente. Funcionava como
 * marcador de posicao e nao como pessoa — e num jogo em terceira pessoa o
 * atleta e' a coisa que se olha o tempo todo.
 *
 * Continua low-poly e continua sem modelo nem esqueleto. O que mudou:
 *
 * - PERNAS. Sem elas nao ha' silhueta humana, e sem silhueta nao ha' leitura
 *   de pra onde o corpo aponta;
 * - regata e calcao em tons diferentes, com pele nos bracos, nas pernas e na
 *   cabeca. Tres materiais em vez de um resolvem o "boneco pintado de azul";
 * - articulacoes de VERDADE: ombro e quadril sao pivos, e a animacao gira os
 *   pivos. Sem isso um braco balancando vira um toco deslizando.
 *
 * A animacao e' procedural, tocada pela velocidade do motor — nao ha' clipe
 * nem tempo de carregamento. Correr balanca perna e braco em oposicao, pular
 * estica os bracos pra cima, parado respira.
 */

export interface AtletaVisual {
  root: THREE.Group;
  /** Ancora onde a bola fica presa no saque. Acompanha o corpo. */
  ancoraDeSaque: THREE.Object3D;
  /**
   * @param velocidade modulo da velocidade horizontal, em m/s
   * @param noChao     se falso, o corpo entra em pose de salto
   * @param bracosAcima 0 a 1: quanto os bracos sobem (toque, cortada)
   */
  animar(dt: number, velocidade: number, noChao: boolean, bracosAcima: number): void;
  dispose(): void;
}

interface Geometrias {
  cabeca: THREE.SphereGeometry;
  cabelo: THREE.SphereGeometry;
  tronco: THREE.CapsuleGeometry;
  quadril: THREE.CapsuleGeometry;
  braco: THREE.CapsuleGeometry;
  perna: THREE.CapsuleGeometry;
  pe: THREE.BoxGeometry;
}

let geometrias: Geometrias | null = null;

function garantirGeometrias(): Geometrias {
  if (geometrias) return geometrias;

  const { ombroY, quadrilY, bracoComprimento, pernaComprimento } = ATLETA;
  geometrias = {
    cabeca: new THREE.SphereGeometry(0.125, 14, 12),
    // Calota de cabelo: cobre o topo e a nuca, e deixa o rosto de fora.
    cabelo: new THREE.SphereGeometry(0.133, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    tronco: new THREE.CapsuleGeometry(0.155, ombroY - quadrilY - 0.06, 4, 12),
    quadril: new THREE.CapsuleGeometry(0.165, 0.1, 3, 10),
    braco: new THREE.CapsuleGeometry(0.052, bracoComprimento - 0.104, 3, 8),
    perna: new THREE.CapsuleGeometry(0.075, pernaComprimento - 0.15, 3, 8),
    pe: new THREE.BoxGeometry(0.11, 0.06, 0.24),
  };
  return geometrias;
}

/** Libera as geometrias compartilhadas. So' no fim do jogo. */
export function descartarGeometriasDeAtleta(): void {
  if (!geometrias) return;
  for (const g of Object.values(geometrias)) g.dispose();
  geometrias = null;
}

/**
 * Pendura um membro num pivo.
 *
 * O pivo fica na ARTICULACAO e o membro desce a partir dele, entao girar o
 * pivo faz o membro girar em volta do ombro ou do quadril — que e' como um
 * corpo se move. Com o mesh centrado no pivo, girar faria o membro atravessar
 * o tronco.
 */
function pendurar(
  geometria: THREE.BufferGeometry,
  material: THREE.Material,
  comprimento: number,
  pai: THREE.Object3D,
  x: number,
  y: number,
  z = 0,
): THREE.Object3D {
  const pivo = new THREE.Object3D();
  pivo.position.set(x, y, z);
  pai.add(pivo);

  const mesh = new THREE.Mesh(geometria, material);
  mesh.position.y = -comprimento / 2;
  mesh.castShadow = true;
  pivo.add(mesh);

  return pivo;
}

export function construirAtleta(cor: number, alturaDaBolaNoSaque: number): AtletaVisual {
  const g = garantirGeometrias();
  const root = new THREE.Group();

  const regata = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, metalness: 0 });
  // Calcao mais escuro que a regata: e' o que separa tronco de pernas de longe.
  const calcao = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cor).multiplyScalar(0.55),
    roughness: 0.85,
    metalness: 0,
  });
  const pele = new THREE.MeshStandardMaterial({ color: ATLETA.pele, roughness: 0.72, metalness: 0 });
  const cabelo = new THREE.MeshStandardMaterial({ color: ATLETA.cabelo, roughness: 0.9, metalness: 0 });

  const { ombroY, quadrilY, ombroX, quadrilX, bracoComprimento, pernaComprimento } = ATLETA;

  // ---------------------------------------------------------------- tronco
  const meioDoTronco = (ombroY + quadrilY) / 2;
  const tronco = new THREE.Mesh(g.tronco, regata);
  tronco.position.y = meioDoTronco;
  tronco.castShadow = true;
  root.add(tronco);

  const quadril = new THREE.Mesh(g.quadril, calcao);
  quadril.position.y = quadrilY;
  quadril.castShadow = true;
  root.add(quadril);

  // ---------------------------------------------------------------- cabeca
  const pescoco = new THREE.Object3D();
  pescoco.position.y = ombroY + 0.13;
  root.add(pescoco);

  const cabeca = new THREE.Mesh(g.cabeca, pele);
  cabeca.castShadow = true;
  pescoco.add(cabeca);

  const franja = new THREE.Mesh(g.cabelo, cabelo);
  /**
   * O cabelo inclina pra tras e recua um fio.
   *
   * E' o que deixa o ROSTO de fora da calota — e o rosto e' a unica coisa que
   * diz pra onde a cabeca esta' virada quando o atleta tem 60 pixels de altura
   * na tela. Calota reta cobre a testa e o atleta fica sem frente.
   */
  franja.position.z = -0.022;
  franja.rotation.x = -0.32;
  franja.castShadow = true;
  pescoco.add(franja);

  // ---------------------------------------------------------------- membros
  const bracoEsq = pendurar(g.braco, pele, bracoComprimento, root, -ombroX, ombroY);
  const bracoDir = pendurar(g.braco, pele, bracoComprimento, root, ombroX, ombroY);
  const pernaEsq = pendurar(g.perna, pele, pernaComprimento, root, -quadrilX, quadrilY);
  const pernaDir = pendurar(g.perna, pele, pernaComprimento, root, quadrilX, quadrilY);

  for (const perna of [pernaEsq, pernaDir]) {
    const pe = new THREE.Mesh(g.pe, calcao);
    pe.position.set(0, -pernaComprimento + 0.03, 0.06);
    pe.castShadow = true;
    perna.add(pe);
  }

  // A bola do saque fica a' frente do corpo, na altura da mao.
  const ancoraDeSaque = new THREE.Object3D();
  ancoraDeSaque.position.set(0, alturaDaBolaNoSaque, 0.55);
  root.add(ancoraDeSaque);

  // ---------------------------------------------------------------- animacao
  let fase = 0;
  let subidaDosBracos = 0;

  const animar = (dt: number, velocidade: number, noChao: boolean, bracosAcima: number): void => {
    // A fase da passada anda com a VELOCIDADE, nao com o relogio: parar para a
    // perna no lugar em vez de deixar o boneco pedalando no ar.
    fase += velocidade * dt * ATLETA.passadasPorMetro;

    const corrida = Math.min(velocidade / ATLETA.moveSpeed, 1);
    const balanco = Math.sin(fase) * ATLETA.amplitudeDaPassada * corrida;

    // Os bracos sobem suave: um toque nao pode teletransportar o braco.
    subidaDosBracos += (bracosAcima - subidaDosBracos) * Math.min(1, dt * 14);

    if (noChao) {
      pernaEsq.rotation.x = balanco;
      pernaDir.rotation.x = -balanco;
      // Braco em OPOSICAO a' perna do mesmo lado — e' o que faz uma corrida
      // parecer corrida e nao marcha.
      bracoEsq.rotation.x = -balanco * 0.7;
      bracoDir.rotation.x = balanco * 0.7;
    } else {
      // No ar: pernas recolhidas e juntas.
      pernaEsq.rotation.x = -0.35;
      pernaDir.rotation.x = -0.2;
      bracoEsq.rotation.x = 0;
      bracoDir.rotation.x = 0;
    }

    // Bracos pra cima giram pra TRAS (x negativo) ate' quase a vertical.
    const levantar = -subidaDosBracos * 2.7;
    bracoEsq.rotation.x += levantar;
    bracoDir.rotation.x += levantar;
    // Abrem um pouco pros lados, senao os dois bracos viram um so'.
    bracoEsq.rotation.z = subidaDosBracos * 0.22;
    bracoDir.rotation.z = -subidaDosBracos * 0.22;

    // Respiracao parado, inclinacao pra frente correndo: o corpo lidera o passo.
    tronco.rotation.x = corrida * 0.17;
    pescoco.position.y = ombroY + 0.13 - corrida * 0.02;
    root.position.y = 0;
  };

  return {
    root,
    ancoraDeSaque,
    animar,
    dispose: () => {
      regata.dispose();
      calcao.dispose();
      pele.dispose();
      cabelo.dispose();
    },
  };
}
