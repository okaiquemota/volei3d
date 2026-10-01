import * as THREE from 'three';
import { CLIPE_DO_TOQUE, camadaDoCorpo, clipeDoCorpo, type EstadoDoCorpo } from './animacoes';
import { DE_UMA_VEZ, PesNaCanela } from './poses';
import type { Motor } from './Motor';

const _andar = new THREE.Vector3();

/**
 * O pouso: quanto dura o amortecimento, e que voo pede um.
 *
 * A janela e' a duracao do clipe `Aterrissagem` menos a mistura de saida,
 * senao ele acaba parado no ultimo quadro antes de soltar. O voo minimo corta
 * o que nao e' salto: um quadro fora do chao num degrau de ponto flutuante
 * nao pode fazer o boneco agachar.
 */
const JANELA_DO_POUSO = 0.26;
const VOO_QUE_POUSA = 0.2;

/**
 * Toca a animacao do corpo, e faz a transicao entre elas.
 *
 * A transicao e' o ponto. Trocar de clipe de um quadro pro outro da' um
 * estalo no corpo inteiro — e como este jogo troca de clipe toda vez que o
 * atleta muda de direcao, e ele muda de direcao o tempo todo, o estalo seria
 * constante. `fadeIn`/`fadeOut` cruzam os dois por um instante e o passo
 * continua.
 *
 * Nao decide NADA: o que tocar sai de `clipeDoCorpo`, que e' pura e tem teste.
 * Aqui so' mora o `AnimationMixer`, que e' estado do three.
 */

/** Segundos da mistura entre dois clipes. Curto: o jogo e' rapido. */
const CRUZAMENTO = 0.18;

/**
 * A mistura de entrada de um GESTO, bem mais curta.
 *
 * Todo gesto comeca na pose do CONTATO — ver `poses.ts`, que explica por que.
 * A mistura e' o que faz o braco chegar la', e ela e' o atraso entre a bola
 * sair e a mao alcancar a bola. A 0,18 s dava quase 11 quadros de mao atrasada,
 * visivel. A 0,06 s o braco estala pra pose e o golpe le' como seco, que e'
 * como um ataque de verdade se parece.
 */
const CRUZAMENTO_DO_GESTO = 0.06;
const GESTOS: ReadonlySet<string> = new Set(Object.values(CLIPE_DO_TOQUE));

/**
 * A do pouso, no meio das duas. O pe' toca a areia num quadro so', e um
 * amortecimento que leva 0,18 s pra chegar chegaria depois de acabado; a
 * 0,06 os bracos cairiam do alto do pulo num estalo.
 */
const CRUZAMENTO_DO_POUSO = 0.08;

/**
 * O peso da CAMADA contra o clipe de baixo.
 *
 * O mixer do three nao tem mascara por osso: ele faz a media ponderada de
 * todo clipe ativo em cada osso. A camada so' escreve bracos e peito, entao
 * nas pernas o clipe de baixo continua sozinho (peso 1 de 1); nos bracos, 10
 * contra 1 da' 91% da camada — a mao segura a bola e ainda balanca um fio com
 * o passo, que e' o que uma mao de verdade faz.
 */
const PESO_DA_CAMADA = 10;

/** Os ciclos de andar: trocar entre eles continua o passo, e nao recomeca. */
const CICLOS: ReadonlySet<string> = new Set(['Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right']);

/**
 * Em que ponto de cada ciclo o pe' esquerdo pisa, de 0 a 1. Por clipe, e
 * medido uma vez por familia (`medirPassos`).
 *
 * Os ciclos do pack NAO comecam no mesmo ponto do passo: o esquerdo pisa a
 * 0,59 do `Run` e a 0,12 do `Run_Left`. Continuar o passo pela fase crua
 * trocaria o pe' de apoio no meio da mistura; pela pisada, o pe' que estava
 * no chao continua no chao.
 */
const PISADA = new WeakMap<THREE.AnimationClip, number>();

/**
 * Mede a pisada de cada ciclo, no esqueleto em repouso, e devolve o repouso.
 * Roda uma vez por familia, onde as clipes nascem (`Corpos.deArquivos`).
 */
export function medirPassos(raiz: THREE.Object3D, clipes: readonly THREE.AnimationClip[]): void {
  const pe = raiz.getObjectByName('FootL');
  if (!pe) return;
  const mixer = new THREE.AnimationMixer(raiz);
  const p = new THREE.Vector3();
  for (const clipe of clipes) {
    if (!CICLOS.has(clipe.name)) continue;
    const acao = mixer.clipAction(clipe).play();
    let menor = Infinity;
    let pisada = 0;
    for (let i = 0; i < 60; i++) {
      mixer.setTime((clipe.duration * i) / 60);
      raiz.updateMatrixWorld(true);
      const y = pe.getWorldPosition(p).y;
      if (y < menor) { menor = y; pisada = i / 60; }
    }
    PISADA.set(clipe, pisada);
    acao.stop();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(raiz);
  raiz.updateMatrixWorld(true);
}

export class Animador {
  private readonly mixer: THREE.AnimationMixer;
  private readonly acoes = new Map<string, THREE.AnimationAction>();
  private atual: THREE.AnimationAction | null = null;
  private nomeAtual = '';
  /**
   * O peso de cada clipe do corpo que ainda esta' na mistura, de 0 a 1.
   *
   * Mantido aqui, e nao pelo `fadeIn`/`fadeOut` do three, por causa de quem
   * aperta varias teclas juntas: o clipe troca de novo antes da mistura
   * anterior acabar. O `fadeOut` do three comeca SEMPRE do peso 1 — um clipe
   * que estava entrando a 30% saltava pra 100% so' pra comecar a sair — e o
   * `reset` de um clipe que estava saindo o jogava pra 0. Medido: o pe' pulava
   * 49 cm de um quadro pro outro. Aqui cada peso anda do ponto em que esta', e
   * os pesos somam sempre 1 (somando menos, o mixer completa com a pose de
   * repouso, que e' torta).
   */
  private readonly pesos = new Map<THREE.AnimationAction, number>();
  /** Quanto o peso anda por segundo, na mistura de agora. */
  private ritmo = 1 / CRUZAMENTO;
  private marcaTocada = -1;
  private camada: THREE.AnimationAction | null = null;
  private nomeDaCamada: string | null = null;
  private readonly pes: PesNaCanela;

  constructor(private readonly raiz: THREE.Object3D, clipes: readonly THREE.AnimationClip[]) {
    // Antes do mixer: os pes sao medidos no repouso.
    this.pes = new PesNaCanela(raiz);
    this.mixer = new THREE.AnimationMixer(raiz);
    for (const clipe of clipes) {
      const acao = this.mixer.clipAction(clipe);

      /**
       * Os clipes escritos a mao tocam UMA VEZ e param no ultimo quadro; os do
       * pack andam em ciclo.
       *
       * Nos gestos e' obvio — um acompanhamento em ciclo viraria tique. Em
       * `Pulo` e `Mergulho` e' menos: o ultimo quadro DELES e' a pose de
       * manter, e voltar ao inicio no meio do voo seria o corpo se recolhendo
       * sozinho no ar.
       */
      if (DE_UMA_VEZ.has(clipe.name)) {
        acao.setLoop(THREE.LoopOnce, 1);
        acao.clampWhenFinished = true;
      }

      this.acoes.set(clipe.name, acao);
    }
  }

  /**
   * Um quadro. `estado` vem do Motor; o dt e' o do JOGO.
   *
   * Em camera lenta o corpo tem que andar lento junto — animacao no tempo do
   * relogio com o mundo em 35% seria o boneco correndo no lugar.
   */
  update(estado: EstadoDoCorpo, dt: number): void {
    /**
     * Um toque NOVO reinicia o clipe mesmo sendo o mesmo clipe.
     *
     * Duas manchetes seguidas dao o mesmo nome, e sem esta marca a segunda nao
     * tocaria: `trocar` sai na primeira linha quando o nome nao muda, e o clipe
     * de uma vez ja' estaria parado no ultimo quadro. O defeito seria a segunda
     * bola do rally sair de um corpo imovel.
     */
    const reiniciar = estado.gesto !== null && estado.marcaDoGesto !== this.marcaTocada;
    if (estado.gesto !== null) this.marcaTocada = estado.marcaDoGesto;

    this.trocar(clipeDoCorpo(estado, this.nomeAtual), reiniciar);
    this.trocarCamada(camadaDoCorpo(estado));
    this.misturar(dt);
    this.mixer.update(dt);
    // Depois do mixer, sempre: e' a mistura que separa o pe' da canela.
    this.pes.aplicar();
  }

  /**
   * Liga, troca ou desliga a camada de cima.
   *
   * Sai rapido (a mistura do gesto) porque quem a desliga quase sempre e' um
   * gesto comecando — o saque — e a mao que segurava tem que largar a bola no
   * mesmo instante em que o braco de bater sobe.
   */
  private trocarCamada(nome: string | null): void {
    if (nome === this.nomeDaCamada) return;
    this.camada?.fadeOut(CRUZAMENTO_DO_GESTO);
    this.camada = nome ? this.acoes.get(nome) ?? null : null;
    this.camada?.reset().setEffectiveTimeScale(1).setEffectiveWeight(PESO_DA_CAMADA).fadeIn(CRUZAMENTO).play();
    this.nomeDaCamada = nome;
  }

  private trocar(nome: string, reiniciar = false): void {
    if (nome === this.nomeAtual && !reiniciar) return;

    /**
     * Clipe que nao existe cai no `Idle`.
     *
     * O nome vem de uma tabela escrita a mao contra um pack especifico. Trocar
     * o modelo por outro com outros nomes nao pode deixar o atleta congelado
     * numa pose: melhor ele ficar parado de pe' e obviamente errado do que
     * sumir numa T-pose.
     */
    const proxima = this.acoes.get(nome) ?? this.acoes.get('Idle');
    if (!proxima) return;

    if (proxima === this.atual) {
      // Mesmo clipe de novo: so' rebobina, sem mistura. Misturar um clipe com
      // ele mesmo nao faz nada.
      if (reiniciar) proxima.reset().play();
      this.nomeAtual = nome;
      return;
    }

    const mistura = GESTOS.has(nome) ? CRUZAMENTO_DO_GESTO
      : nome === 'Aterrissagem' ? CRUZAMENTO_DO_POUSO
      : CRUZAMENTO;
    this.ritmo = 1 / mistura;

    /**
     * O clipe que volta pra mistura antes de ter saido dela CONTINUA de onde
     * estava, com o peso que tinha — um ciclo de andar nao recomeca no meio
     * do passo. Os de uma vez (pulo, gesto) recomecam: cada um e' um evento.
     */
    const vinhaSaindo = this.pesos.has(proxima);
    if (!vinhaSaindo || DE_UMA_VEZ.has(proxima.getClip().name)) {
      proxima.reset().play();
      /**
       * De um ciclo de andar pra outro, o passo CONTINUA: o clipe novo entra
       * no mesmo ponto da pisada em que o velho estava. Recomecar do zero a
       * cada troca de direcao fazia as pernas pularem pra outra fase do passo.
       */
      if (this.atual && CICLOS.has(nome) && CICLOS.has(this.nomeAtual)) {
        const velho = this.atual.getClip();
        const novo = proxima.getClip();
        const fase = this.atual.time / velho.duration - (PISADA.get(velho) ?? 0) + (PISADA.get(novo) ?? 0);
        proxima.time = (((fase % 1) + 1) % 1) * novo.duration;
      }
    }
    if (!vinhaSaindo) this.pesos.set(proxima, 0);

    this.atual = proxima;
    this.nomeAtual = nome;
  }

  /**
   * Um passo da mistura: os outros clipes descem juntos, cada um na proporcao
   * do peso que tem, e o atual fica com o que eles soltaram. A soma e' 1 por
   * construcao — normalizar depois amplificava o passo justamente quando a
   * soma estava longe de 1 — e nenhum peso anda mais que `ritmo` por segundo.
   * O que chega a zero sai do mixer.
   */
  private misturar(dt: number): void {
    const atual = this.atual;
    if (!atual) return;
    let outros = 0;
    for (const [acao, peso] of this.pesos) if (acao !== atual) outros += peso;
    const restam = Math.max(0, outros - dt * this.ritmo);
    const escala = outros > 0 ? restam / outros : 0;
    for (const [acao, peso] of this.pesos) {
      if (acao === atual) continue;
      const novo = peso * escala;
      if (novo <= 1e-4) {
        acao.stop();
        this.pesos.delete(acao);
        continue;
      }
      this.pesos.set(acao, novo);
      acao.setEffectiveWeight(novo);
    }
    let soma = 0;
    for (const [acao, peso] of this.pesos) if (acao !== atual) soma += peso;
    this.pesos.set(atual, 1 - soma);
    atual.setEffectiveWeight(1 - soma);
  }

  /** O peso de cada clipe do corpo na mistura de agora. Pro teste. */
  pesosDoCorpo(): Map<string, number> {
    const pesos = new Map<string, number>();
    for (const acao of this.pesos.keys()) pesos.set(acao.getClip().name, acao.getEffectiveWeight());
    return pesos;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.raiz);
  }
}

/**
 * Le o `Motor` no formato que `clipeDoCorpo` espera.
 *
 * Mora aqui, e nao no atleta, porque quem anda pela areia usa o mesmo Motor e
 * as mesmas animacoes — e a conta do angulo e' o tipo de coisa que, duplicada,
 * fica certa num lugar e invertida no outro.
 *
 * NAO mexe em `gesto`, `marcaDoGesto` nem `segurandoBola`: toque e saque nao
 * sao assunto do Motor, sao do `Hitter` e do `Match`. Quem tem um preenche
 * depois; o banhista deixa como esta'.
 */
export function estadoDoMotor(motor: Motor, out: EstadoDoCorpo): EstadoDoCorpo {
  _andar.copy(motor.velocidadeHorizontal);
  const velocidade = _andar.length();
  const f = motor.frente;

  out.noChao = motor.noChao;
  out.mergulhando = motor.mergulhando;
  out.levantando = motor.levantando;
  out.velocidade = velocidade;
  out.pousando = motor.tempoNoChao < JANELA_DO_POUSO && motor.ultimoVoo >= VOO_QUE_POUSA;

  /**
   * `atan2(cruz, escalar)` devolve angulo COM SINAL, de -pi a pi, e o sinal e'
   * o que separa andar pra direita de andar pra esquerda. Um `acos` do escalar
   * daria o angulo certo e sem sinal, e os dois lados tocariam o mesmo clipe.
   *
   * O cruzamento em Y de dois vetores horizontais e' `f.z*v.x - f.x*v.z`, e ele
   * da' positivo pra ESQUERDA de quem olha, nao pra direita. Conferir: com o
   * corpo virado pra +Z, a direita dele e' -X (a mesma conta do `controle.ts`),
   * e a formula devolve -1 nesse caso.
   *
   * Por isso o sinal vira aqui, e nao la' em `clipeDoCorpo`: o contrato daquela
   * funcao — "positivo e' a direita" — e' o que os testes fixam, e quem estava
   * errado era o leitor. O sintoma tambem nao se confessa: apertar D tocava
   * `Run_Left`, e um boneco de passo cruzado le' como "meio estranho".
   */
  out.anguloDoAndar = velocidade < 1e-3 ? 0
    : Math.atan2(f.x * _andar.z - f.z * _andar.x, f.x * _andar.x + f.z * _andar.z);

  return out;
}
