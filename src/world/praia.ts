import * as THREE from 'three';

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

export const PRAIA: LugarDeQuadra[] = [
  { id: 'central', nome: 'CENTRAL', posicao: new THREE.Vector3(0, 0, 0), rotacao: 0 },
  { id: 'leste', nome: 'LESTE', posicao: new THREE.Vector3(ESPACAMENTO, 0, 0), rotacao: 0 },
  { id: 'oeste', nome: 'OESTE', posicao: new THREE.Vector3(-ESPACAMENTO, 0, 0), rotacao: 0 },
];
