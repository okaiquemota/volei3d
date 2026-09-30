import * as THREE from 'three';
import { COLORS, COURT, REDE } from '../config';
import type { Court } from './Court';
import type { TecidoDaRede } from './tecidoDaRede';
import { criarRede } from './textures';

/**
 * O DESENHO da rede: a malha e a fita, seguindo o pano de `TecidoDaRede`.
 *
 * Mora fora do desenho da quadra (`buildCourt`) de proposito: aquele some
 * quando a quadra e' de modelo, e a rede tem que estar nos tres cenarios — e'
 * ela que reage a' bola. A rede que vem no modelo do ginasio e' escondida no
 * lugar (ver `buildQuadraModelo`).
 *
 * A malha e' uma grade com um vertice por ponto do pano; a fita e' uma caixa
 * fatiada na mesma quantidade de colunas, cujos vertices andam com a linha de
 * cima. Os dois so' mudam de posicao — nada de geometria nova por quadro.
 */
export interface RedeConstruida {
  root: THREE.Group;
  /** Copia o pano pro desenho. So' faz trabalho se o pano mudou. */
  atualizar(): void;
  dispose(): void;
}

export function construirRede(court: Court, tecido: TecidoDaRede): RedeConstruida {
  const root = new THREE.Group();
  root.applyMatrix4(court.matrix);

  // ---------------------------------------------------------------- malha
  const { colunas, linhas } = tecido;
  const n = colunas * linhas;
  const posicoes = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const i = tecido.indice(c, l);
      posicoes[i * 3] = tecido.x[i]!;
      posicoes[i * 3 + 1] = tecido.y[i]!;
      posicoes[i * 3 + 2] = 0;
      uvs[i * 2] = c / (colunas - 1);
      uvs[i * 2 + 1] = l / (linhas - 1);
    }
  }
  const indices: number[] = [];
  for (let l = 0; l < linhas - 1; l++) {
    for (let c = 0; c < colunas - 1; c++) {
      const a = tecido.indice(c, l);
      const b = tecido.indice(c + 1, l);
      const d = tecido.indice(c, l + 1);
      const e = tecido.indice(c + 1, l + 1);
      indices.push(a, b, e, a, e, d);
    }
  }
  const geoMalha = new THREE.BufferGeometry();
  const atributoPos = new THREE.BufferAttribute(posicoes, 3);
  atributoPos.setUsage(THREE.DynamicDrawUsage);
  geoMalha.setAttribute('position', atributoPos);
  geoMalha.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geoMalha.setIndex(indices);
  geoMalha.computeVertexNormals();

  /**
   * A mesma textura de cordao da rede antiga, com o mesmo tamanho de quadrado:
   * a caixa tinha 28 repeticoes em 8 m, e a malha agora vai de poste a poste.
   */
  const textura = criarRede();
  textura.repeat.set(Math.round(28 * (2 * REDE.meiaLargura) / COURT.width), 4);

  const matMalha = new THREE.MeshStandardMaterial({
    map: textura,
    // Alpha TEST, nao blend: a rede nao precisa de translucidez, e o teste
    // evita o problema de ordenacao contra a bola atras dela.
    alphaTest: 0.4,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });
  const malha = new THREE.Mesh(geoMalha, matMalha);
  malha.name = 'rede-malha';
  // O pano se mexe e a caixa de recorte e' a de repouso: sem isto, com a
  // barriga pra fora, a rede some de relance na borda da tela.
  malha.frustumCulled = false;
  root.add(malha);

  // ---------------------------------------------------------------- fita
  const geoFita = new THREE.BoxGeometry(2 * REDE.meiaLargura, 0.07, COURT.netThickness + 0.01, colunas - 1, 1, 1);
  const baseDaFita = Float32Array.from(geoFita.attributes.position!.array as Float32Array);
  (geoFita.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const matFita = new THREE.MeshStandardMaterial({ color: COLORS.line, roughness: 0.95, metalness: 0 });
  const fita = new THREE.Mesh(geoFita, matFita);
  fita.name = 'rede-fita';
  fita.position.y = COURT.netHeight - 0.035;
  fita.castShadow = true;
  fita.frustumCulled = false;
  root.add(fita);

  const atualizar = (): void => {
    if (!tecido.mudou) return;
    tecido.mudou = false;

    for (let i = 0; i < n; i++) posicoes[i * 3 + 2] = tecido.z[i]!;
    atributoPos.needsUpdate = true;
    geoMalha.computeVertexNormals();

    // A fita anda com a linha de cima, vertice por vertice, pelo x de cada um.
    const pf = geoFita.attributes.position as THREE.BufferAttribute;
    const arr = pf.array as Float32Array;
    for (let v = 0; v < pf.count; v++) {
      arr[v * 3 + 2] = baseDaFita[v * 3 + 2]! + tecido.zDaFita(baseDaFita[v * 3]!);
    }
    pf.needsUpdate = true;
  };

  return {
    root,
    atualizar,
    dispose(): void {
      geoMalha.dispose();
      geoFita.dispose();
      textura.dispose();
      matMalha.dispose();
      matFita.dispose();
    },
  };
}
