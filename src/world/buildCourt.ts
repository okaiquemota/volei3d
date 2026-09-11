import * as THREE from 'three';
import { AMBIENTE, COLORS, COURT } from '../config';
import { AABB } from '../core/math';
import { Court } from './Court';
import { criarAreia, criarRede, escalarUVsDaCaixa } from './textures';

/**
 * Geometria da quadra: areia, linhas, rede, postes.
 *
 * A geometria VISUAL e os colisores saem dos mesmos numeros do config — mesma
 * disciplina do Level.buildProps() do rpk.fps. Nao ha' como o que se ve'
 * divergir do que colide, porque nao ha' duas listas.
 *
 * Os colisores ficam em espaco LOCAL da quadra: a bola converte a posicao dela
 * pra local uma vez por passo e testa tudo ali. Girar a quadra nao recalcula
 * colisor nenhum.
 */

export interface Colisores {
  /** Malha da rede + a saia invisivel abaixo dela. */
  rede: AABB[];
  /** Postes: (x, raio, altura). Cilindro vertical, testado no plano XZ. */
  postes: Array<{ x: number; raio: number; altura: number }>;
}

export interface QuadraConstruida {
  root: THREE.Group;
  colisores: Colisores;
  /** Tudo que precisa de dispose no fim. */
  descartaveis: Array<{ dispose(): void }>;
}

export function construirQuadra(court: Court): QuadraConstruida {
  const root = new THREE.Group();
  root.applyMatrix4(court.matrix);

  const descartaveis: Array<{ dispose(): void }> = [];
  const rede: AABB[] = [];
  const postes: Array<{ x: number; raio: number; altura: number }> = [];

  const guardar = <T extends { dispose(): void }>(x: T): T => {
    descartaveis.push(x);
    return x;
  };

  // ---------------------------------------------------------------- areia
  const areia = criarAreia();
  descartaveis.push(areia.map, areia.normalMap);

  /**
   * A areia visivel e' MUITO maior que a area de jogo, e isso e' deliberado.
   *
   * A laje do prototipo em Unity era a quadra + zona livre + 2 m de sobra: 18
   * por 26 metros. Do ponto de vista da camera, em terceira pessoa a 6 m de
   * altura, a areia acabava a treze metros e virava ceu — a quadra lia como um
   * tapete voador, nao como uma praia. Nao e' erro de medida: e' que a medida
   * certa pro JOGO nao e' a medida certa pra IMAGEM.
   *
   * Entao a areia desenhada vai a 160 m e a nevoa (no Game) come o fim dela.
   * Nada disso toca em regra: os limites de corrida e de bola dentro/fora saem
   * do Court, que segue com a zona livre de 4 m.
   */
  const LARGURA_DA_PRAIA = 500;   // alem do alcance da nevoa: a borda nunca aparece
  const PRAIA_ATRAS = 250;        // do fundo da quadra pra tras
  const LAJE_ESPESSURA = 0.5;

  /**
   * A areia vai ate' a ORLA, e nao alem.
   *
   * Na primeira versao ela era um quadrado de 400 m centrado na origem — e
   * passava por cima do mar inteiro. O mar existia, estava na cena, e nao
   * aparecia em quadro nenhum: coberto por baixo pela propria praia.
   */
  const lajeX = LARGURA_DA_PRAIA;
  const lajeZ = PRAIA_ATRAS + AMBIENTE.zDaOrla;
  const centroZ = (AMBIENTE.zDaOrla - PRAIA_ATRAS) / 2;

  const geoAreia = guardar(new THREE.BoxGeometry(lajeX, LAJE_ESPESSURA, lajeZ));
  // Textura medida em metros: um grao de areia tem o mesmo tamanho em qualquer peca.
  escalarUVsDaCaixa(geoAreia, lajeX, LAJE_ESPESSURA, lajeZ, 2);
  areia.map.repeat.set(1, 1);
  areia.normalMap.repeat.set(1, 1);

  const matAreia = guardar(new THREE.MeshStandardMaterial({
    map: areia.map,
    normalMap: areia.normalMap,
    normalScale: new THREE.Vector2(areia.relevo, areia.relevo),
    color: COLORS.sand,
    roughness: 0.97,
    metalness: 0,
  }));

  /**
   * Mancha larga por cima do grao fino — a mesma textura, em duas escalas.
   *
   * O grao repete a cada 2 metros, e isso e' certo: grao de areia TEM que ser
   * medido em centimetros. So' que uma superficie com uma unica frequencia le'
   * como plano pintado, por mais bem desenhado que seja o grao. E botar mancha
   * grande na mesma textura seria pior ainda: ela repetiria a cada 2 m, e
   * mancha repetida e' o que mais denuncia um tile (licao do rpk.fps).
   *
   * A saida e' amostrar o MESMO mapa uma segunda vez, numa escala muito maior.
   * Sai de graca — nenhuma textura nova, nenhum arquivo — e da' o desnivel de
   * areia seca e areia pisada que faz a praia parecer chao de verdade.
   */
  matAreia.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       vec3 mancha = texture2D(map, vMapUv * 0.035).rgb;
       // Centrada em 1: a mancha modula o albedo, nao o substitui.
       // 0.45 e' o ponto entre "plano pintado" e "areia suja": acima disso a
       // mancha vira nodoa e chama mais atencao que a quadra.
       diffuseColor.rgb *= mix(vec3(1.0), mancha / 0.86, 0.45);`,
    );
  };

  const meshAreia = new THREE.Mesh(geoAreia, matAreia);
  meshAreia.position.set(0, -LAJE_ESPESSURA / 2, centroZ);
  meshAreia.receiveShadow = true;
  root.add(meshAreia);

  // ---------------------------------------------------------------- linhas
  const matLinha = guardar(new THREE.MeshStandardMaterial({
    color: COLORS.line,
    roughness: 0.95,
    metalness: 0,
  }));

  const LINHA_Y = 0.011;
  const LINHA_ESPESSURA = 0.02;
  const geoLateral = guardar(new THREE.BoxGeometry(COURT.lineWidth, LINHA_ESPESSURA, COURT.length + COURT.lineWidth));
  const geoFundo = guardar(new THREE.BoxGeometry(COURT.width + COURT.lineWidth, LINHA_ESPESSURA, COURT.lineWidth));

  for (const sinal of [-1, 1]) {
    const lateral = new THREE.Mesh(geoLateral, matLinha);
    lateral.position.set(sinal * court.halfWidth, LINHA_Y, 0);
    root.add(lateral);

    const fundo = new THREE.Mesh(geoFundo, matLinha);
    fundo.position.set(0, LINHA_Y, sinal * court.halfLength);
    root.add(fundo);
  }

  // ---------------------------------------------------------------- rede
  const texRede = guardar(criarRede());
  texRede.repeat.set(28, 4);

  const matRede = guardar(new THREE.MeshStandardMaterial({
    map: texRede,
    // Alpha TEST, nao blend: a rede nao precisa de translucidez, e o teste
    // evita o problema de ordenacao contra a bola atras dela.
    alphaTest: 0.4,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  }));

  const malhaCentroY = COURT.netHeight - COURT.netDepth / 2;
  const geoMalha = guardar(new THREE.BoxGeometry(COURT.width, COURT.netDepth, COURT.netThickness));
  const malha = new THREE.Mesh(geoMalha, matRede);
  malha.position.y = malhaCentroY;
  root.add(malha);

  rede.push(AABB.fromCenterSize(0, malhaCentroY, 0, COURT.width, COURT.netDepth, COURT.netThickness));

  // Faixa branca do topo.
  const geoFaixa = guardar(new THREE.BoxGeometry(COURT.width, 0.07, COURT.netThickness + 0.01));
  const faixa = new THREE.Mesh(geoFaixa, matLinha);
  faixa.position.y = COURT.netHeight - 0.035;
  faixa.castShadow = true;
  root.add(faixa);

  /**
   * "Saia" invisivel abaixo da malha.
   *
   * Numa rede real a bola pode passar por baixo, e e' falta. No jogo isso so'
   * gera ponto confuso — a bola some sob a rede e reaparece do outro lado sem
   * que nada tenha acontecido na tela. Aqui ela bate e conta como toque na
   * rede, que e' a leitura que o jogador espera.
   */
  const saiaAltura = Math.max(0.01, COURT.netHeight - COURT.netDepth);
  if (saiaAltura > 0.02) {
    rede.push(AABB.fromCenterSize(0, saiaAltura / 2, 0, COURT.width, saiaAltura, COURT.netThickness));
  }

  // ---------------------------------------------------------------- postes
  const matPoste = guardar(new THREE.MeshStandardMaterial({
    color: COLORS.post,
    roughness: 0.55,
    metalness: 0.3,
  }));
  const RAIO_POSTE = 0.06;
  const geoPoste = guardar(new THREE.CylinderGeometry(RAIO_POSTE, RAIO_POSTE, COURT.postHeight, 12));

  const posteX = court.halfWidth + COURT.postOffset;
  for (const sinal of [-1, 1]) {
    const poste = new THREE.Mesh(geoPoste, matPoste);
    poste.position.set(sinal * posteX, COURT.postHeight / 2, 0);
    poste.castShadow = true;
    root.add(poste);

    postes.push({ x: sinal * posteX, raio: RAIO_POSTE, altura: COURT.postHeight });
  }

  return { root, colisores: { rede, postes }, descartaveis };
}
