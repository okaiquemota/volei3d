import * as THREE from 'three';
import { ATAQUE, HIT } from '../config';
import { alturaAoCruzarRede, arcoPorApice, arcoPorTempo, corrigirArrasto } from '../core/ballistics';
import { randomInCircle } from '../core/math';
import type { Ball, Tocador } from '../ball/Ball';
import type { Court } from '../world/Court';

/**
 * As acoes possiveis sobre a bola.
 *
 * `manchete`, `levantamento` e `cortada` saem do contexto. `ataque` e' a
 * unica que o jogador PEDE: e' a batida forcada por cima da rede com os pes no
 * chao, e existe porque sem ela um ataque de pe' virava levantamento mirado
 * longe — arco alto e lento, com cara de passe.
 */
export type Acao = 'manchete' | 'levantamento' | 'cortada' | 'ataque' | 'saque';

const _velocidade = new THREE.Vector3();
const _alvo = new THREE.Vector3();
const _ruido = new THREE.Vector2();
const _posLocal = new THREE.Vector3();
const _velLocal = new THREE.Vector3();
const _plana = new THREE.Vector3();

/**
 * Resolve e executa toques na bola.
 *
 * Humano e IA usam exatamente a MESMA fisica de toque. O que muda entre os
 * dois e' so' a mira e o erro (`ruidoDeMira`) — nao ha' "toque da IA" e "toque
 * do jogador", o que impede o adversario de ter fisica propria e o jogo de
 * parecer injusto.
 *
 * O Hitter nao guarda referencia a atleta nenhum: recebe tudo por parametro.
 * E' o que permite um so' Hitter por atleta sem duplicar logica.
 */
export class Hitter {
  private espera = 0;

  /** Erro aleatorio aplicado ao alvo, em metros. Zero no humano. */
  ruidoDeMira = 0;

  /** Ultima acao executada — o HUD e a depuracao leem daqui. */
  ultimaAcao: Acao | null = null;

  get pronto(): boolean { return this.espera <= 0; }

  update(dt: number): void {
    if (this.espera > 0) this.espera -= dt;
  }

  zerarEspera(): void {
    this.espera = 0;
  }

  /** A bola esta' ao alcance dos bracos? */
  alcanca(ball: Ball, posicaoDoAtleta: THREE.Vector3): boolean {
    if (ball.presa) return false;

    const dx = ball.posicao.x - posicaoDoAtleta.x;
    const dz = ball.posicao.z - posicaoDoAtleta.z;
    if (Math.hypot(dx, dz) > HIT.reachRadius) return false;

    const dy = ball.posicao.y - posicaoDoAtleta.y;
    return dy >= -HIT.lowReach && dy <= HIT.verticalReach;
  }

  /**
   * Escolhe a acao pelo CONTEXTO: altura da bola em relacao aos pes, e se o
   * atleta esta' no ar.
   *
   * Nao ha' tecla de manchete nem de cortada. Isso e' deliberado: num jogo de
   * volei o que decide o toque e' onde a bola esta', nao uma escolha de menu —
   * e um botao so' deixa o controle no alcance de qualquer um.
   */
  escolherAcao(ball: Ball, posicaoDoAtleta: THREE.Vector3, noChao: boolean): Acao {
    const relativa = ball.posicao.y - posicaoDoAtleta.y;

    if (!noChao && relativa >= HIT.spikeMinHeight) return 'cortada';
    if (relativa <= HIT.bumpMaxHeight) return 'manchete';
    return 'levantamento';
  }

  /**
   * Executa o toque. `alvoNoChao` e' onde a bola deve cair.
   *
   * Devolve false quando nao ha' solucao — e nesse caso a bola simplesmente
   * nao e' tocada, o que e' melhor que mandar um lance sem sentido.
   */
  bater(
    ball: Ball,
    court: Court,
    por: Tocador,
    acao: Acao,
    alvoNoChao: THREE.Vector3,
    forcaDoAtaque?: number,
  ): boolean {
    if (!this.pronto) return false;

    const de = ball.posicao;
    this.aplicarRuido(alvoNoChao, _alvo);

    const precisaPassar = this.cruzaARede(court, de, _alvo);

    /**
     * Ataque e cortada compartilham o solver de TEMPO; passe e levantamento, o
     * de apice. E' a diferenca entre "chegar rapido" e "subir o bastante pra
     * alguem chegar embaixo" — e e' o que faz um ataque parecer um ataque.
     */
    const ehAtaque = acao === 'cortada' || acao === 'ataque';
    const ok = ehAtaque
      ? this.resolverCortada(de, _alvo, court, precisaPassar, this.velocidadeDoAtaque(acao, forcaDoAtaque))
      : this.resolverArco(de, _alvo, court, precisaPassar, this.apicePara(acao, de.y));

    if (!ok) return false;

    ball.bater(_velocidade, por);
    this.espera = HIT.cooldown;
    this.ultimaAcao = acao;
    return true;
  }

  /**
   * Velocidade horizontal alvo do ataque, a partir da carga.
   *
   * No ar e em cima da bola bate mais forte que de pe' — a diferenca entre
   * cravar e empurrar. Sem forca informada, meia carga: e' o que um toque
   * apressado merece.
   */
  private velocidadeDoAtaque(acao: Acao, forca = 0.5): number {
    const f = Math.max(0, Math.min(1, forca));
    return acao === 'cortada'
      ? ATAQUE.noArMin + (ATAQUE.noArMax - ATAQUE.noArMin) * f
      : ATAQUE.dePeMin + (ATAQUE.dePeMax - ATAQUE.dePeMin) * f;
  }

  /** Saque: o mesmo solver do passe alto, com apice proprio e sem espera. */
  sacar(ball: Ball, court: Court, por: Tocador, alvoNoChao: THREE.Vector3): boolean {
    this.aplicarRuido(alvoNoChao, _alvo);

    const apice = Math.max(HIT.serveApex, ball.posicao.y + 1);
    if (!this.resolverArco(ball.posicao, _alvo, court, true, apice)) return false;

    ball.bater(_velocidade, por);
    this.espera = HIT.cooldown;
    this.ultimaAcao = 'saque';
    return true;
  }

  private apicePara(acao: Acao, alturaDeContato: number): number {
    const base = acao === 'manchete' ? HIT.bumpApex
               : acao === 'saque' ? HIT.serveApex
               : HIT.setApex;

    // O apice tem que estar acima do ponto de contato, senao nao ha' parabola.
    return Math.max(base, alturaDeContato + 0.6);
  }

  /**
   * Passe, levantamento e saque: arco definido pelo APICE.
   *
   * Se precisar passar a rede e nao passar, o apice sobe e tenta de novo. Este
   * laco e' o que impede o jogador de enterrar a bola na propria rede toda
   * jogada — sem ele, qualquer toque perto da fita vira ponto do adversario e
   * o jogo fica impossivel de aprender.
   */
  private resolverArco(
    de: THREE.Vector3,
    alvo: THREE.Vector3,
    court: Court,
    precisaPassar: boolean,
    apiceInicial: number,
  ): boolean {
    let apice = apiceInicial;

    for (let tentativa = 0; tentativa < HIT.netAttempts; tentativa++) {
      const ok = corrigirArrasto(de, alvo, _velocidade, (a, b, out) => arcoPorApice(a, b, apice, out));
      if (!ok) return false;

      if (!precisaPassar || this.passaPorCima(court, de, _velocidade)) return true;
      apice += HIT.apexStep;
    }

    // Esgotou: manda a ultima mesmo assim. Bater na rede e' um erro legivel;
    // nao tocar na bola que estava ao alcance nao e'.
    return true;
  }

  /**
   * Cortada: arco definido pelo TEMPO de voo.
   *
   * Aqui o que importa e' a bola chegar rapido — a altura e' consequencia. Se
   * bate na rede, alonga-se o tempo (arco mais alto) ate' passar.
   */
  private resolverCortada(
    de: THREE.Vector3,
    alvo: THREE.Vector3,
    court: Court,
    precisaPassar: boolean,
    velocidade: number,
  ): boolean {
    _plana.subVectors(alvo, de);
    _plana.y = 0;

    const distancia = Math.max(0.5, _plana.length());
    let tempo = Math.max(0.18, distancia / Math.max(4, velocidade));

    for (let tentativa = 0; tentativa < HIT.netAttempts; tentativa++) {
      const ok = corrigirArrasto(de, alvo, _velocidade, (a, b, out) => arcoPorTempo(a, b, tempo, out));
      if (!ok) return false;

      if (!precisaPassar || this.passaPorCima(court, de, _velocidade, ATAQUE.folgaDaRede)) return true;
      tempo += HIT.timeStep;
    }

    return true;
  }

  /** O alvo esta' do outro lado da rede? */
  private cruzaARede(court: Court, de: THREE.Vector3, alvo: THREE.Vector3): boolean {
    return (court.distanciaAteRede(de) < 0) !== (court.distanciaAteRede(alvo) < 0);
  }

  /** A trajetoria passa acima da fita com folga? */
  private passaPorCima(
    court: Court,
    de: THREE.Vector3,
    velocidade: THREE.Vector3,
    folga: number = HIT.netClearance,
  ): boolean {
    court.paraLocal(de, _posLocal);
    _velLocal.copy(velocidade).applyQuaternion(court.quaternionInv);

    const altura = alturaAoCruzarRede(_posLocal, _velLocal);
    // NaN = nao cruza o plano indo pra frente; nao ha' nada pra passar por cima.
    if (Number.isNaN(altura)) return true;

    return altura >= court.netTopY + folga;
  }

  private aplicarRuido(alvo: THREE.Vector3, out: THREE.Vector3): void {
    out.copy(alvo);
    if (this.ruidoDeMira <= 0.001) return;

    randomInCircle(this.ruidoDeMira, _ruido);
    out.x += _ruido.x;
    out.z += _ruido.y;
  }
}
