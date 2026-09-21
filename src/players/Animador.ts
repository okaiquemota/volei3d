import * as THREE from 'three';
import { clipeDoCorpo, type EstadoDoCorpo } from './animacoes';
import { DE_UMA_VEZ } from './poses';
import type { Motor } from './Motor';

const _andar = new THREE.Vector3();

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

export class Animador {
  private readonly mixer: THREE.AnimationMixer;
  private readonly acoes = new Map<string, THREE.AnimationAction>();
  private atual: THREE.AnimationAction | null = null;
  private nomeAtual = '';
  private marcaTocada = -1;

  constructor(private readonly raiz: THREE.Object3D, clipes: readonly THREE.AnimationClip[]) {
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

    this.trocar(clipeDoCorpo(estado), reiniciar);
    this.mixer.update(dt);
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
      // ele mesmo nao faz nada, e o `fadeOut` abaixo zeraria o peso dele.
      if (reiniciar) proxima.reset().setEffectiveWeight(1).play();
      this.nomeAtual = nome;
      return;
    }

    const mistura = DE_UMA_VEZ.has(nome) && nome !== 'Pulo' && nome !== 'Mergulho'
      ? CRUZAMENTO_DO_GESTO : CRUZAMENTO;

    proxima.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(mistura).play();
    this.atual?.fadeOut(mistura);

    this.atual = proxima;
    this.nomeAtual = nome;
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
 * NAO mexe em `gesto` nem em `marcaDoGesto`: toque nao e' assunto do Motor, e'
 * do `Hitter`. Quem tem um preenche depois; o banhista deixa como esta'.
 */
export function estadoDoMotor(motor: Motor, out: EstadoDoCorpo): EstadoDoCorpo {
  _andar.copy(motor.velocidadeHorizontal);
  const velocidade = _andar.length();
  const f = motor.frente;

  out.noChao = motor.noChao;
  out.mergulhando = motor.mergulhando;
  out.levantando = motor.levantando;
  out.velocidade = velocidade;

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
