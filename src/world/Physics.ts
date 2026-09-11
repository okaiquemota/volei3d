import * as THREE from 'three';
import { BALL, SURFACE } from '../config';
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

// Rascunhos no escopo do modulo: nada e' alocado dentro do laco de fisica.
const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _ponto = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tangencial = new THREE.Vector3();

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
): TipoDeContato | null {
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

  // ---------------------------------------------------------------- rede
  if (!contato) {
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
