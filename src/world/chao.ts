/**
 * As convencoes de quem desenha NO CHAO.
 *
 * Quatro coisas disputam a mesma altura: a areia do mundo, as linhas
 * desenhadas por codigo, a pele de modelo da quadra e os marcadores de queda e
 * de mira. Todas sao praticamente coplanares, e a essa distancia o z-buffer nao
 * tem precisao pra decidir sozinho — quem ganha muda com a camera, com o
 * enquadramento e ate' com a distancia da quadra.
 *
 * Ja custou dois sintomas: o piso do modelo sumiu inteiro por brigar com a
 * areia, e depois os marcadores sumiram por brigar com o piso do modelo. Os dois
 * pareciam "nao carregou" e nenhum dos dois era.
 *
 * A ordem, de cima pra baixo, e' esta e mora aqui:
 *
 *   1. marcadores      dizem ONDE a bola cai. Se eles perdem, o jogo fica
 *                      injogavel na hora — vem antes de qualquer decoracao.
 *   2. pele de modelo   o piso da quadra escolhida no menu.
 *   3. linhas e areia   o que o jogo desenha por codigo.
 *
 * `polygonOffset` empurra no TESTE de profundidade sem mover geometria, que e'
 * o unico jeito de resolver isto sem mexer nas alturas — e mexer nas alturas
 * esbarra na fisica, que quica a bola em y = 0.
 */

/**
 * A que altura um desenho POUSA na areia.
 *
 * O chao do mundo esta' em y = 0, e qualquer coisa desenhada exatamente ali
 * pisca contra ele. Um milimetro resolve e e' invisivel — mas tem que ser O
 * MESMO milimetro em todo lugar, senao as linhas desenhadas e a pele de modelo
 * pousam em alturas diferentes e uma passa por dentro da outra.
 */
export const POUSO_NA_AREIA = 0.001;

/** Empurrao da pele de modelo: ganha da areia. */
export const EMPURRAO_DA_PELE = 1;

/**
 * Empurrao dos marcadores: ganha da pele.
 *
 * Maior que o da pele de proposito, e nao por seguranca: os dois numeros TEM
 * que ser diferentes, e este TEM que ser o maior. Iguais, volta a briga.
 */
export const EMPURRAO_DOS_MARCADORES = 4;

/**
 * Aplica o empurrao num material. `THREE.Material` sem o tipo, pra este modulo
 * nao arrastar o three inteiro so' por tres numeros.
 */
export function empurrarParaFrente(
  material: { polygonOffset: boolean; polygonOffsetFactor: number; polygonOffsetUnits: number },
  quanto: number,
): void {
  material.polygonOffset = true;
  material.polygonOffsetFactor = -quanto;
  material.polygonOffsetUnits = -quanto;
}
