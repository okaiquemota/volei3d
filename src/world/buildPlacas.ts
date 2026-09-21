import * as THREE from 'three';
import { COURT } from '../config';
import { criarPlacas } from './textures';

/**
 * O anel de placas de propaganda em volta da quadra.
 *
 * Em CODIGO, e nao o que veio no modelo do estadio, e por duas razoes que so'
 * aparecem quando se olha:
 *
 * As UVs do anel do modelo sao inconsistentes na volta — num trecho a textura
 * sai espelhada e o texto le' de tras pra frente, noutro sai esticada ate'
 * virar uma faixa de cor chapada. Nenhuma textura conserta isso, porque o
 * defeito e' do mapeamento.
 *
 * E o anel de la' encolhia junto com o estadio, o que fazia dele a peca mais
 * proxima da quadra e, por tabela, o limite de quanto o estadio podia diminuir.
 * Este e' medido a partir da QUADRA: ele fica onde tem que ficar e o estadio
 * fica livre pra chegar mais perto.
 */

/** A folga entre o fim da zona livre e a placa. Um atleta no limite nao encosta. */
const FOLGA = 0.5;

/** Altura da fita e do quanto ela sai do chao. Medida de placa de verdade. */
const ALTURA = 0.9;
const PE = 0.04;

/**
 * Quantas placas cabem em um metro de fita.
 *
 * A textura tem seis anunciantes; a repeticao e' escolhida pra caber um numero
 * INTEIRO deles em cada lado, senao o ultimo aparece cortado ao meio na quina.
 */
const PLACAS_POR_LADO = { comprido: 2, curto: 1 };

export interface PlacasConstruidas {
  root: THREE.Group;
  dispose(): void;
}

export function construirPlacas(): PlacasConstruidas {
  const root = new THREE.Group();
  root.name = 'placas';

  const textura = criarPlacas();
  const material = new THREE.MeshStandardMaterial({
    map: textura,
    emissive: 0xffffff,
    emissiveMap: textura,
    /**
     * Acima de 1 a fita le' como ACESA e nao como pintada — e' placa de LED.
     * Muito acima ela estoura em branco e o nome some.
     */
    emissiveIntensity: 1.25,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const meioX = COURT.width / 2 + COURT.freeZone + FOLGA;
  const meioZ = COURT.length / 2 + COURT.freeZone + FOLGA;
  const geometrias: THREE.BufferGeometry[] = [];

  /**
   * Uma placa por lado, virada pra DENTRO.
   *
   * O `repeat` em U conta quantas voltas da textura cabem naquele lado, e o
   * sinal negativo em X inverte a leitura: sem ele, as duas laterais mostram o
   * texto na mesma direcao e uma delas fica de tras pra frente — que e'
   * exatamente o defeito do anel do modelo.
   */
  const lado = (largura: number, x: number, z: number, giro: number, voltas: number): void => {
    const geo = new THREE.PlaneGeometry(largura, ALTURA);
    geometrias.push(geo);
    const malha = new THREE.Mesh(geo, material.clone());
    (malha.material as THREE.MeshStandardMaterial).map = textura.clone();
    (malha.material as THREE.MeshStandardMaterial).emissiveMap =
      (malha.material as THREE.MeshStandardMaterial).map;
    const mapa = (malha.material as THREE.MeshStandardMaterial).map!;
    mapa.wrapS = THREE.RepeatWrapping;
    mapa.repeat.set(voltas, 1);
    mapa.needsUpdate = true;

    malha.position.set(x, PE + ALTURA / 2, z);
    malha.rotation.y = giro;
    malha.castShadow = false;
    malha.receiveShadow = false;
    root.add(malha);
  };

  const comprido = meioZ * 2;
  const curto = meioX * 2;
  lado(comprido, -meioX, 0, Math.PI / 2, PLACAS_POR_LADO.comprido);
  lado(comprido, meioX, 0, -Math.PI / 2, PLACAS_POR_LADO.comprido);
  lado(curto, 0, -meioZ, 0, PLACAS_POR_LADO.curto);
  lado(curto, 0, meioZ, Math.PI, PLACAS_POR_LADO.curto);

  return {
    root,
    dispose(): void {
      textura.dispose();
      material.dispose();
      for (const g of geometrias) g.dispose();
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        m?.map?.dispose();
        m?.dispose();
      });
    },
  };
}

/** Onde a placa fica, pro teste conferir que o estadio nao passa por cima. */
export const RAIO_DAS_PLACAS = {
  x: COURT.width / 2 + COURT.freeZone + FOLGA,
  z: COURT.length / 2 + COURT.freeZone + FOLGA,
};
