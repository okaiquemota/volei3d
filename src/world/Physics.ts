import * as THREE from 'three';
import { BALL, COURT, REDE, SURFACE } from '../config';
import { AABB } from '../core/math';
import type { Colisores } from './buildCourt';
import type { Court } from './Court';

/**
 * A fisica da bola. Escrita a mao, como todo o resto — e aqui o motivo e' mais
 * forte que "nao queremos dependencia":
 *
 * A IA PREVE onde a bola vai cair simulando a integracao. Se a previsao e a
 * simulacao nao forem literalmente a mesma funcao, com o mesmo passo, a IA
 * corre pro lugar errado e o jogo desmonta. Com o integrador aqui dentro, as
 * duas sao a mesma por construcao — e' `passoDaBola`, e nada mais mexe na bola.
 *
 * Por isso o passo e' FIXO (1/100 s, o mesmo do prototipo em Unity), e nao o dt
 * variavel que o rpk.fps usa: la' nada depende de prever o futuro.
 */

/** Passo fixo da simulacao. Mudar isto muda o comportamento da bola. */
export const PASSO = 1 / 100;

/** Teto de sub-passos por quadro. Se o navegador engasgar, a simulacao nao explode. */
export const MAX_SUBPASSOS = 5;

/** O que a bola acertou neste passo. */
export type TipoDeContato = 'chao' | 'fora' | 'rede' | 'poste';

/**
 * A bola dentro da malha: o unico estado que a rede guarda de um passo pro outro.
 *
 * Precisa existir porque a malha CEDE. Com a rede estufada, o centro da bola
 * pode estar do outro lado do plano da rede e ainda assim ser uma bola que veio
 * DESTE lado — e a mola tem que empurrar ela de volta pra ca', nao pra la'. O
 * lado e' decidido na entrada e vale ate' a bola sair.
 *
 * E' tambem o que o tecido le' pra se deformar: onde, e quanto.
 */
export interface ContatoNaRede {
  /** De que lado a bola entrou: +1 ou -1. Zero com a bola fora da malha. */
  lado: number;
  /** Quanto a bola afunda a malha agora, em metros. */
  afundamento: number;
  /** Onde, no plano da rede, em espaco local. */
  x: number;
  y: number;
  /**
   * A batida na fita desde a ultima leitura: a velocidade que a bola empurrou
   * a fita em z (com sinal), e onde. Fica a maior; quem le' (o tecido) zera.
   */
  batidaNaFita: number;
  xDaFita: number;
}

export function novoContatoNaRede(): ContatoNaRede {
  return { lado: 0, afundamento: 0, x: 0, y: 0, batidaNaFita: 0, xDaFita: 0 };
}

// Rascunhos no escopo do modulo: nada e' alocado dentro do laco de fisica.
const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _ponto = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tangencial = new THREE.Vector3();
const _antes = new THREE.Vector3();
const _sub = new THREE.Vector3();

/**
 * Um passo da bola, sem colisao.
 *
 * E' a UNICA verdade sobre movimento da bola, e e' a mesma funcao usada pela
 * previsao de queda (ballistics.preverQueda). Mudar uma sem a outra quebra a
 * IA de um jeito que nao aparece em teste de tipo nenhum.
 *
 * A ordem importa e espelha o PhysX: acelera, aplica arrasto, entao desloca.
 */
export function passoDaBola(pos: THREE.Vector3, vel: THREE.Vector3, dt: number): void {
  vel.y -= BALL.gravity * dt;
  vel.multiplyScalar(1 - BALL.damping * dt);

  const v2 = vel.lengthSq();
  if (v2 > BALL.maxSpeed * BALL.maxSpeed) vel.setLength(BALL.maxSpeed);

  pos.addScaledVector(vel, dt);
}

/**
 * Reflete a velocidade numa superficie.
 *
 * `restituicao` devolve energia na NORMAL; `tangencial` e' o quanto sobra do
 * deslizamento. Os dois numeros ja' vem combinados no config — no Unity eles
 * saiam do cruzamento de dois materiais de fisica, com uma regra de
 * precedencia que nao ajuda ninguem a entender por que a rede mata a bola.
 */
function refletir(vel: THREE.Vector3, normal: THREE.Vector3, restituicao: number, tangencial: number): void {
  const vn = vel.dot(normal);
  if (vn >= 0) return; // ja' esta' saindo: nao refletir de novo

  _tangencial.copy(vel).addScaledVector(normal, -vn);
  vel.copy(_tangencial).multiplyScalar(tangencial).addScaledVector(normal, -vn * restituicao);
}

/**
 * Avanca a bola um passo e resolve as colisoes.
 *
 * Trabalha em espaco LOCAL da quadra: a rede e' um par de AABBs e os postes sao
 * cilindros verticais, todos definidos ali. Girar a quadra nao recalcula
 * colisor nenhum — a bola so' entra e sai do espaco local.
 *
 * Devolve o que foi atingido, ou null. O ponto de contato sai em `contatoOut`,
 * em espaco de MUNDO, porque quem consome (o Match) raciocina em mundo.
 */
export function simularBola(
  posMundo: THREE.Vector3,
  velMundo: THREE.Vector3,
  court: Court,
  colisores: Colisores,
  dt: number,
  contatoOut: THREE.Vector3,
  rede: ContatoNaRede = novoContatoNaRede(),
): TipoDeContato | null {
  // Onde a bola estava ANTES do passo: e' do lado dela que a bola entra na
  // malha, e e' dali que a varredura contra a rede parte.
  court.paraLocal(posMundo, _antes);

  passoDaBola(posMundo, velMundo, dt);

  // Daqui pra baixo, tudo em espaco local da quadra.
  const pos = court.paraLocal(posMundo, _pos);
  const vel = _vel.copy(velMundo).applyQuaternion(court.quaternionInv);

  let contato: TipoDeContato | null = null;

  // ---------------------------------------------------------------- chao
  if (pos.y - BALL.radius <= 0 && vel.y < 0) {
    pos.y = BALL.radius;

    // Dentro das linhas ou nao muda a superficie e, principalmente, muda quem
    // ganha o ponto — mas quem decide isso e' o Match; aqui so' se informa.
    const dentro = Math.abs(pos.x) <= court.halfWidth && Math.abs(pos.z) <= court.halfLength;
    const s = dentro ? SURFACE.sand : SURFACE.out;

    _normal.set(0, 1, 0);
    refletir(vel, _normal, s.restitution, s.tangential);

    contato = dentro ? 'chao' : 'fora';
    contatoOut.copy(pos);
  }

  // ----------------------------------------------------- rede: fita e malha
  if (!contato) {
    const naRede = resolverRede(pos, vel, _antes, rede, dt);
    if (naRede) {
      contato = 'rede';
      contatoOut.copy(pos);
    }
  }

  // --------------------------------------- a saia invisivel, embaixo da malha
  // Com a bola dentro da malha, quem manda e' a mola: a saia encostada na
  // borda de baixo so' atrapalharia, empurrando pra cima uma bola afundada.
  if (!contato && rede.lado === 0) {
    for (const caixa of colisores.rede) {
      if (resolverCaixa(pos, vel, caixa, SURFACE.net.restitution, SURFACE.net.tangential)) {
        contato = 'rede';
        contatoOut.copy(pos);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- postes
  if (!contato) {
    for (const poste of colisores.postes) {
      if (resolverPoste(pos, vel, poste)) {
        contato = 'poste';
        contatoOut.copy(pos);
        break;
      }
    }
  }

  // Volta pro mundo.
  court.paraMundo(pos, posMundo);
  velMundo.copy(vel).applyQuaternion(court.quaternion);

  if (contato) court.paraMundo(contatoOut, contatoOut);
  return contato;
}

/**
 * A bola contra a fita e a malha. Devolve true no passo em que ha' um TOQUE
 * novo: batida na fita, ou a entrada na malha.
 *
 * A FITA e' um cilindro deitado no topo, e vale pra bola cujo centro esta'
 * acima do eixo dela: a normal sai do eixo pro centro da bola, entao uma bola
 * que desce raspando quica pra cima, e uma que chega de lado volta de lado.
 *
 * A MALHA e' uma mola com freio contra o plano z = 0. A bola entra, afunda
 * `p` metros, e a malha acelera ela de volta com `rigidez * p`, freando pela
 * velocidade. Nao e' reflexao: sao varios passos de contato, e e' isso que da'
 * o afundar-segurar-soltar de uma rede de pano. O deslize ao longo da malha
 * perde velocidade pelo atrito, que e' a rede agarrando a bola.
 */
function resolverRede(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  antes: THREE.Vector3,
  rede: ContatoNaRede,
  dt: number,
): boolean {
  const r = BALL.radius;
  const yDaFita = COURT.netHeight - REDE.fita.raio;
  const base = COURT.netHeight - COURT.netDepth;
  const zAntes = antes.z;

  /**
   * Bola rapida: acha o PRIMEIRO ponto do passo em que ela encosta na rede.
   *
   * A 34 m/s (o teto da bola) ela anda 34 cm por passo — mais que o proprio
   * diametro — e saltava de um lado do plano ao outro sem nunca "estar"
   * encostada na malha: atravessava a rede, medido, e a caixa antiga tinha o
   * mesmo furo. Quando o passo anda mais que um raio em z, ele e' refeito em
   * oito pedacos, e a bola para no primeiro que encosta. O resto do passo se
   * perde — um centesimo de segundo, que ninguem ve'.
   */
  if (rede.lado === 0 && Math.abs(pos.z - zAntes) > r) {
    for (let k = 1; k <= 8; k++) {
      _sub.lerpVectors(antes, pos, k / 8);
      if (encostaNaRede(_sub, yDaFita, base)) {
        pos.copy(_sub);
        break;
      }
    }
  }

  const naLargura = Math.abs(pos.x) <= REDE.meiaLargura;

  // ---------------------------------------------------------------- a fita
  if (naLargura && pos.y >= yDaFita && rede.lado === 0) {
    const dy = pos.y - yDaFita;
    const dz = pos.z;
    const distancia = Math.hypot(dy, dz);
    const limite = r + REDE.fita.raio;
    if (distancia < limite) {
      if (distancia < 1e-6) _normal.set(0, 1, 0);
      else _normal.set(0, dy / distancia, dz / distancia);

      const chegada = -vel.dot(_normal);
      const sentido = vel.z !== 0 ? Math.sign(vel.z) : -Math.sign(_normal.z);
      pos.y = yDaFita + _normal.y * limite;
      pos.z = _normal.z * limite;
      refletir(vel, _normal, REDE.fita.restituicao, REDE.fita.tangencial);

      /**
       * A fita vai no sentido em que a bola VIAJAVA, com a forca da batida.
       *
       * Pela normal, a bola que cai quase de cima (o "bola na fita" classico)
       * mal tirava a fita do plano: a batida e' pra baixo, e o pano so' se mexe
       * pra frente e pra tras. Medido, 2 mm — uma batida na fita que ninguem
       * via. Na rede de verdade ela treme inteira.
       */
      const empurrao = sentido * Math.max(0, chegada);
      if (Math.abs(empurrao) > Math.abs(rede.batidaNaFita)) {
        rede.batidaNaFita = empurrao;
        rede.xDaFita = pos.x;
      }
      return chegada > 0;
    }
    return false;
  }

  // ---------------------------------------------------------------- a malha
  /**
   * Ja' dentro, a bola continua presa a' mola mesmo abaixo da borda de baixo:
   * a barriga da rede desce junto com ela. Solta-la ali, com o centro do lado
   * de la' do plano, seria deixar a bola passar por baixo da rede.
   */
  const dentroDaFaixa = naLargura && pos.y < yDaFita
    && pos.y >= (rede.lado === 0 ? base : base - REDE.afundamentoMaximo);

  if (!dentroDaFaixa) {
    rede.lado = 0;
    rede.afundamento = 0;
    return false;
  }

  let entrou = false;
  if (rede.lado === 0) {
    if (Math.abs(pos.z) >= r) return false;
    rede.lado = zAntes < 0 ? -1 : 1;
    entrou = true;
  }

  const lado = rede.lado;
  const distancia = lado * pos.z;
  if (distancia >= r) {
    // Saiu pelo proprio lado: a malha soltou a bola.
    rede.lado = 0;
    rede.afundamento = 0;
    return false;
  }

  const afundamento = r - distancia;
  const voltando = lado * vel.z;
  vel.z += lado * (REDE.rigidez * afundamento - REDE.amortecimento * voltando) * dt;

  const agarra = Math.max(0, 1 - REDE.atrito * dt);
  vel.x *= agarra;
  vel.y *= Math.max(0, 1 - REDE.atrito * 0.5 * dt);

  // O fundo da barriga: dali a malha nao cede mais.
  if (afundamento > REDE.afundamentoMaximo) {
    pos.z = lado * (r - REDE.afundamentoMaximo);
    if (lado * vel.z < 0) vel.z = 0;
  }

  rede.afundamento = Math.min(afundamento, REDE.afundamentoMaximo);
  rede.x = pos.x;
  rede.y = pos.y;
  return entrou;
}

/** Esta posicao do centro encosta na fita, na malha ou na saia? So' pra varredura. */
function encostaNaRede(p: THREE.Vector3, yDaFita: number, base: number): boolean {
  if (Math.abs(p.x) > REDE.meiaLargura) return false;
  if (p.y >= yDaFita) return Math.hypot(p.y - yDaFita, p.z) < BALL.radius + REDE.fita.raio;
  if (p.y >= base) return Math.abs(p.z) < BALL.radius;
  return p.y >= 0 && Math.abs(p.z) < BALL.radius + COURT.netThickness / 2;
}

/** Esfera x AABB: o ponto mais proximo da caixa da a normal e a penetracao. */
function resolverCaixa(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  caixa: AABB,
  restituicao: number,
  tangencial: number,
): boolean {
  const proximo = caixa.closestPoint(pos, _ponto);
  const distancia = _normal.subVectors(pos, proximo).length();

  if (distancia > BALL.radius) return false;

  if (distancia < 1e-5) {
    // Centro dentro da caixa: empurra pelo eixo de menor saida. Acontece com
    // bola rapida atravessando a rede fina num passo.
    const saidaX = Math.min(Math.abs(pos.x - caixa.min.x), Math.abs(caixa.max.x - pos.x));
    const saidaY = Math.min(Math.abs(pos.y - caixa.min.y), Math.abs(caixa.max.y - pos.y));
    const saidaZ = Math.min(Math.abs(pos.z - caixa.min.z), Math.abs(caixa.max.z - pos.z));
    if (saidaZ <= saidaX && saidaZ <= saidaY) _normal.set(0, 0, Math.sign(vel.z) || 1).negate();
    else if (saidaX <= saidaY) _normal.set(Math.sign(vel.x) || 1, 0, 0).negate();
    else _normal.set(0, Math.sign(vel.y) || 1, 0).negate();
  } else {
    _normal.divideScalar(distancia);
  }

  pos.copy(proximo).addScaledVector(_normal, BALL.radius);
  refletir(vel, _normal, restituicao, tangencial);
  return true;
}

/** Esfera x cilindro vertical. So' o costado importa: ninguem acerta o topo do poste. */
function resolverPoste(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  poste: { x: number; raio: number; altura: number },
): boolean {
  if (pos.y < 0 || pos.y > poste.altura) return false;

  const dx = pos.x - poste.x;
  const dz = pos.z;
  const distancia = Math.hypot(dx, dz);
  const limite = poste.raio + BALL.radius;
  if (distancia > limite) return false;

  if (distancia < 1e-5) {
    _normal.set(1, 0, 0);
  } else {
    _normal.set(dx / distancia, 0, dz / distancia);
  }

  pos.x = poste.x + _normal.x * limite;
  pos.z = _normal.z * limite;
  refletir(vel, _normal, SURFACE.post.restitution, SURFACE.post.tangential);
  return true;
}
