import * as THREE from 'three';
import { COURT } from '../config';
import { POUSO_NA_AREIA } from './chao';

/**
 * Onde o modelo de quadra pousa em cima do campo logico.
 *
 * Separado do carregador de proposito: isto e' geometria pura sobre um
 * `Object3D`, e por isso TEM teste. O carregador nao pode ter — ele importa o
 * `.glb` por URL do Vite, que o Node nao resolve, e um `import` desses no topo
 * do arquivo fecha a porta do teste pro arquivo inteiro.
 *
 * E e' aqui que um modelo trocado passaria a mentir sem quebrar nada: as linhas
 * desenhadas saem do lugar, a fita desce abaixo do colisor, e o jogo continua
 * rodando com a tela discordando das regras.
 */

/** As pecas que a montagem precisa achar pelo nome, e pra que servem. */
const PECAS = {
  /** O piso com as linhas. 9 x 18 m — quadra oficial de INDOOR. */
  piso: 'Plane088',
  /** A malha e a fita. O topo dela e' a altura que a nossa rede tem que ter. */
  rede: 'Plane089',
} as const;

/**
 * O que sai do modelo, e por que.
 *
 * A regra geral e' nao mexer: o modelo vem inteiro, e a laje, os bancos e os
 * cones ficam. A excecao e' o que o JOGO ja' desenha — duas bolas em campo, uma
 * parada na areia, nao e' decoracao, e' o jogador procurando qual das duas esta'
 * em jogo.
 */
const ENFEITES_FORA = [
  /** Bola de enfeite, parada perto da rede. O jogo tem a sua, e ela se mexe. */
  'GeoSphere008',
] as const;

/** Tira do modelo o que compete com o que o jogo ja' desenha. */
export function tirarEnfeites(raiz: THREE.Object3D): void {
  for (const nome of ENFEITES_FORA) {
    const peca = raiz.getObjectByName(nome);
    peca?.removeFromParent();
  }
}

const _caixa = new THREE.Box3();
const _tamanho = new THREE.Vector3();
const _centro = new THREE.Vector3();

function medir(raiz: THREE.Object3D, nome: string): THREE.Box3 | null {
  const peca = raiz.getObjectByName(nome);
  return peca ? _caixa.setFromObject(peca).clone() : null;
}

/**
 * Encaixa o modelo no campo logico.
 *
 * Exportada pra ter teste: e' geometria pura sobre um `Object3D`, e e' onde um
 * modelo trocado passaria a mentir sem que nada quebrasse.
 *
 * Duas escalas, e nao uma, porque sao duas medidas diferentes que tem que bater:
 *
 *   XZ  as linhas. O modelo e' indoor (9 x 18 m) e o nosso campo e' de praia
 *       (8 x 16). Os dois sao 1:2, entao uma escala unica de 8/9 poe as linhas
 *       do desenho exatamente em cima das linhas que valem.
 *
 *   Y   a rede. A do modelo termina a 2,10 m; a nossa, que e' a que para a
 *       bola, esta' a 2,24. Escalando tudo por 8/9 a fita cairia pra 1,87 — 37
 *       cm ABAIXO do colisor, e a bola passaria por cima do desenho e bateria
 *       no nada. Um desenho que mente sobre onde a rede esta' e' pior que
 *       desenho nenhum.
 *
 * A diferenca entre as duas escalas e' de 20%, em postes e bancos que sao
 * caixas e cilindros. Ninguem ve'; todo mundo veria a bola atravessar a fita.
 */
export function encaixarNoCampo(raiz: THREE.Object3D): void {
  raiz.updateMatrixWorld(true);

  const piso = medir(raiz, PECAS.piso);
  const rede = medir(raiz, PECAS.rede);
  if (!piso || !rede) {
    // Modelo trocado por outro, com outros nomes. Melhor aparecer do tamanho
    // errado do que sumir sem dizer nada.
    console.warn(`quadra.glb: nao achei ${PECAS.piso}/${PECAS.rede}; indo sem encaixe`);
    return;
  }

  piso.getSize(_tamanho);
  const escalaXZ = COURT.width / _tamanho.x;
  const escalaY = COURT.netHeight / rede.max.y;

  /**
   * O piso do modelo POUSA na areia, e a laje fica enterrada.
   *
   * Nao ha' escolha sobre a altura: o chao da fisica e' y = 0, e e' nele que os
   * atletas correm e a bola quica. Pondo a laje por cima da areia, a quadra
   * desenhada subiria 60 cm e o jogo inteiro aconteceria dentro dela.
   *
   * O `POUSO_NA_AREIA` e' o mesmo milimetro que as linhas desenhadas usam, e e'
   * o que separa "em cima da areia" de "brigando com ela": na primeira tentativa
   * o piso foi pro y = 0 exato e sumiu inteiro — a areia ganhou a briga de z e
   * a quadra de modelo apareceu sem chao, so' rede, postes e bancos.
   *
   * A laje continua no modelo, debaixo da areia. Nao foi removida: pra ve-la
   * seria preciso abrir um buraco na praia, que e' assunto de quando o modo
   * estiver de pe'.
   */
  piso.getCenter(_centro);
  raiz.scale.set(escalaXZ, escalaY, escalaXZ);
  // Tudo aqui e' espaco LOCAL da quadra — quem poe no mundo e' o grupo que
  // recebe o `court.matrix`, igual a' quadra desenhada por codigo. Por isso o
  // chao e' `y = 0` e nao `court.floorY`: converter duas vezes poria a quadra
  // do meio da praia a 16 m de altura.
  raiz.position.set(
    -_centro.x * escalaXZ,
    POUSO_NA_AREIA - piso.min.y * escalaY,
    -_centro.z * escalaXZ,
  );
}
