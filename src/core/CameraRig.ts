import * as THREE from 'three';
import { CAMERA } from '../config';
import { Court, sinalDe, type Side } from '../world/Court';
import { clamp, clamp01, dampFactor, lerp } from './math';

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

  /**
   * A orbita de quem passeia: para onde, de que altura, e de que longe.
   *
   * Comeca exatamente no enquadramento que a camera de passeio sempre teve —
   * `passeioAltura` e `passeioDistancia` sao a mesma coisa que este raio e esta
   * elevacao, so' escritos em coordenadas diferentes. E sobrevive a entrar e
   * sair de quadra: quem escolheu um angulo pra olhar a praia nao quer ele de
   * volta no padrao a cada partida.
   */
  private giro = 0;
  private elevacao = Math.atan2(CAMERA.passeioAltura - CAMERA.alturaDoOlhar, CAMERA.passeioDistancia);
  private raio = Math.hypot(CAMERA.passeioDistancia, CAMERA.passeioAltura - CAMERA.alturaDoOlhar);

  /**
   * Gira a orbita do passeio, em PIXELS de arrasto.
   *
   * Arrastar pra direita olha pra direita: o mundo anda pra esquerda na tela,
   * que e' o que acontece quando se vira a cabeca. Arrastar pra baixo olha pra
   * baixo, e pra isso a camera SOBE — quem olha pra baixo esta' por cima.
   *
   * Nao faz nada fora do passeio. Dentro da quadra o angulo e' da quadra.
   */
  orbitar(pixelsX: number, pixelsY: number): void {
    if (this.modo !== 'passeio') return;

    this.giro -= pixelsX * CAMERA.passeioGiroPorPixel;
    this.elevacao = clamp(
      this.elevacao + pixelsY * CAMERA.passeioGiroPorPixel,
      CAMERA.passeioElevacaoMin,
      CAMERA.passeioElevacaoMax,
    );
  }

  /**
   * Onde a camera de jogo esta' entre os dois enquadramentos.
   *
   * 0 e' `jogoPerto` (a camera de ombro), 1 e' `jogoLonge` (a tatica). Nao e'
   * um multiplicador: interpolar os DOIS extremos muda o angulo junto com a
   * distancia, e o angulo e' o que separa um enquadramento do outro.
   *
   * Sobrevive a sair e voltar pra quadra, como a orbita do passeio: quem
   * escolheu de onde quer ver a quadra nao quer o padrao de volta a cada ponto.
   */
  private enquadramento: number = CAMERA.jogoEnquadramentoPadrao;

  /** Quanto vale, agora, cada numero que muda entre os dois enquadramentos. */
  private get altura(): number {
    return lerp(CAMERA.jogoPerto.altura, CAMERA.jogoLonge.altura, this.enquadramento);
  }
  private get distancia(): number {
    return lerp(CAMERA.jogoPerto.distancia, CAMERA.jogoLonge.distancia, this.enquadramento);
  }
  private get puxaoDaBola(): number {
    return lerp(CAMERA.jogoPerto.foco, CAMERA.jogoLonge.foco, this.enquadramento);
  }
  private get acompanhamento(): number {
    return lerp(CAMERA.jogoPerto.lateral, CAMERA.jogoLonge.lateral, this.enquadramento);
  }
  private get alturaDaMira(): number {
    return lerp(CAMERA.jogoPerto.mira, CAMERA.jogoLonge.mira, this.enquadramento);
  }

  /** Aproxima ou afasta, em pixels de roda. Positivo afasta. */
  aproximar(pixels: number): void {
    if (pixels === 0) return;

    if (this.modo === 'passeio') {
      this.raio = clamp(
        this.raio + pixels * CAMERA.passeioZoomPorPixel,
        CAMERA.passeioRaioMin,
        CAMERA.passeioRaioMax,
      );
      return;
    }

    /**
     * Jogando, a roda anda entre os dois enquadramentos.
     *
     * Positivo AFASTA, que aqui quer dizer "vai pro tatico": sobe, recua e
     * abre o angulo, tudo junto. Nao ha' meio-termo artificial — os pontos
     * intermediarios sao camera de verdade, so' que a meio caminho.
     *
     * Assistindo nao tem zoom: aquele enquadramento existe pra caber a quadra
     * inteira, e mexer nele so' tiraria pedaco dela.
     */
    if (this.modo !== 'jogo') return;

    this.enquadramento = clamp01(this.enquadramento + pixels * CAMERA.jogoZoomPorPixel);
  }

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

    if (this.modo === 'passeio') {
      this.seguirPasseio(dt);
      return;
    }

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

  /**
   * A camera de passeio e' RIGIDA: quem ela segue nao sai do meio da tela.
   *
   * As outras duas amaciam posicao e rotacao separadamente, e podem: la' o
   * alvo e' um atleta que corre e uma bola que voa, e o foco escorregar um
   * pouco do centro e' o que da' peso a' camera.
   *
   * Aqui isso e' DEFEITO, e era o defeito. A orbita era calculada em volta da
   * posicao CRUA do alvo enquanto a camera olhava pro foco SUAVIZADO — dois
   * pontos diferentes — e ainda por cima a rotacao chegava atrasada em relacao
   * a' posicao. Girando rapido, a camera ja' tinha dado a volta e a mira ainda
   * vinha vindo: o personagem escorregava pro canto e voltava sozinho.
   *
   * Um ponto so', entao: o foco amacia o ANDAR do personagem, a orbita e'
   * montada em volta desse mesmo ponto, e o `lookAt` e' exato. Girar passa a
   * ser 1 pra 1 com o mouse, que e' o que "travado" quer dizer.
   */
  private seguirPasseio(dt: number): void {
    this.calcularFoco(_foco);
    this.foco.lerp(_foco, dampFactor(CAMERA.passeioSuavidade, dt));

    const plano = Math.cos(this.elevacao) * this.raio;
    this.camera.position.set(
      this.foco.x - Math.sin(this.giro) * plano,
      this.foco.y + Math.sin(this.elevacao) * this.raio,
      this.foco.z - Math.cos(this.giro) * plano,
    );
    this.camera.lookAt(this.foco);
  }

  private calcularPosicao(out: THREE.Vector3): THREE.Vector3 {
    /**
     * Passeio: uma orbita em torno da cabeca de quem anda, em espaco de MUNDO.
     *
     * Comeca mais baixa e mais perto que a de jogo, e por conta: a 4,5 m de
     * altura e 10 m atras, a mira desce 16 graus abaixo do horizonte, e com
     * meia lente de 22,5 sobra horizonte no alto do quadro. Na altura da camera
     * de jogo (10,5 m) a inclinacao passa de 40 graus e a praia inteira vira
     * areia sem ceu — o que serve pra ler uma quadra nao serve pra atravessar
     * um lugar. Dali em diante quem manda e' a mao do jogador.
     */
    if (this.modo === 'passeio') {
      // Em volta do FOCO, nunca da posicao crua do alvo: e' a mesma conta do
      // `seguirPasseio`, e os dois tem que concordar ou o encaixe da' um
      // tranco no primeiro quadro.
      const plano = Math.cos(this.elevacao) * this.raio;
      this.calcularFoco(_foco);
      return out.set(
        _foco.x - Math.sin(this.giro) * plano,
        _foco.y + Math.sin(this.elevacao) * this.raio,
        _foco.z - Math.cos(this.giro) * plano,
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
    const lateral = _alvoLocal.x * this.acompanhamento;

    /**
     * "Atras" e' sempre o lado de fora da quadra do jogador. A camera acompanha
     * a profundidade do atleta, mas nunca passa da linha de fundo — sem esse
     * limite, correr pra rede leva a camera junto e ela acaba DENTRO da quadra,
     * com a rede colada na lente.
     */
    const cru = _alvoLocal.z + this.distancia * sinal;
    const minimo = this.court.halfLength + CAMERA.minDepthMargin;
    const atras = sinal < 0 ? Math.min(cru, -minimo) : Math.max(cru, minimo);

    return this.court.paraMundo(
      _alvoLocal.set(lateral, this.altura, atras),
      out,
    );
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

    out.y += this.alturaDaMira;
    const puxao = this.puxaoDaBola;
    if (this.bola && puxao > 0) out.lerp(this.bola.position, clamp01(puxao));
    return out;
  }
}
