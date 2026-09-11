import * as THREE from 'three';
import { ATHLETE, COURT } from '../config';
import type { Input } from '../core/Input';
import { clamp } from '../core/math';
import type { Court } from '../world/Court';
import { LIMITE_DA_PRAIA } from '../world/praia';
import { construirAtleta, type AtletaVisual } from './buildAthlete';
import { Motor } from './Motor';
import { direcaoDoTeclado } from './controle';

const _direcao = new THREE.Vector3();

/**
 * Voce, fora da quadra.
 *
 * Nao e' um `Athlete`, e isso e' a decisao inteira. Athlete nasce amarrado a um
 * `Court` e a um `Side` — e' o que da' sentido a "minha meia quadra", "a rede
 * esta' nessa direcao", "o Match me chama pra sacar". Quem anda pela praia nao
 * tem lado nem quadra, e fazer o Athlete fingir que nao tem espalharia um `if`
 * por tudo: no limite de area, no saque, na mira, na escolha de acao.
 *
 * Entao sao dois corpos. Voce entra na quadra: o banhista some e um `Human`
 * ocupa o lado. Voce sai: o `Human` vira bot de novo e o banhista reaparece na
 * beira. O corte e' limpo porque `Arena.ocupar` e `Arena.liberar` ja' trocam
 * quem joga sem derrubar a partida.
 *
 * O que ele tem em comum com um atleta e' o que deve ter: o mesmo `Motor` (o
 * motor nunca soube o que e' quadra — recebe uma funcao de limite) e o mesmo
 * corpo low-poly.
 */
export class Banhista {
  readonly motor: Motor;
  readonly visual: AtletaVisual;

  camera: THREE.PerspectiveCamera | null = null;
  input: Input | null = null;

  /**
   * As quadras que ele nao pode atravessar.
   *
   * O Motor nunca soube o que e' quadra — recebe uma funcao de limite e
   * pergunta a cada quadro. Aqui essa funcao e' "a praia, menos as redes".
   */
  constructor(cor: number, quadras: readonly Court[] = []) {
    this.visual = construirAtleta(cor, COURT.serveBallHeight);

    this.motor = new Motor((posicao, out) => {
      out.set(
        clamp(posicao.x, -LIMITE_DA_PRAIA.x, LIMITE_DA_PRAIA.x),
        posicao.y,
        clamp(posicao.z, -LIMITE_DA_PRAIA.z, LIMITE_DA_PRAIA.z),
      );
      for (const quadra of quadras) quadra.desviarDaRede(out, ATHLETE.radius, out);
      return out;
    });
  }

  get objeto(): THREE.Object3D { return this.visual.root; }
  get posicao(): THREE.Vector3 { return this.motor.posicao; }

  /** Reaparece em algum lugar, olhando pra alguma direcao. */
  colocarEm(posicao: THREE.Vector3, olharPara: THREE.Vector3): void {
    this.motor.colocarEm(posicao, olharPara);
    this.visual.root.position.copy(this.motor.posicao);
  }

  update(dt: number): void {
    if (this.input) {
      direcaoDoTeclado(this.input, this.camera, _direcao);
      this.motor.moverPara(_direcao);

      // Aqui o corpo VIRA pra onde anda: nao ha' bola pra encarar, e um boneco
      // que anda de lado pela praia inteira parece quebrado.
      this.motor.encarar(_direcao);

      if (this.input.wasPressed('Space')) this.motor.pular();
    }

    this.motor.update(dt);
    this.visual.root.position.copy(this.motor.posicao);
    this.motor.aplicarRotacao(this.visual.root, dt);
  }

  dispose(): void {
    this.visual.dispose();
  }
}
