import { TEMPO } from '../config';
import { clamp01 } from './math';

/**
 * O poder de camera lenta, e so' ele.
 *
 * Nao sabe o que e' bola, quadra nem tecla: recebe quanto tempo de RELOGIO
 * passou e se o jogador esta' pedindo o poder, e devolve por quanto multiplicar
 * o tempo do jogo neste quadro. Quem aplica a escala e' o `Game`, num lugar so'.
 *
 * E' logica pura, e por isso tem teste. Um recurso que drena e recarrega e' o
 * tipo de coisa que parece obvia e fica errada em silencio: gastar 2,5 segundos
 * ou 2,5 segundos de JOGO e' uma diferenca de 3x que ninguem ve' olhando, e
 * tremer no fim da barra e' um bug que so' aparece com o dedo no botao.
 */
export class Tempo {
  private carga = 1;
  private ligado = false;

  /**
   * Esvaziou e o dedo ainda nao saiu do botao.
   *
   * Sem isto, segurar o botao depois do fim faz o poder PISCAR: a barra
   * recarrega enquanto se segura, cruza o minimo, religa sozinha por meio
   * segundo, esvazia de novo. Quem gastou tem que soltar pra pedir de novo.
   */
  private travado = false;

  /** Quanto resta, de 0 a 1. E' o que a barra do HUD desenha. */
  get fracao(): number { return this.carga; }

  /** O mundo esta' lento agora? */
  get ativo(): boolean { return this.ligado; }

  /**
   * Um quadro.
   *
   * `dtReal` em segundos de relogio; devolve a escala do tempo de JOGO. Gastar
   * em tempo de relogio e' o que faz a barra durar o que ela promete: em tempo
   * de jogo, 2,5 segundos a 35% viveriam sete.
   */
  passo(dtReal: number, querLento: boolean): number {
    // Ligar pede um minimo; MANTER ligado nao. Os dois no mesmo teste fariam o
    // poder desligar sozinho a um quinto da barra, no meio de um toque.
    if (!querLento) {
      this.ligado = false;
      this.travado = false;
    } else if (!this.ligado && !this.travado) {
      this.ligado = this.carga >= TEMPO.minimoParaLigar;
    }

    if (!this.ligado) {
      this.carga = clamp01(this.carga + dtReal / TEMPO.recarga);
      return 1;
    }

    // A escala sai ANTES do desconto: o quadro em que a carga acaba ainda foi
    // vivido lento, e devolver 1 nele daria um tranco no ultimo quadro.
    this.carga = clamp01(this.carga - dtReal / TEMPO.duracao);
    if (this.carga <= 0) {
      this.ligado = false;
      this.travado = true;
    }
    return TEMPO.escala;
  }

  /** Volta ao cheio e desligado. Comeco de partida. */
  zerar(): void {
    this.carga = 1;
    this.ligado = false;
    this.travado = false;
  }
}
