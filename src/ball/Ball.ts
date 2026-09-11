import * as THREE from 'three';
import { BALL } from '../config';
import { preverQueda } from '../core/ballistics';
import { MAX_SUBPASSOS, PASSO, simularBola, type TipoDeContato } from '../world/Physics';
import type { Colisores } from '../world/buildCourt';
import type { Court, Side } from '../world/Court';
import { criarBola } from '../world/textures';

const _contato = new THREE.Vector3();
const _eixo = new THREE.Vector3();

/** Quem tocou por ultimo. O Match usa isso pra decidir de quem e' o ponto. */
export interface Tocador {
  readonly side: Side;
}

export type AoTocarOChao = (tipo: 'chao' | 'fora', ponto: THREE.Vector3) => void;
export type AoTocarARede = () => void;

/**
 * A bola.
 *
 * Ela nao conhece regra nenhuma: so' avisa "bati no chao aqui", "bati na rede".
 * Quem interpreta e' o Match. E' a mesma separacao do prototipo, e e' o que
 * deixa a bola reutilizavel em qualquer quadra.
 *
 * O acumulador de passo fixo vive aqui. O resto do jogo roda em dt variavel
 * (como no rpk.fps); so' a bola precisa de passo fixo, porque so' ela e'
 * prevista.
 */
export class Ball {
  readonly mesh: THREE.Mesh;
  readonly velocidade = new THREE.Vector3();

  /** Quando presa, a bola e' cinematica e segue a ancora (a mao do sacador). */
  private ancora: THREE.Object3D | null = null;

  private acumulador = 0;
  private dormindo = false;

  /** Ultimo agente que tocou. Null no saque, antes do primeiro toque. */
  ultimoTocador: Tocador | null = null;
  /** Segundos desde o ultimo toque. A IA usa pro tempo de reacao. */
  tempoDesdeOToque = 999;

  aoTocarOChao: AoTocarOChao | null = null;
  aoTocarARede: AoTocarARede | null = null;

  private readonly descartaveis: Array<{ dispose(): void }> = [];

  constructor(private court: Court, private colisores: Colisores) {
    const textura = criarBola();
    const geometria = new THREE.SphereGeometry(BALL.radius, 20, 14);
    const material = new THREE.MeshStandardMaterial({
      map: textura,
      roughness: 0.65,
      metalness: 0,
    });
    this.descartaveis.push(textura, geometria, material);

    this.mesh = new THREE.Mesh(geometria, material);
    this.mesh.castShadow = true;
  }

  get posicao(): THREE.Vector3 { return this.mesh.position; }
  get presa(): boolean { return this.ancora !== null; }

  /** Reposiciona e zera o movimento. */
  teleportar(posicao: THREE.Vector3): void {
    this.mesh.position.copy(posicao);
    this.velocidade.set(0, 0, 0);
    this.acumulador = 0;
    this.dormindo = false;
  }

  /** Prende a bola na mao do sacador. */
  prender(ancora: THREE.Object3D): void {
    this.ancora = ancora;
    this.velocidade.set(0, 0, 0);
    this.dormindo = false;
    this.esquecerToques();
  }

  soltar(): void {
    this.ancora = null;
  }

  esquecerToques(): void {
    this.ultimoTocador = null;
    this.tempoDesdeOToque = 999;
  }

  /**
   * Aplica um toque: define a velocidade e registra quem bateu.
   *
   * O spin e' so' visual. Nao ha' efeito Magnus — a trajetoria continua sendo
   * a parabola que os solvers resolveram, e e' isso que mantem o jogo legivel.
   */
  bater(velocidade: THREE.Vector3, por: Tocador | null): void {
    this.soltar();
    this.dormindo = false;
    this.velocidade.copy(velocidade);
    this.ultimoTocador = por;
    this.tempoDesdeOToque = 0;
  }

  update(dt: number): void {
    this.tempoDesdeOToque += dt;

    if (this.ancora) {
      this.ancora.getWorldPosition(this.mesh.position);
      return;
    }

    if (this.dormindo) return;

    // Passo fixo com acumulador. O teto de sub-passos evita a espiral da morte:
    // se um quadro demorou demais, perde-se tempo de jogo em vez de travar.
    this.acumulador = Math.min(this.acumulador + dt, PASSO * MAX_SUBPASSOS);

    while (this.acumulador >= PASSO) {
      this.acumulador -= PASSO;

      const contato = simularBola(
        this.mesh.position, this.velocidade, this.court, this.colisores, PASSO, _contato,
      );

      if (contato === 'chao' || contato === 'fora') {
        this.aoTocarOChao?.(contato, _contato);
      } else if (contato === 'rede' || contato === 'poste') {
        this.aoTocarARede?.();
      }

      // Dormir evita o tremor eterno na areia: sem isso a bola fica quicando
      // em micrometros pra sempre e o rally nunca "assenta".
      if (
        this.velocidade.lengthSq() < BALL.sleepSpeed * BALL.sleepSpeed &&
        this.mesh.position.y <= BALL.radius + 0.02
      ) {
        this.velocidade.set(0, 0, 0);
        this.dormindo = true;
        break;
      }
    }

    this.girar(dt);
  }

  /** Giro visual, perpendicular ao movimento. E' o que deixa o toque legivel. */
  private girar(dt: number): void {
    const plana = _eixo.set(this.velocidade.x, 0, this.velocidade.z);
    if (plana.lengthSq() < 1e-4) return;

    plana.normalize().cross(THREE.Object3D.DEFAULT_UP).negate();
    this.mesh.rotateOnWorldAxis(plana, BALL.visualSpin * dt);
  }

  /** Onde a bola vai cruzar a altura `alvoY` descendo, e em quanto tempo. */
  preverPouso(alvoY: number, out: THREE.Vector3): number {
    return preverQueda(this.mesh.position, this.velocidade, alvoY, out);
  }

  dispose(): void {
    for (const d of this.descartaveis) d.dispose();
  }
}

export type { TipoDeContato };
