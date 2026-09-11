import * as THREE from 'three';
import { CAMERA } from '../config';
import { Court, sinalDe, type Side } from '../world/Court';
import { clamp, dampFactor } from './math';

const _alvoLocal = new THREE.Vector3();
const _desejada = new THREE.Vector3();
const _foco = new THREE.Vector3();
const _olhar = new THREE.Vector3();
const _matriz = new THREE.Matrix4();
const _lateral = new THREE.Vector3();

/**
 * O que a camera esta' fazendo. Sao tres enquadramentos diferentes, nao um com
 * variacoes:
 *
 *   jogo        atras do SEU atleta, presa a' quadra, com o foco puxando pra
 *               bola.
 *   assistindo  fora da quadra, mirando na rede. Nao ha' atleta pra seguir.
 *   passeio     atras de quem anda pela praia, sem quadra nenhuma.
 */
export type ModoDaCamera = 'jogo' | 'assistindo' | 'passeio';

/**
 * Camera em terceira pessoa.
 *
 * Jogando, ela fica atras do jogador EM RELACAO A' QUADRA, nao a' rotacao do
 * atleta. Parece detalhe e nao e': com a camera presa ao corpo, virar pra pegar
 * uma bola lateral gira o mundo inteiro, e a leitura do campo — onde esta' a
 * rede, onde esta' a linha de fundo — se perde a cada toque.
 *
 * Andando pela praia vale a mesma regra, por um motivo ainda mais duro: ela
 * mantem o rumo do MUNDO e so' acompanha a posicao. Camera presa ao corpo, com
 * movimento relativo a' camera, e' realimentacao — segurar uma tecla faz o
 * personagem andar em espiral.
 *
 * Sem balanco de passo, tambem de proposito. No rpk.fps o `bobAmount` caiu pra
 * 0.01 porque o olho oscilando atrapalha mirar; aqui a mira e' um ponto no chao
 * e o alvo e' uma bola em movimento, entao nao ha' balanco nenhum.
 */
export class CameraRig {
  private foco = new THREE.Vector3();
  private modo: ModoDaCamera = 'jogo';

  /** O que a camera segue, e o que ela olha junto (a bola). */
  private alvo: THREE.Object3D | null = null;
  private bola: THREE.Object3D | null = null;

  /** O que ela esta' enquadrando agora. Quem coordena precisa saber. */
  get modoAtual(): ModoDaCamera { return this.modo; }

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private court: Court,
    private side: Side,
  ) {}

  /** Jogando: atras do seu atleta, na sua quadra. */
  jogar(court: Court, side: Side, atleta: THREE.Object3D, bola: THREE.Object3D): void {
    this.modo = 'jogo';
    this.court = court;
    this.side = side;
    this.alvo = atleta;
    this.bola = bola;
    this.encaixar();
  }

  /**
   * Assistindo: enquadra a quadra inteira, de fora.
   *
   * A quadra e o lado sao o que define "atras": trocar de arena sem trocar os
   * dois deixaria a camera enquadrando a quadra nova a partir do eixo da antiga.
   */
  assistir(court: Court, bola: THREE.Object3D): void {
    this.modo = 'assistindo';
    this.court = court;
    this.side = 'home';
    this.alvo = bola;
    this.bola = bola;
    this.encaixar();
  }

  /** Passeando: atras de quem anda, com o rumo do mundo. */
  passear(quem: THREE.Object3D): void {
    this.modo = 'passeio';
    this.alvo = quem;
    this.bola = null;
    this.encaixar();
  }

  /** Coloca a camera direto na posicao final, sem interpolar. */
  encaixar(): void {
    if (!this.alvo) return;
    this.calcularFoco(this.foco);
    this.calcularPosicao(_desejada);
    this.camera.position.copy(_desejada);
    this.camera.lookAt(this.foco);
  }

  update(dt: number): void {
    if (!this.alvo || dt <= 0) return;

    this.calcularFoco(_foco);
    this.foco.lerp(_foco, dampFactor(CAMERA.rotationSmoothing, dt));

    this.calcularPosicao(_desejada);
    this.camera.position.lerp(_desejada, dampFactor(CAMERA.positionSmoothing, dt));

    _olhar.subVectors(this.foco, this.camera.position);
    if (_olhar.lengthSq() > 1e-6) {
      // Interpola a ROTACAO, nao o ponto de mira: olhar direto pro foco
      // suavizado ainda produz um tranco quando a bola muda de lado.
      _matriz.lookAt(this.camera.position, this.foco, this.camera.up);
      const destino = new THREE.Quaternion().setFromRotationMatrix(_matriz);
      this.camera.quaternion.slerp(destino, dampFactor(CAMERA.rotationSmoothing, dt));
    }
  }

  private calcularPosicao(out: THREE.Vector3): THREE.Vector3 {
    /**
     * Passeio: deslocamento fixo em espaco de MUNDO.
     *
     * Mais baixa e mais perto que a de jogo, e por conta: a 4,5 m de altura e
     * 10 m atras, a mira desce 16 graus abaixo do horizonte, e com meia lente
     * de 22,5 sobra horizonte no alto do quadro. Na altura da camera de jogo
     * (10,5 m) a inclinacao passa de 40 graus e a praia inteira vira areia sem
     * ceu — o que serve pra ler uma quadra nao serve pra atravessar um lugar.
     */
    if (this.modo === 'passeio') {
      return out.set(
        this.alvo!.position.x,
        CAMERA.passeioAltura,
        this.alvo!.position.z - CAMERA.passeioDistancia,
      );
    }

    if (this.modo === 'assistindo') {
      return this.court.paraMundo(
        _alvoLocal.set(
          this.acompanhamentoLateral(),
          CAMERA.assistirAltura,
          (this.court.halfLength + CAMERA.assistirDistancia) * sinalDe(this.side),
        ),
        out,
      );
    }

    this.court.paraLocal(this.alvo!.position, _alvoLocal);

    const sinal = sinalDe(this.side);
    const lateral = _alvoLocal.x * CAMERA.lateralFollow;

    /**
     * "Atras" e' sempre o lado de fora da quadra do jogador. A camera acompanha
     * a profundidade do atleta, mas nunca passa da linha de fundo — sem esse
     * limite, correr pra rede leva a camera junto e ela acaba DENTRO da quadra,
     * com a rede colada na lente.
     */
    const cru = _alvoLocal.z + CAMERA.distance * sinal;
    const minimo = this.court.halfLength + CAMERA.minDepthMargin;
    const atras = sinal < 0 ? Math.min(cru, -minimo) : Math.max(cru, minimo);

    return this.court.paraMundo(_alvoLocal.set(lateral, CAMERA.height, atras), out);
  }

  /**
   * O quanto a camera de quem assiste anda de lado com a bola.
   *
   * Anda um pouco de proposito: uma camera completamente fixa da' a impressao
   * de foto, e uma que acompanha a bola inteira vira um pendulo. Um quarto do
   * deslocamento e' o bastante pra parecer que alguem esta' segurando.
   */
  private acompanhamentoLateral(): number {
    this.court.paraLocal(this.bola!.position, _lateral);
    const limite = this.court.halfWidth;
    return clamp(_lateral.x, -limite, limite) * CAMERA.assistirLateral;
  }

  private calcularFoco(out: THREE.Vector3): THREE.Vector3 {
    // Assistindo: mira na REDE, na altura de um jogador. Mirar na bola de
    // verdade inclina a camera pro ceu toda vez que ela sobe, e a quadra
    // escorrega pro pe' da tela.
    if (this.modo === 'assistindo') {
      return this.court.paraMundo(
        _alvoLocal.set(this.acompanhamentoLateral(), CAMERA.alturaDoOlhar, 0),
        out,
      );
    }

    out.copy(this.alvo!.position);

    if (this.modo === 'passeio') {
      out.y += CAMERA.alturaDoOlhar;
      return out;
    }

    out.y += 1.2;
    if (this.bola && CAMERA.ballFocus > 0) {
      out.lerp(this.bola.position, clamp(CAMERA.ballFocus, 0, 1));
    }
    return out;
  }
}
