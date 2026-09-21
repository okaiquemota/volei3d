import * as THREE from 'three';
import { COLORS } from '../config';
import { criarAreia, escalarUVsDaCaixa } from './textures';

export interface PraiaConstruida {
  root: THREE.Group;
  descartaveis: Array<{ dispose(): void }>;
  /**
   * Troca a cara do chao entre os tres cenarios.
   *
   * O chao e' UM pra praia inteira, entao isto vale pras tres quadras e pra
   * quem anda na areia — o cenario e' do MUNDO, nao de uma arena. Trocar so' o
   * pedaco em volta de uma quadra exigiria recortar a laje, e ela existe
   * justamente pra nao ter recorte nenhum.
   */
  usarPiso(tipo: TipoDePiso): void;
}

/**
 * Os tres chaos, e por que sao tres e nao dois.
 *
 * Eram dois enquanto os cenarios eram dois, e o parametro era um booleano
 * `claro`. O ESTADIO nao cabe em nenhum dos dois: nao e' praia, e tambem nao e'
 * o branco chapado do estudio — ali dentro o chao e' PISO DE ARENA, iluminado
 * como qualquer superficie, porque tem arquibancada projetando sombra em volta
 * e um fundo branco sem luz mataria o volume todo.
 *
 *   areia    a praia: textura, relevo, cor quente.
 *   estudio  o QUADRA: branco chapado que E' o fundo, sem luz nenhuma.
 *   arena    o ESTADIO: concreto liso, iluminado, sem textura de grao.
 */
export type TipoDePiso = 'areia' | 'estudio' | 'arena';

/**
 * O chao do mundo. UM, pra praia inteira.
 *
 * A areia nasceu dentro da quadra, e enquanto havia uma quadra so' isso estava
 * certo: quadra e chao eram a mesma coisa. Com tres quadras virou erro —
 * `construirQuadra` desenhava uma laje de 400 m POR arena, tres lajes
 * coplanares empilhadas no mesmo y. A conta de desenhos nao acusa (sao tres
 * meshes de sempre), mas a GPU pinta a tela inteira de areia tres vezes por
 * quadro, com textura e normal map, e guarda tres copias das texturas.
 *
 * O chao e' do MUNDO, nao da quadra. A quadra desenha o que e' dela: linhas,
 * rede e postes.
 *
 * A areia visivel e' muito maior que a area de jogo, e isso e' deliberado. A
 * laje do prototipo em Unity era a quadra + zona livre + 2 m de sobra: 18 por
 * 26 metros. Do ponto de vista da camera, a areia acabava a treze metros e
 * virava ceu — a quadra lia como um tapete voador, nao como uma praia. Nao e'
 * erro de medida: e' que a medida certa pro JOGO nao e' a medida certa pra
 * IMAGEM. Entao a areia desenhada vai bem alem da nevoa, que come o fim dela.
 *
 * Nada disso toca em regra: os limites de corrida e de bola dentro/fora saem do
 * Court, e o limite de quem passeia sai da praia.
 */
export function construirPraia(): PraiaConstruida {
  const root = new THREE.Group();
  const descartaveis: Array<{ dispose(): void }> = [];

  const guardar = <T extends { dispose(): void }>(x: T): T => {
    descartaveis.push(x);
    return x;
  };

  const areia = criarAreia();
  descartaveis.push(areia.map, areia.normalMap);

  const LADO = 400; // alem do alcance da nevoa: a borda nunca aparece
  const ESPESSURA = 0.5;

  const geo = guardar(new THREE.BoxGeometry(LADO, ESPESSURA, LADO));
  // Textura medida em metros: um grao de areia tem o mesmo tamanho em qualquer peca.
  escalarUVsDaCaixa(geo, LADO, ESPESSURA, LADO, 2);
  areia.map.repeat.set(1, 1);
  areia.normalMap.repeat.set(1, 1);

  const material = guardar(new THREE.MeshStandardMaterial({
    map: areia.map,
    normalMap: areia.normalMap,
    normalScale: new THREE.Vector2(areia.relevo, areia.relevo),
    color: COLORS.sand,
    roughness: 0.97,
    metalness: 0,
  }));

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -ESPESSURA / 2;
  mesh.receiveShadow = true;
  root.add(mesh);

  const usarPiso = (tipo: TipoDePiso): void => {
    const claro = tipo === 'estudio';
    /**
     * Pra ser branco de verdade, o chao para de ser ILUMINADO.
     *
     * Tres coisas tinham que sair juntas, e cada uma sozinha deixava o chao
     * cinza:
     *
     *   o MAPA    a cor da areia mora na textura, nao no `color`. Tintar de
     *             branco por cima devolve areia lavada.
     *   a LUZ     `color` e' resposta a' luz, e a luz de ceu daqui e' azulada:
     *             branco vezes azul-acinzentado da' cinza. Zerando o `color`, o
     *             material deixa de responder a luz nenhuma.
     *   o RELEVO  so' existe pra modular luz. Sem luz ele nao faz nada.
     *
     * O branco sai do `emissive`, que e' cor que o material EMITE e nao cor que
     * ele reflete — chapada, igual em todo ponto, e exatamente o mesmo valor do
     * fundo e da nevoa. E' assim que o chao e o ceu viram uma coisa so'.
     *
     * O que se perde e' a sombra NESTE chao. Nao custa nada aqui: o atleta joga
     * dentro da quadra, e ali a sombra cai na laje do modelo, que continua
     * iluminada.
     */
    const naAreia = tipo === 'areia';
    material.map = naAreia ? areia.map : null;
    material.normalScale.setScalar(naAreia ? areia.relevo : 0);
    /**
     * O piso de arena e' o unico dos tres que e' cor LISA E ILUMINADA.
     *
     * A areia tira a cor da textura; o estudio desliga a luz pra ser branco de
     * verdade. A arena quer o meio: cinza de concreto que responde ao sol e a'
     * sombra, senao o chao em volta da quadra vira um recorte chapado debaixo
     * de uma arquibancada com volume.
     */
    material.color.setHex(claro ? 0x000000 : naAreia ? COLORS.sand : COLORS.pisoDaArena);
    material.emissive.setHex(claro ? COLORS.brancoDaQuadra : 0x000000);

    /**
     * Branco chapado tem que PULAR o tone mapping, como o fundo pula.
     *
     * `scene.background` nao passa pela curva; um material passa. Com ACES no
     * renderer, o mesmo 0xffffff sai 255 no fundo e 231 no chao — e o horizonte
     * sujo que este cenario existe pra nao ter volta, agora por outra porta.
     *
     * Este chao NAO e' uma superficie iluminada: ele E' o fundo, continuado pra
     * baixo do horizonte. Entao a regra dele e' a do fundo.
     */
    material.toneMapped = !claro;
    // Trocar mapa muda o PROGRAMA do shader. Sem isto o three reaproveita o
    // anterior e a troca simplesmente nao aparece.
    material.needsUpdate = true;
  };

  return { root, descartaveis, usarPiso };
}
