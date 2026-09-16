import { ATAQUE } from '../config';
import { clamp } from '../core/math';

/** O que a barra de forca virou, na hora de bater. */
export interface LeituraDaCarga {
  /** Forca do golpe, de 0 a 1. E' o mesmo numero que a IA passa como `attackForce`. */
  forca: number;
  /** Erro de mira, em metros, que a batida ganha por causa do tempo. */
  erro: number;
  /** Soltou dentro da zona? */
  naZona: boolean;
  /** Soltou depois dela? */
  passou: boolean;
}

/**
 * Le a barra de forca como um QTE.
 *
 * `fracao` conta em multiplos de `tempoDeCarga`: 1 e' o topo da barra, e ela
 * segue ate' `cargaMaxima`, onde o golpe sai sozinho.
 *
 * Antes a barra era um acumulador que saturava no topo, e por isso nao decidia
 * nada — segurar mais nao mudava uma linha. Aqui ha' um ponto certo, e passar
 * dele custa: a forca despenca e a bola sai torta.
 *
 * Funcao pura, e por isso tem teste. O resto do toque depende de bola, quadra e
 * atleta; isto depende de um numero so'.
 */
export function lerCarga(fracao: number): LeituraDaCarga {
  const f = Math.max(0, fracao);

  // Antes da zona: a batida sai proporcional ao que se segurou, e apressada
  // demais ela tambem sai torta — quem bate de qualquer jeito nao mira.
  if (f < ATAQUE.zonaIdeal) {
    const parte = f / ATAQUE.zonaIdeal;
    return {
      forca: parte,
      erro: (1 - parte) * ATAQUE.erroApressado,
      naZona: false,
      passou: false,
    };
  }

  // A zona: da' o topo da barra, e e' o unico lugar onde a mira sai limpa.
  if (f <= 1) return { forca: 1, erro: 0, naZona: true, passou: false };

  /**
   * Passou.
   *
   * O excesso e' medido em relacao ao que sobra da barra depois do topo, entao
   * a queda e' a mesma tenha `cargaMaxima` o valor que tiver — mexer no teto
   * muda o TEMPO que se tem pra errar, e nao o tamanho do castigo.
   */
  const excesso = clamp((f - 1) / Math.max(0.01, ATAQUE.cargaMaxima - 1), 0, 1);
  return {
    forca: 1 - (1 - ATAQUE.perdaAoPassar) * excesso,
    erro: excesso * ATAQUE.erroAoPassar,
    naZona: false,
    passou: true,
  };
}
