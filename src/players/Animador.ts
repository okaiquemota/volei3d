import * as THREE from 'three';
import { clipeDoCorpo, type EstadoDoCorpo } from './animacoes';
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

export class Animador {
  private readonly mixer: THREE.AnimationMixer;
  private readonly acoes = new Map<string, THREE.AnimationAction>();
  private atual: THREE.AnimationAction | null = null;
  private nomeAtual = '';

  constructor(private readonly raiz: THREE.Object3D, clipes: readonly THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(raiz);
    for (const clipe of clipes) this.acoes.set(clipe.name, this.mixer.clipAction(clipe));
  }

  /**
   * Um quadro. `estado` vem do Motor; o dt e' o do JOGO.
   *
   * Em camera lenta o corpo tem que andar lento junto — animacao no tempo do
   * relogio com o mundo em 35% seria o boneco correndo no lugar.
   */
  update(estado: EstadoDoCorpo, dt: number): void {
    this.trocar(clipeDoCorpo(estado));
    this.mixer.update(dt);
  }

  private trocar(nome: string): void {
    if (nome === this.nomeAtual) return;

    /**
     * Clipe que nao existe cai no `Idle`.
     *
     * O nome vem de uma tabela escrita a mao contra um pack especifico. Trocar
     * o modelo por outro com outros nomes nao pode deixar o atleta congelado
     * numa pose: melhor ele ficar parado de pe' e obviamente errado do que
     * sumir numa T-pose.
     */
    const proxima = this.acoes.get(nome) ?? this.acoes.get('Idle');
    if (!proxima || proxima === this.atual) return;

    proxima.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CRUZAMENTO).play();
    this.atual?.fadeOut(CRUZAMENTO);

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
