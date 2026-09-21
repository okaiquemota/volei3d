import * as THREE from 'three';
import { ATAQUE, PLAYER } from '../config';
import type { Input } from '../core/Input';
import { oposto } from '../world/Court';
import { Athlete } from './Athlete';
import type { Acao } from './Hitter';
import { direcaoDoTeclado } from './controle';
import { lerCarga, type LeituraDaCarga } from './carga';

const _direcao = new THREE.Vector3();
const _paraABola = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raio = new THREE.Raycaster();
const _planoDoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _pontoDoChao = new THREE.Vector3();
const _alvoDoToque = new THREE.Vector3();

/**
 * O jogador humano.
 *
 * Controles:
 *   WASD / setas ......... correr, relativo a' camera
 *   Espaco ............... pular
 *   Mouse ................ mirar (um ponto no CHAO, nao uma direcao)
 *   Clique esq. / E ...... tocar na bola
 *   Clique dir. / R ...... levantar no proprio campo
 *   C .................... mergulhar: joga o corpo pra alcancar o que os pes nao alcancam
 *   F .................... forcar o ataque por cima da rede
 *   Shift ................ camera lenta (quem le' e' o Game: e' do mundo, nao do atleta)
 */
export class Human extends Athlete {
  /** Ultimo ponto mirado, ja' limitado ao campo adversario. */
  readonly pontoDeMira = new THREE.Vector3();

  private bufferDeToque = 0;

  /** Carga do ataque, de 0 a 1. Sobe enquanto o botao esta' segurado. */
  private carga = 0;
  private carregando = false;
  /** Soltou o botao e ainda nao bateu: a intencao vale enquanto o buffer durar. */
  private ataquePendente = false;
  /** Pediu levantamento no botao direito e ainda nao bateu. */
  private levantarPendente = false;

  camera: THREE.PerspectiveCamera | null = null;
  input: Input | null = null;

  override update(dt: number): void {
    this.hitter.update(dt);
    // O corpo estendido alcanca mais. Escrito aqui, uma vez por quadro, porque
    // quem sabe que o corpo esta' no ar e' o Motor e quem usa o alcance e' o
    // Hitter — e nenhum dos dois devia conhecer o outro.
    this.hitter.estendido = this.motor.mergulhando;
    this.atualizarMira();
    this.atualizarMovimento();
    this.atualizarAcoes(dt);

    this.motor.update(dt);
    this.sincronizarVisual(dt);
  }

  private atualizarMovimento(): void {
    const input = this.input;
    if (!input) return;

    // Movimento relativo a' CAMERA, nao ao corpo — a mesma conta de quem anda
    // pela areia, e por isso ela mora em `controle.ts` e nao aqui.
    this.motor.moverPara(direcaoDoTeclado(input, this.camera, _direcao));

    /**
     * Encara a bola quando ela esta' do meu lado; senao, encara a rede. E' o
     * que faz o atleta "prestar atencao" na jogada sem custar input nenhum.
     *
     * Bola PRESA nao conta. Ela esta' na ancora do meu proprio corpo: encarar
     * a bola e' encarar o proprio braco, o corpo gira atras dele, a ancora gira
     * junto, e o sacador fica rodando em torno de si mesmo esperando o saque.
     */
    if (!this.ball.presa && this.bolaNoMeuLado()) {
      _paraABola.subVectors(this.ball.posicao, this.motor.posicao);
      this.motor.encarar(_paraABola);
    } else {
      this.motor.encarar(this.direcaoParaRede(_paraABola));
    }
  }

  private atualizarAcoes(dt: number): void {
    const input = this.input;
    if (!input) return;

    if (input.wasPressed('Space')) this.motor.pular();

    /**
     * O mergulho, e o toque que ele ja' traz junto.
     *
     * Mergulhar E' decidir tocar: quem se joga no chao nao vai decidir de novo
     * meio segundo depois se quer ou nao encostar na bola. O buffer fica armado
     * o voo inteiro (mais abaixo), entao o toque sai no primeiro quadro em que
     * o corpo alcanca — a decisao que o jogador toma e PRA ONDE e QUANDO se
     * jogar, que e' a leitura de jogo, e nao um segundo clique de tres quadros.
     *
     * A carga guardada morre junto: mergulho e' defesa. Chegar deitado com uma
     * carga cheia de um ataque que nao aconteceu mandaria a bola por cima da
     * rede a 20 m/s de um corpo caido.
     */
    if (input.wasPressed('KeyC') && !this.sacando && this.motor.livre && this.motor.noChao) {
      this.motor.mergulhar(direcaoDoTeclado(input, this.camera, _direcao));
      this.esquecerAtaque();
      this.carregando = false;
    }

    /**
     * Dois botoes, duas intencoes — e o esquerdo faz as duas coisas que o
     * jogador mais faz.
     *
     *   ESQUERDO (ou E)  joga a bola. Toque rapido arma no proprio campo;
     *                    SEGURAR carrega e manda por cima da rede.
     *   DIREITO          levanta: sobe a bola no proprio campo, de proposito.
     *
     * A versao anterior tinha o ataque no direito e o passe no esquerdo, e
     * errava em dois pontos. O jogador precisava trocar de dedo pra decidir
     * entre passar e atacar, o que e' uma decisao de MIRA e nao de botao; e
     * levantar de proposito nao existia — dependia da altura em que a bola
     * chegava.
     *
     * Agora a carga E' a intencao: quem so' encosta passa, quem segura ataca.
     */
    const segurandoOToque = input.isMouseDown(0) || input.isDown('KeyE');

    if (segurandoOToque) {
      this.carregando = true;
      this.carga = Math.min(ATAQUE.cargaMaxima, this.carga + dt / ATAQUE.tempoDeCarga);
    }

    /**
     * No teto, o golpe sai SOZINHO.
     *
     * Sem isso, segurar pra sempre viraria estrategia: quem passou da zona
     * ficaria com o botao preso esperando a proxima bola, e o castigo de ter
     * passado nunca chegaria. Sair sozinho e' o castigo chegando.
     */
    const estourou = segurandoOToque && this.carga >= ATAQUE.cargaMaxima;
    const soltouOToque = this.carregando && (!segurandoOToque || estourou);
    if (soltouOToque) {
      this.carregando = false;
      /**
       * A INTENCAO de atacar sobrevive a' soltada.
       *
       * No quadro em que se solta o botao ja' subiu; se o alvo dependesse do
       * botao, o ataque viraria passe manso bem na hora de bater. A intencao
       * dura o que durar o buffer.
       */
      this.ataquePendente = this.carga >= ATAQUE.cargaMinimaParaAtacar || this.segurandoModificador;
    }

    /**
     * O levantamento nao carrega: e' um toque de armacao, sai na hora.
     *
     * Tem tecla alem do botao direito, e nao por comodidade: o Firefox trata
     * `SHIFT + botao direito` como escotilha do usuario e abre o menu de
     * contexto ignorando o `preventDefault` da pagina. Como o SHIFT aqui e' a
     * camera lenta, essa combinacao acontece sozinha no meio de um lance — e
     * nao ha' do lado da pagina como impedir. O `R` e' o caminho que nao passa
     * por ali.
     */
    const pediuLevantar = input.wasMousePressed(2) || input.wasPressed('KeyR');
    if (pediuLevantar) this.levantarPendente = true;

    /**
     * Buffer de toque.
     *
     * O clique dado um quadro antes da bola entrar no alcance nao pode se
     * perder: sem isso o jogo parece travado justamente quando o jogador
     * acertou o tempo. E' o irmao do jumpBuffer do rpk.fps.
     */
    if (soltouOToque || pediuLevantar || this.motor.mergulhando) {
      this.bufferDeToque = PLAYER.hitBuffer;
    } else if (this.bufferDeToque > 0) {
      this.bufferDeToque -= dt;
      // Buffer vencido sem tocar na bola: a carga e a intencao morrem junto,
      // senao o proximo toque herda a forca de um ataque que nao aconteceu.
      if (this.bufferDeToque <= 0) this.esquecerAtaque();
    }

    if (this.bufferDeToque <= 0) return;

    if (this.sacando) {
      const leitura = lerCarga(this.carga);
      this.ultimaLeituraDaCarga = leitura;
      if (this.hitter.sacar(this.ball, this.court, this, this.pontoDeMira, leitura.forca, leitura.erro)) {
        this.bufferDeToque = 0;
        this.esquecerAtaque();
      }
      return;
    }

    if (!this.rally.rallyVivo) return;
    if (!this.hitter.alcanca(this.ball, this.motor.posicao)) return;

    /**
     * O clique fica armado e o toque sai quando a bola chega no corpo.
     *
     * E' o que o buffer sempre prometeu: nao perder um clique adiantado. Sem
     * isto ele disparava no primeiro quadro em que a bola entra no alcance, que
     * e' o quadro em que ela esta' MAIS LONGE — o buffer perdoava o clique e
     * entregava o pior contato possivel.
     *
     * A janela inteira dura 0,18 s. Exigir o quadro certo dentro dela seria um
     * teste de reflexo de tres quadros, e nao a leitura de jogo que o resto do
     * toque cobra.
     */
    if (this.esperarPelaBola()) return;

    const acao = this.escolherAcao();
    this.escolherAlvo(acao, _alvoDoToque);

    /**
     * A barra so' cobra de quem ATACA.
     *
     * Um toque rapido de armacao e' carga quase zero, e passar o erro de
     * "batida apressada" nele puniria justamente o toque que DEVE ser rapido —
     * o passe e o levantamento nao tem o que carregar.
     */
    const leitura = lerCarga(this.carga);
    this.ultimaLeituraDaCarga = leitura;
    const erro = this.vaiAtacar(acao) ? leitura.erro : 0;

    if (this.hitter.bater(
      this.ball, this.court, this, acao, _alvoDoToque, this.motor.posicao, leitura.forca, erro,
    )) {
      this.bufferDeToque = 0;
      this.esquecerAtaque();
    }
  }

  private esquecerAtaque(): void {
    this.carga = 0;
    this.ataquePendente = false;
    this.levantarPendente = false;
  }

  /**
   * A acao sai do contexto, com uma excecao: atacar de pe' vira `ataque`.
   *
   * Sem isso, forcar o ataque com os pes no chao devolvia "levantamento" — o
   * solver de apice, um arco de 6 metros mirado longe. Ia por cima da rede,
   * mas em camera lenta.
   */
  private escolherAcao(): Acao {
    /**
     * Deitado so' sai manchete.
     *
     * O contexto diria "cortada" — o corpo esta' fora do chao e a bola pode
     * estar alta em relacao a ele. Mas quem esta' no ar aqui esta' esticado
     * rente a' areia, nao pulado na frente da rede, e uma cortada saindo de um
     * peixinho e' o jogo entendendo o gesto ao contrario.
     */
    if (this.motor.mergulhando || this.motor.levantando) return 'manchete';

    /**
     * Levantar e' a unica acao que o jogador PEDE contra o contexto.
     *
     * Bola na canela ou na cabeca, tanto faz: pedindo levantamento, ela sobe.
     * E' o toque que monta a jogada, e depender da altura em que a bola chegou
     * pra poder montar deixaria a decisao nas maos do adversario.
     */
    if (this.levantarPendente && !this.precisaCruzarARede()) return 'levantamento';

    const contextual = this.hitter.escolherAcao(this.ball, this.motor.posicao, this.motor.noChao);
    if (contextual === 'cortada') return 'cortada';
    return this.vaiAtacar(contextual) ? 'ataque' : contextual;
  }

  /** O toque vai cruzar a rede? */
  private vaiAtacar(acao: Acao): boolean {
    // Levantar pedido explicitamente NUNCA cruza — a nao ser no ultimo toque
    // permitido, onde ficar com a bola e' ponto do adversario.
    if (this.levantarPendente) return this.precisaCruzarARede();
    return acao === 'cortada' || this.forcandoAtaque || this.precisaCruzarARede();
  }

  /**
   * Pra onde mandar a bola.
   *
   * Cortada, terceiro toque ou botao de ataque segurado => campo adversario,
   * na mira do mouse. Qualquer outra coisa => armacao no proprio campo.
   *
   * Isso e' o que faz os dois primeiros toques montarem a jogada sozinhos: o
   * jogador nao precisa decidir "passar ou atacar" a cada toque, so' quando
   * quiser quebrar o padrao.
   */
  private escolherAlvo(acao: Acao, out: THREE.Vector3): THREE.Vector3 {
    if (this.vaiAtacar(acao)) return out.copy(this.pontoDeMira);

    const profundidade = acao === 'manchete' ? PLAYER.bumpSetupDepth : PLAYER.setSetupDepth;
    return this.alvoDeArmacao(profundidade, out);
  }

  private get forcandoAtaque(): boolean {
    return this.ataquePendente;
  }

  /**
   * F forca o ataque, mesmo com carga baixa.
   *
   * E' a valvula pra quando a bola chega em cima e nao ha' tempo de segurar:
   * o toque sai fraco, mas sai por cima da rede em vez de armar no proprio
   * campo, que naquele momento seria perder o ponto.
   *
   * Morava no Shift, e o Shift virou a camera lenta. A troca e' de graca aqui e
   * nao era la': este modificador e' de INSTANTE — segura junto com o clique, no
   * momento do contato, ja' posicionado. A camera lenta e' de PERCURSO, e se
   * segura enquanto se corre atras da bola; tirar o indicador do D pra chegar no
   * F custava o passo, que e' justamente o que o poder existe pra dar.
   */
  private get segurandoModificador(): boolean {
    return !!this.input && this.input.isDown('KeyF');
  }

  /** Carga atual, de 0 a 1. O HUD e o marcador de mira leem daqui. */
  /**
   * Onde a barra esta', de 0 a 1 da VARREDURA inteira — nao da zona.
   *
   * O HUD desenha a barra toda, zona e excesso incluidos, entao ele precisa da
   * fracao do percurso e nao da forca resultante. A forca sai de `lerCarga`, e
   * nos dois tercos finais da barra ela NAO acompanha o preenchimento: e' o
   * ponto do QTE.
   */
  get forcaDoAtaque(): number { return this.carregando ? this.carga / ATAQUE.cargaMaxima : 0; }
  get carregandoAtaque(): boolean { return this.carregando; }

  /** Como a barra seria lida se o golpe saisse agora. O HUD pinta a zona daqui. */
  get leituraDaCarga(): LeituraDaCarga { return lerCarga(this.carga); }

  /**
   * A leitura da barra no golpe que ACABOU de sair.
   *
   * Guardada porque `esquecerAtaque` zera a carga no mesmo quadro: quem for
   * contar ao jogador como foi leria uma barra vazia e diria "apressado" depois
   * de um ataque no ponto.
   */
  ultimaLeituraDaCarga: LeituraDaCarga = lerCarga(0);

  /**
   * Como sairia o toque se voce batesse AGORA, de 0 a 1. Negativo: nao da' pra
   * bater, entao nao ha' janela pra mostrar.
   *
   * E' o mesmo numero que o Hitter vai usar no toque de verdade — nao uma
   * estimativa parecida. Uma barra que mostra uma conta e o jogo faz outra e'
   * pior que barra nenhuma.
   */
  get janelaDeToque(): number {
    if (!this.rally.rallyVivo || this.sacando) return -1;
    if (!this.hitter.pronto || !this.hitter.alcanca(this.ball, this.motor.posicao)) return -1;
    return this.hitter.qualidadeDoContato(this.ball, this.motor.posicao);
  }

  /**
   * A mira e' um ponto no CHAO, resolvido pela posicao do cursor.
   *
   * Por isso este jogo nao usa pointer lock: com o cursor preso so' existe
   * movimento relativo, e "onde eu quero que a bola caia" vira um acumulador
   * que o jogador tem que administrar. Com o cursor solto, o ponto e' onde ele
   * esta' olhando.
   */
  private atualizarMira(): void {
    if (!this.camera || !this.input || !this.input.pointerMoved) {
      this.alvoPadrao(this.pontoDeMira);
      return;
    }

    _ndc.set(
      (this.input.pointerX / window.innerWidth) * 2 - 1,
      -(this.input.pointerY / window.innerHeight) * 2 + 1,
    );
    _raio.setFromCamera(_ndc, this.camera);

    _planoDoChao.constant = -this.court.floorY;
    if (_raio.ray.intersectPlane(_planoDoChao, _pontoDoChao)) {
      this.court.limitarMiraDoJogador(_pontoDoChao, oposto(this.side), this.pontoDeMira);
    } else {
      this.alvoPadrao(this.pontoDeMira);
    }
  }
}
