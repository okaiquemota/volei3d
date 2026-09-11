import * as THREE from 'three';
import { COLORS } from '../config';
import { clamp01 } from '../core/math';

/**
 * Os dois marcadores no chao.
 *
 * O prototipo em Unity prometia isto e nunca entregou: `PlayerController` tinha
 * um `AimPoint` publico com o comentario "o HUD desenha o marcador ai", e o HUD
 * nao desenhava nada. Aqui a falta pesa mais ainda, porque a camera enxerga o
 * campo adversario bem comprimido — mirar num ponto que quase nao se ve' e'
 * chute.
 *
 * Sao dois, e dizem coisas diferentes:
 *
 *   QUEDA (branco)  onde a bola VAI cair. E' previsao, nao intencao.
 *   MIRA  (azul)    pra onde o SEU ataque vai. E' intencao, nao previsao.
 *
 * O anel da queda aperta conforme a bola chega: alem de mostrar ONDE, mostra
 * QUANDO, que e' metade da decisao de sair correndo ou esperar.
 *
 * Vivem no chao (Y quase zero) em vez de flutuar na altura da bola porque o que
 * se precisa saber e' o ponto do CHAO — a bola a gente ja' ve'.
 */

/** Altura sobre a areia. Pouco, mas o bastante pra nao brigar com o chao. */
const ALTURA = 0.02;

/** Acima deste tempo de voo o anel para de crescer. */
const TEMPO_CHEIO = 1.2;

/** Destino da cor do anel de mira com a carga cheia. */
const _branco = new THREE.Color(0xfff0c0);

export class Markers {
  readonly group = new THREE.Group();

  private queda: THREE.Group;
  private mira: THREE.Mesh;
  private readonly descartaveis: Array<{ dispose(): void }> = [];

  constructor() {
    this.queda = this.criarQueda();
    this.mira = this.criarMira();
    this.group.add(this.queda, this.mira);
  }

  private criarQueda(): THREE.Group {
    const grupo = new THREE.Group();

    const anel = new THREE.RingGeometry(0.34, 0.42, 28);
    const ponto = new THREE.CircleGeometry(0.09, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      // Sem escrever profundidade o marcador nunca esconde a bola nem o atleta
      // que passar por cima dele.
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.descartaveis.push(anel, ponto, material);

    for (const geo of [anel, ponto]) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      grupo.add(mesh);
    }

    grupo.position.y = ALTURA;
    return grupo;
  }

  private criarMira(): THREE.Mesh {
    const geo = new THREE.RingGeometry(0.28, 0.34, 24);
    const material = new THREE.MeshBasicMaterial({
      color: COLORS.home,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.descartaveis.push(geo, material);

    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    // Um fio abaixo do de queda: quando os dois coincidem, o que manda e' o
    // branco, que e' o que de fato vai acontecer.
    mesh.position.y = ALTURA - 0.002;
    return mesh;
  }

  /**
   * @param tempoAteCair segundos ate' a bola tocar o chao. Aperta o anel.
   */
  mostrarQueda(ponto: THREE.Vector3, tempoAteCair: number): void {
    this.queda.visible = true;
    this.queda.position.set(ponto.x, ponto.y + ALTURA, ponto.z);

    // 1.8x quando a bola ainda esta' longe no tempo, 1x na hora de tocar.
    const escala = 1 + clamp01(tempoAteCair / TEMPO_CHEIO) * 0.8;
    this.queda.scale.setScalar(escala);
  }

  esconderQueda(): void {
    this.queda.visible = false;
  }

  /**
   * @param forca carga do ataque, de 0 a 1. O anel cresce e acende com ela —
   *   o jogador esta' olhando pro alvo, nao pra uma barra no canto da tela.
   */
  mostrarMira(ponto: THREE.Vector3, forca = 0): void {
    this.mira.visible = true;
    this.mira.position.set(ponto.x, ponto.y + ALTURA - 0.002, ponto.z);
    this.mira.scale.setScalar(1 + forca * 0.45);

    const material = this.mira.material as THREE.MeshBasicMaterial;
    material.opacity = 0.5 + forca * 0.45;
    // Do azul do time pro branco quente da carga cheia.
    material.color.setHex(COLORS.home).lerp(_branco, forca);
  }

  esconderMira(): void {
    this.mira.visible = false;
  }

  /** Deixa os dois visiveis pro aquecimento de shaders. */
  prepararAquecimento(): void {
    this.queda.visible = true;
    this.mira.visible = true;
  }

  dispose(): void {
    for (const d of this.descartaveis) d.dispose();
  }
}
