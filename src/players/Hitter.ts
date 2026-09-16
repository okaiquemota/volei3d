import * as THREE from 'three';
import { ATAQUE, HIT, TOQUE } from '../config';
import { alturaAoCruzarRede, arcoPorApice, arcoPorTempo, corrigirArrasto } from '../core/ballistics';
import { clamp, randomInCircle } from '../core/math';
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

  /**
   * Quao limpo foi o ultimo contato, de 0 a 1. O HUD mostra, a IA ignora.
   *
   * Nasce em 1 porque um Hitter que nunca tocou na bola nao errou nada.
   */
  ultimaQualidade = 1;

  /**
   * Quantos toques este atleta ja' deu. So' cresce.
   *
   * Existe pra quem esta' de fora perceber que houve um toque NOVO sem ficar
   * comparando estado: a qualidade sozinha nao serve de gatilho, porque dois
   * toques seguidos podem sair identicos.
   */
  toques = 0;

  /**
   * Desconto na dificuldade da bola que chega, de 0 a 1. E' o atributo de
   * DEFESA da IA. Zero no humano: quem defende melhor aqui e' quem se posiciona
   * melhor, e nao quem tem um numero maior.
   */
  defesa = 0;

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
   * Quao limpo e' o contato, de 0 a 1, AGORA.
   *
   * Duas coisas entram, e sao as duas que um jogador de verdade sente:
   *
   *   ONDE a bola esta' em relacao ao corpo. Embaixo do peito e' limpo; na
   *   ponta do braco e' estica-e-reza. E' isto que cobra posicionamento, e e'
   *   por isso que o erro de leitura da IA finalmente custa alguma coisa.
   *
   *   QUAO RAPIDO ela vem. Um balao a 8 m/s nao cobra nada; uma cortada a 24
   *   cobra quase tudo. E' o que da' sentido a atacar forte — sem isto, bola
   *   rapida e bola lenta se defendiam com a mesma limpeza, e atacar era so'
   *   uma forma mais arriscada de passar a bola.
   */
  qualidadeDoContato(ball: Ball, posicaoDoAtleta: THREE.Vector3): number {
    const dx = ball.posicao.x - posicaoDoAtleta.x;
    const dz = ball.posicao.z - posicaoDoAtleta.z;
    const distancia = Math.hypot(dx, dz);

    const zonaLimpa = HIT.reachRadius * TOQUE.zonaLimpa;
    const estica = clamp(
      (distancia - zonaLimpa) / Math.max(0.01, HIT.reachRadius - zonaLimpa),
      0,
      1,
    );

    const velocidade = ball.velocidade.length();
    const dureza = clamp(
      (velocidade - TOQUE.velocidadeFacil) / (TOQUE.velocidadeDificil - TOQUE.velocidadeFacil),
      0,
      1,
    );

    const custoDaVelocidade = dureza * TOQUE.pesoDaVelocidade * (1 - clamp(this.defesa, 0, 1));
    return clamp(1 - estica - custoDaVelocidade, 0, 1);
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
    posicaoDoAtleta: THREE.Vector3,
    forcaDoAtaque?: number,
    erroDaCarga = 0,
  ): boolean {
    if (!this.pronto) return false;

    const de = ball.posicao;
    const qualidade = this.qualidadeDoContato(ball, posicaoDoAtleta);
    this.ultimaQualidade = qualidade;

    // Pegou tao mal que nao ha' jogada: a bola sobe fraca e pra qualquer lado.
    if (qualidade < TOQUE.qualidadeMinima) return this.queimar(ball, por, acao);

    // Ataque carrega um espalhamento que nao some nunca: mirar em cima da linha
    // e' aposta, e nao tiro certo. Passe e levantamento nao — eles armam no
    // proprio campo, e tremer ali so' estragaria a jogada.
    const ehAtaque = acao === 'cortada' || acao === 'ataque';
    const base = ehAtaque ? ATAQUE.espalhamentoDaBatida : 0;
    this.aplicarRuido(alvoNoChao, _alvo, qualidade, erroDaCarga + base);

    const precisaPassar = this.cruzaARede(court, de, _alvo);

    /**
     * Ataque e cortada compartilham o solver de TEMPO; passe e levantamento, o
     * de apice. E' a diferenca entre "chegar rapido" e "subir o bastante pra
     * alguem chegar embaixo" — e e' o que faz um ataque parecer um ataque.
     */
    const ok = ehAtaque
      ? this.resolverCortada(de, _alvo, court, precisaPassar, this.velocidadeDoAtaque(acao, forcaDoAtaque, qualidade))
      : this.resolverArco(de, _alvo, court, precisaPassar, this.apicePara(acao, de.y));

    if (!ok) return false;

    ball.bater(_velocidade, por);
    this.espera = HIT.cooldown;
    this.ultimaAcao = acao;
    this.toques++;
    return true;
  }

  /**
   * O toque queimado: a bola sobe fraca, perto, e pra qualquer lado.
   *
   * Nao e' perder o ponto — da' pra correr atras e salvar, e e' o que se faz na
   * quadra depois de pegar mal na bola. E' perder a JOGADA. Se sair pra fora,
   * saiu: uma bola queimada nao tem pra onde ser mirada, e trazer ela de volta
   * pra dentro seria a mao do jogo consertando o que o jogador estragou.
   */
  private queimar(ball: Ball, por: Tocador, acao: Acao): boolean {
    randomInCircle(TOQUE.espalhamentoDoQueimado, _ruido);
    _alvo.set(ball.posicao.x + _ruido.x, 0, ball.posicao.z + _ruido.y);

    const apice = Math.max(TOQUE.apiceDoQueimado, ball.posicao.y + 0.8);
    if (!corrigirArrasto(ball.posicao, _alvo, _velocidade, (a, b, out) => arcoPorApice(a, b, apice, out))) {
      return false;
    }

    ball.bater(_velocidade, por);
    this.espera = HIT.cooldown;
    this.ultimaAcao = acao;
    this.toques++;
    return true;
  }

  /**
   * Velocidade horizontal alvo do ataque, a partir da carga.
   *
   * No ar e em cima da bola bate mais forte que de pe' — a diferenca entre
   * cravar e empurrar. Sem forca informada, meia carga: e' o que um toque
   * apressado merece.
   */
  private velocidadeDoAtaque(acao: Acao, forca = 0.5, qualidade = 1): number {
    const f = Math.max(0, Math.min(1, forca));
    const cheia = acao === 'cortada'
      ? ATAQUE.noArMin + (ATAQUE.noArMax - ATAQUE.noArMin) * f
      : ATAQUE.dePeMin + (ATAQUE.dePeMax - ATAQUE.dePeMin) * f;

    // Bola na ponta do braco nao se crava. E' o que separa o ataque ARMADO do
    // ataque apressado, e e' a razao de armar valer a pena.
    return cheia * (TOQUE.forcaMinima + (1 - TOQUE.forcaMinima) * clamp(qualidade, 0, 1));
  }

  /**
   * Saque: o mesmo solver do passe alto, com o apice saindo da CARGA.
   *
   * Carga zero e' balao — sobe alto e da' tempo de sobra pro outro lado. Carga
   * cheia e' o arco mais raso que a rede deixa passar, e corta quase metade do
   * tempo de reacao de quem recebe.
   */
  sacar(
    ball: Ball,
    court: Court,
    por: Tocador,
    alvoNoChao: THREE.Vector3,
    forca = 0,
    erroDaCarga = 0,
  ): boolean {
    // O saque tambem espalha: a linha e' aposta ali igual.
    this.aplicarRuido(alvoNoChao, _alvo, 1, erroDaCarga + ATAQUE.espalhamentoDaBatida);

    const f = Math.max(0, Math.min(1, forca));
    const pedido = HIT.serveApexFraco + (HIT.serveApexForte - HIT.serveApexFraco) * f;
    // O apice tem que estar acima do ponto de contato, senao nao ha' parabola.
    const apice = Math.max(pedido, ball.posicao.y + 1);
    if (!this.resolverArco(ball.posicao, _alvo, court, true, apice)) return false;

    ball.bater(_velocidade, por);
    this.espera = HIT.cooldown;
    this.ultimaAcao = 'saque';
    // A bola sai da mao, parada e no eixo do corpo: nao ha' contato pra medir.
    this.ultimaQualidade = 1;
    this.toques++;
    return true;
  }

  private apicePara(acao: Acao, alturaDeContato: number): number {
    const base = acao === 'manchete' ? HIT.bumpApex : HIT.setApex;

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
    const pedido = Math.max(0.18, distancia / Math.max(4, velocidade));

    const tentar = (t: number): boolean | null => {
      if (!corrigirArrasto(de, alvo, _velocidade, (a, b, out) => arcoPorTempo(a, b, t, out))) return null;
      return !precisaPassar || this.passaPorCima(court, de, _velocidade, ATAQUE.folgaDaRede);
    };

    const noPedido = tentar(pedido);
    if (noPedido === null) return false;
    if (noPedido) return true;

    // Sobe o tempo em passos ate' achar UM que passa: e' o teto da busca.
    let bate = pedido;
    let passa = 0;
    for (let i = 1; i <= HIT.netAttempts; i++) {
      const t = pedido + i * HIT.timeStep;
      const r = tentar(t);
      if (r === null) return false;
      if (r) { passa = t; break; }
      bate = t;
    }

    // Esgotou: manda a ultima mesmo assim. Bater na rede e' um erro legivel;
    // nao tocar na bola que estava ao alcance nao e'.
    if (passa === 0) return true;

    /**
     * Agora o MENOR tempo que ainda passa, por bisseccao.
     *
     * O laco de passo fixo parava no primeiro multiplo de 0,07 s que passava da
     * fita, e esse multiplo pode cair bem acima do minimo. Medido: com a carga
     * cheia a cortada saia a 18,8 m/s e com 0,7 saia a 19,9 — carga MAIOR
     * chegando mais devagar. Numa barra que promete "aqui e' o ponto mais
     * forte", isso e' a promessa quebrada por granularidade de busca.
     */
    for (let i = 0; i < 6; i++) {
      const meio = (bate + passa) / 2;
      const r = tentar(meio);
      if (r === null) break;
      if (r) passa = meio;
      else bate = meio;
    }

    // A ultima tentativa pode ter sido a que BATE: resolve de novo no tempo bom,
    // senao `_velocidade` sai com a trajetoria que nao passa.
    return tentar(passa) !== null;
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

  /**
   * Espalha o alvo: o erro da dificuldade da IA mais o erro do contato.
   *
   * Os tres somam de proposito, porque sao tres erros diferentes: o da IA e'
   * quem ela e'; o do contato e' ONDE ela pegou na bola; o da carga e' QUANDO o
   * jogador soltou o botao. O humano nao tem o primeiro — ele nao tem
   * dificuldade, tem posicionamento e tempo.
   */
  private aplicarRuido(
    alvo: THREE.Vector3,
    out: THREE.Vector3,
    qualidade = 1,
    erroDaCarga = 0,
  ): void {
    out.copy(alvo);

    const espalhamento = this.ruidoDeMira
      + (1 - clamp(qualidade, 0, 1)) * TOQUE.erroMaximo
      + Math.max(0, erroDaCarga);
    if (espalhamento <= 0.001) return;

    randomInCircle(espalhamento, _ruido);
    out.x += _ruido.x;
    out.z += _ruido.y;
  }
}
