import * as THREE from 'three';
import { COLORS, COURT, REDE } from '../config';
import { AABB } from '../core/math';
import { Court } from './Court';
import { POUSO_NA_AREIA } from './chao';

/**
 * Geometria da quadra: linhas e postes.
 *
 * A REDE nao esta' aqui desde que virou pano (`buildRede` + `TecidoDaRede`):
 * esta' em todos os cenarios, e este desenho some quando a quadra e' de modelo.
 * Daqui sai so' a saia invisivel embaixo dela.
 *
 * A AREIA nao esta' aqui — ela e' o chao do mundo, e vive em `buildBeach`.
 * Uma laje de 400 m por quadra seria tres lajes coplanares numa praia de tres
 * quadras.
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
  /** A saia invisivel abaixo da malha. A malha e a fita sao de `REDE`, e cedem. */
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

  // ---------------------------------------------------------------- linhas
  const matLinha = guardar(new THREE.MeshStandardMaterial({
    color: COLORS.line,
    roughness: 0.95,
    metalness: 0,
  }));

  const LINHA_ESPESSURA = 0.02;
  const LINHA_Y = POUSO_NA_AREIA + LINHA_ESPESSURA / 2;
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

  // ---------------------------------------------------------------- saia
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
    rede.push(AABB.fromCenterSize(0, saiaAltura / 2, 0, REDE.meiaLargura * 2, saiaAltura, COURT.netThickness));
  }

  // ---------------------------------------------------------------- postes
  const matPoste = guardar(new THREE.MeshStandardMaterial({
    color: COLORS.post,
    roughness: 0.55,
    metalness: 0.3,
  }));
  const RAIO_POSTE = COURT.postRadius;
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
