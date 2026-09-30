import * as THREE from 'three';
import { clamp, damp, dampFactor } from '../core/math';

/**
 * A CABECA acompanha a bola, por cima do clipe.
 *
 * Nenhum clipe sabe onde a bola esta': o do pack olha pra frente, os escritos
 * a mao nem tocam a cabeca. E a bola e' a unica coisa que um jogador de volei
 * olha — um boneco que recebe a bola de lado com o rosto virado pra rede le'
 * como boneco. Entao, depois do mixer, pescoco e cabeca giram pro alvo.
 *
 * Tres cuidados, e cada um e' um defeito que aparece sem ele:
 *
 * - O giro e' dividido: parte no pescoco, o resto na cabeca. Tudo na cabeca
 *   quebra o pescoco nos giros grandes.
 * - Tem limite, contado da FRENTE DO CORPO: bola atras das costas nao vira a
 *   cabeca 180 graus, para no ombro.
 * - O mixer so' escreve osso que algum clipe ativo anima, e os clipes escritos
 *   a mao nao animam a cabeca. Sem devolver o osso ao valor do clipe ANTES do
 *   mixer (`antesDoClipe`), o giro deste quadro somaria com o do anterior, e a
 *   cabeca sairia rodando.
 */

/** Pro lado, no maximo, em rad: ~70 graus, o que o pescoco da' sem o tronco. */
const GIRO_MAXIMO = 1.2;
const ACIMA_MAXIMO = 0.9;
const ABAIXO_MAXIMO = 1.0;
/** A parte do giro que e' do pescoco; o resto e' da cabeca. */
const DO_PESCOCO = 0.4;
/** O quao rapido o olhar corre atras da bola. Alto: bola de volei e' rapida. */
const RAPIDEZ = 12;
/** O quao rapido o olhar liga e desliga. */
const RAPIDEZ_DO_PESO = 5;

/**
 * A direcao pro alvo, no espaco do corpo, dentro do que um pescoco alcanca.
 *
 * Espaco do corpo: frente +Z, cima +Y, esquerda +X. Devolve unitario.
 */
export function limitarOlhar(direcao: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const giro = clamp(Math.atan2(direcao.x, direcao.z), -GIRO_MAXIMO, GIRO_MAXIMO);
  const inclinacao = clamp(Math.atan2(direcao.y, Math.hypot(direcao.x, direcao.z)), -ABAIXO_MAXIMO, ACIMA_MAXIMO);
  const c = Math.cos(inclinacao);
  return out.set(Math.sin(giro) * c, Math.sin(inclinacao), Math.cos(giro) * c);
}

interface OssoDoOlhar {
  osso: THREE.Object3D;
  /** O que o clipe deixou neste quadro, antes do olhar. */
  base: THREE.Quaternion;
  /** Pra onde o rosto aponta, no espaco do osso. Medido no repouso. */
  frente: THREE.Vector3;
  /** Quanto do giro que falta este osso faz. */
  parte: number;
}

const _corpo = new THREE.Quaternion();
const _corpoInv = new THREE.Quaternion();
const _pai = new THREE.Quaternion();
const _mundo = new THREE.Quaternion();
const _delta = new THREE.Quaternion();
const _parcial = new THREE.Quaternion();
const _cabeca = new THREE.Vector3();
const _desejo = new THREE.Vector3();
const _agora = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Olhar {
  private readonly ossos: OssoDoOlhar[] = [];
  /** Pra onde o olhar aponta agora, no espaco do corpo. Amaciado. */
  private readonly direcao = new THREE.Vector3(0, 0, 1);
  private peso = 0;

  /**
   * `corpo` e' quem da' a frente — a raiz que o `Motor` gira, e nao o modelo.
   * `modelo` e' onde estao os ossos, e tem que estar em repouso agora.
   */
  constructor(private readonly corpo: THREE.Object3D, modelo: THREE.Object3D) {
    corpo.updateMatrixWorld(true);
    corpo.matrixWorld.decompose(_p, _corpo, _s);
    for (const [nome, parte] of [['Neck', DO_PESCOCO], ['Head', 1]] as const) {
      const osso = modelo.getObjectByName(nome);
      if (!osso?.parent) continue;
      osso.matrixWorld.decompose(_p, _mundo, _s);
      // A frente do corpo levada pro espaco do osso.
      const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(_corpo).applyQuaternion(_mundo.invert());
      this.ossos.push({ osso, base: osso.quaternion.clone(), frente, parte });
    }
  }

  /** Antes do mixer: devolve os ossos ao que o clipe deixou, sem o olhar. */
  antesDoClipe(): void {
    for (const o of this.ossos) o.osso.quaternion.copy(o.base);
  }

  /** Depois do mixer: guarda o que o clipe fez e vira pro alvo. `null` solta o olhar. */
  depoisDoClipe(alvo: THREE.Vector3 | null, dt: number): void {
    for (const o of this.ossos) o.base.copy(o.osso.quaternion);
    this.peso = damp(this.peso, alvo ? 1 : 0, RAPIDEZ_DO_PESO, dt);
    const cabeca = this.ossos[this.ossos.length - 1];
    if (!cabeca || this.peso < 1e-3) return;

    cabeca.osso.updateWorldMatrix(true, false);
    this.corpo.matrixWorld.decompose(_p, _corpo, _s);

    if (alvo) {
      _corpoInv.copy(_corpo).invert();
      _cabeca.setFromMatrixPosition(cabeca.osso.matrixWorld);
      limitarOlhar(_desejo.subVectors(alvo, _cabeca).applyQuaternion(_corpoInv), _desejo);
      this.direcao.lerp(_desejo, dampFactor(RAPIDEZ, dt)).normalize();
    }
    _desejo.copy(this.direcao).applyQuaternion(_corpo);

    for (const o of this.ossos) {
      o.osso.parent!.matrixWorld.decompose(_p, _pai, _s);
      _mundo.multiplyQuaternions(_pai, o.osso.quaternion);
      _agora.copy(o.frente).applyQuaternion(_mundo);
      _delta.setFromUnitVectors(_agora, _desejo);
      _parcial.identity().slerp(_delta, o.parte * this.peso);
      // Gira em MUNDO e volta pro espaco do pai: local = pai^-1 * mundo.
      o.osso.quaternion.copy(_pai.invert().multiply(_mundo.premultiply(_parcial)));
      // O proximo osso (a cabeca) le' este em mundo.
      o.osso.updateWorldMatrix(false, true);
    }
  }
}
