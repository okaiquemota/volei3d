import * as THREE from 'three';
import { COURT } from '../config';

/**
 * A praia: onde cada quadra fica.
 *
 * Uma lista, e nada mais. Foi de proposito que ela e' so' dados: o Court ja'
 * resolve tudo em espaco LOCAL e converte pra mundo, entao posicionar uma
 * quadra nunca exigiu mais que uma posicao e um angulo. Toda a "preparacao pro
 * mundo aberto" que o prototipo em Unity documentava se paga aqui.
 *
 * As quadras ficam LADO A LADO no eixo X, com a mesma orientacao. Girar cada
 * uma um pouco seria mais organico, mas um jogador que troca de quadra perderia
 * a referencia de qual lado e' o dele a cada troca — e ler o campo e' metade do
 * jogo.
 */
export interface LugarDeQuadra {
  id: string;
  nome: string;
  posicao: THREE.Vector3;
  /** Radianos em torno de Y. */
  rotacao: number;
}

/**
 * Espacamento entre quadras.
 *
 * A quadra tem 8 m de largura e 4 m de zona livre de cada lado: 16 m de area
 * ocupada. 26 m deixa 10 m de areia entre uma e outra — o bastante pra elas
 * lerem como quadras separadas e nao como uma so' listrada.
 */
const ESPACAMENTO = 26;

/**
 * As quadras, na ordem em que aparecem na tela da esquerda pra direita.
 *
 * O leste fica em X NEGATIVO, o que parece errado e nao e'. A camera olha pra
 * +Z, e quem olha pra +Z tem +X a' ESQUERDA — e' o mesmo motivo pelo qual
 * `cross(frente, cima)` devolve -X e o A/D nao levam negate. Entao a direita da
 * tela e' -X: apertar D anda pra -X, e `]` vai pra arenas[1].
 *
 * Batizar a direita de leste e' o que faz as tres coisas concordarem: andar
 * pra direita, avancar na lista e ir pro leste sao o mesmo movimento. Com os
 * nomes trocados, cada uma apontaria pra um lado.
 */
export const PRAIA: LugarDeQuadra[] = [
  { id: 'central', nome: 'CENTRAL', posicao: new THREE.Vector3(0, 0, 0), rotacao: 0 },
  { id: 'leste', nome: 'LESTE', posicao: new THREE.Vector3(-ESPACAMENTO, 0, 0), rotacao: 0 },
  { id: 'oeste', nome: 'OESTE', posicao: new THREE.Vector3(ESPACAMENTO, 0, 0), rotacao: 0 },
];

/**
 * Ate' onde da' pra andar, em meias-medidas a partir do centro da praia.
 *
 * Sai da propria lista acima, nao de um numero escolhido a dedo: a quadra mais
 * distante, mais a area de jogo dela, mais uma faixa de areia. Acrescentar uma
 * quadra no leste empurra o limite junto, sem ninguem lembrar de mexer aqui.
 *
 * Vale porque as quadras estao todas com `rotacao: 0` e enfileiradas no X. Se
 * alguma girar, esta caixa deixa de descrever a praia e o limite passa a ser
 * por quadra.
 */
const MARGEM = 10;

const extremo = (eixo: 'x' | 'z'): number =>
  PRAIA.reduce((maior, lugar) => Math.max(maior, Math.abs(lugar.posicao[eixo])), 0);

export const LIMITE_DA_PRAIA = {
  x: extremo('x') + COURT.width / 2 + COURT.freeZone + MARGEM,
  z: extremo('z') + COURT.length / 2 + COURT.freeZone + MARGEM,
};
