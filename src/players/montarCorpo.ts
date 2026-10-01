import * as THREE from 'three';
import { CATALOGO, FAMILIAS, PECAS, parteDe, type Familia, type Peca, type Visual } from './corpos';
import { medirPassos } from './Animador';
import { montarClipes, RECEITAS } from './poses';

/**
 * Monta o corpo de um `Visual` com as pecas do pack.
 *
 * Segunda pele, como sempre foi: o `Motor` diz onde o corpo esta' e pra onde
 * ele olha, o `Hitter` mede alcance a partir dos pes. Nenhuma regra sabe de
 * que pecas o boneco e' feito.
 *
 * A montagem em si e' pequena, e o cuidado todo esta' num detalhe: cada peca
 * vem de um arquivo diferente, com o esqueleto DELE. Pra cabeca de um andar
 * junto com o tronco de outro, toda peca e' religada a um esqueleto so' — a
 * base da familia, copiada uma vez por corpo. Os ossos tem os mesmos nomes e a
 * mesma ordem nos 21 personagens, e o repouso e' o mesmo dentro da familia.
 *
 * O que NAO pode ser compartilhado e' a matriz inversa de cada osso: a
 * compressao do arquivo (quantizacao) guarda a malha numa escala propria por
 * peca, e quem desfaz isso e' a inversa DAQUELA peca. Por isso cada uma leva a
 * sua — com a de outra peca, a malha sai do tamanho errado.
 */

/** Um arquivo do pack ja' lido pelo GLTFLoader. */
export interface ArquivoDeCorpo {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

interface FamiliaPronta {
  /** A base sem malha nenhuma: e' o que cada corpo copia. */
  esqueleto: THREE.Object3D;
  animacoes: THREE.AnimationClip[];
  /** `fonte/peca` -> o no da peca (uma malha, ou um grupo delas). */
  partes: Map<string, THREE.Object3D>;
}

const ehCabelo = (nome: string): boolean => /^(Hair|Moustache)/.test(nome);

export class Corpos {
  private readonly geometrias = new Set<THREE.BufferGeometry>();
  private readonly materiais = new Set<THREE.Material>();
  /** A pele como o pack pinta, e o tom mais escuro dela (labio, sombra). */
  private readonly razaoDaPeleEscura = new THREE.Color(0.8, 0.8, 0.8);

  private constructor(private readonly familias: Readonly<Record<Familia, FamiliaPronta>>) {}

  /**
   * Prepara as duas familias a partir dos arquivos lidos.
   *
   * O arquivo BASE de cada familia (o que tem as animacoes) da' o esqueleto e
   * as clipes — as do pack MAIS as escritas a mao (`poses.ts`), que sao
   * resolvidas contra o esqueleto de verdade e por isso saem aqui, uma vez
   * por familia: o joelho da mulher nao tem o mesmo eixo que o do homem.
   */
  static deArquivos(arquivos: Readonly<Record<Familia, Readonly<Record<string, ArquivoDeCorpo>>>>): Corpos {
    const prontas = {} as Record<Familia, FamiliaPronta>;
    const corpos = new Corpos(prontas);

    for (const familia of FAMILIAS) {
      const catalogo = CATALOGO[familia];
      const base = arquivos[familia][catalogo.base];
      if (!base) throw new Error(`falta o corpo base ${familia}/${catalogo.base}`);

      const partes = new Map<string, THREE.Object3D>();
      for (const [id, fonte] of Object.entries(catalogo.fontes)) {
        const arquivo = arquivos[familia][id];
        if (!arquivo) throw new Error(`falta o corpo ${familia}/${id}`);
        arquivo.scene.updateMatrixWorld(true);
        for (const [peca, parte] of Object.entries(fonte.partes)) {
          const no = arquivo.scene.getObjectByName(parte.malha);
          if (!no) throw new Error(`${familia}/${id}: a malha ${parte.malha} nao esta' no arquivo`);
          partes.set(`${id}/${peca}`, no);
          corpos.guardar(no);
        }
      }

      const esqueleto = base.scene.clone(true);
      const malhas: THREE.Object3D[] = [];
      esqueleto.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas.push(o); });
      for (const m of malhas) m.removeFromParent();
      // Grupos que ficaram vazios (malha de varios materiais vira grupo no loader).
      const vazios: THREE.Object3D[] = [];
      esqueleto.traverse((o) => { if (o.type === 'Group' && o !== esqueleto && o.children.length === 0) vazios.push(o); });
      for (const v of vazios) v.removeFromParent();
      esqueleto.updateMatrixWorld(true);

      // As receitas foram afinadas no homem; a mulher e' posada com ele de
      // referencia (ver `apontar`, em poses.ts). O homem vem primeiro em FAMILIAS.
      const referencia = familia === 'masculino' ? undefined : prontas.masculino?.esqueleto;
      const animacoes = [...base.animations, ...montarClipes(esqueleto, RECEITAS, referencia)];
      medirPassos(esqueleto, animacoes);
      prontas[familia] = { esqueleto, animacoes, partes };
    }

    corpos.medirPele();
    return corpos;
  }

  animacoes(familia: Familia): readonly THREE.AnimationClip[] {
    return this.familias[familia].animacoes;
  }

  /**
   * Um corpo novo, com esqueleto proprio e materiais proprios.
   *
   * Esqueleto proprio porque dois atletas com o mesmo esqueleto fazem a mesma
   * pose o tempo todo — e o sintoma nao parece bug de montagem, parece a IA
   * copiando o jogador. Material proprio porque a cor e' por corpo. A
   * geometria e' a mesma pra todos.
   */
  montar(v: Visual): THREE.Object3D {
    const familia = this.familias[v.familia];
    const raiz = familia.esqueleto.clone(true);
    const ossos = new Map<string, THREE.Bone>();
    raiz.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o as THREE.Bone); });

    const pecas: Array<[Peca | 'acessorio', string]> = PECAS.map((p) => [p, v[p]]);
    if (v.acessorio) pecas.push(['acessorio', v.acessorio]);

    for (const [peca, id] of pecas) {
      const original = familia.partes.get(`${id}/${peca}`);
      const parte = parteDe(v.familia, id, peca);
      if (!original || !parte) throw new Error(`nao existe ${peca} de ${v.familia}/${id}`);

      const copia = original.clone(true);
      const esqueletos = new Map<THREE.Matrix4[], THREE.Skeleton>();
      copia.traverse((o) => {
        const malha = o as THREE.SkinnedMesh;
        if (!malha.isSkinnedMesh) return;
        let esqueleto = esqueletos.get(malha.skeleton.boneInverses);
        if (!esqueleto) {
          esqueleto = new THREE.Skeleton(
            malha.skeleton.bones.map((b) => {
              const osso = ossos.get(b.name);
              if (!osso) throw new Error(`${v.familia}/${id}: osso ${b.name} nao existe na base`);
              return osso;
            }),
            malha.skeleton.boneInverses,
          );
          esqueletos.set(malha.skeleton.boneInverses, esqueleto);
        }
        malha.bind(esqueleto, malha.bindMatrix);

        malha.castShadow = true;
        /**
         * A caixa de corte sai da pose de REPOUSO, e um braco esticado num
         * mergulho sai dela. Sem isto o atleta pisca fora da tela quando a
         * caixa antiga deixa o quadro e a nova ainda nao existe.
         */
        malha.frustumCulled = false;
        const lista = Array.isArray(malha.material) ? malha.material : [malha.material];
        const pintados = lista.map((m) => this.pintar(m as THREE.MeshStandardMaterial, peca, parte.principal, v, lista));
        malha.material = Array.isArray(malha.material) ? pintados : pintados[0]!;
      });

      const pai = raiz.getObjectByName(original.parent?.name ?? '') ?? raiz;
      pai.add(copia);
    }

    raiz.updateMatrixWorld(true);
    return raiz;
  }

  /** Descarta um corpo montado: so' o que e' dele (material e esqueleto). */
  static descartar(corpo: THREE.Object3D): void {
    const esqueletos = new Set<THREE.Skeleton>();
    corpo.traverse((o) => {
      const malha = o as THREE.SkinnedMesh;
      if (!malha.isMesh) return;
      for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) m.dispose();
      if (malha.isSkinnedMesh) esqueletos.add(malha.skeleton);
    });
    for (const e of esqueletos) e.dispose();
  }

  dispose(): void {
    for (const g of this.geometrias) g.dispose();
    for (const m of this.materiais) m.dispose();
  }

  /**
   * A cor de cada material, numa copia.
   *
   * So' COR: trocar material inteiro seria shader novo pra compilar no meio
   * da partida. Pele, cabelo, e o material principal da camisa e da calca
   * (`principal`, no catalogo); o resto fica como o pack desenhou.
   */
  private pintar(
    m: THREE.MeshStandardMaterial,
    peca: Peca | 'acessorio',
    principal: string | null,
    v: Visual,
    irmaos: readonly THREE.Material[],
  ): THREE.MeshStandardMaterial {
    const novo = m.clone();
    if (m.name === 'Skin') novo.color.setHex(v.pele);
    else if (m.name === 'Skin_Darker') novo.color.setHex(v.pele).multiply(this.razaoDaPeleEscura);
    else if (v.cabelo !== null && ehCabelo(m.name)) {
      novo.color.setHex(v.cabelo);
      // Cabeca com dois tons de cabelo (mecha, luz): o mais claro continua
      // mais claro, senao o penteado vira um bloco liso.
      const escuro = irmaos
        .filter((i) => ehCabelo(i.name))
        .map((i) => (i as THREE.MeshStandardMaterial).color)
        .reduce((a, b) => (luz(a) <= luz(b) ? a : b));
      if (luz(m.color) > luz(escuro) + 0.02) novo.color.lerp(BRANCO, 0.35);
    } else if (v.cabelo !== null && m.name === 'Eyebrows') novo.color.setHex(v.cabelo).multiplyScalar(0.55);
    else if (m.name === principal && peca === 'tronco' && v.camisa !== null) novo.color.setHex(v.camisa);
    else if (m.name === principal && peca === 'pernas' && v.calca !== null) novo.color.setHex(v.calca);
    return novo;
  }

  private guardar(no: THREE.Object3D): void {
    no.traverse((o) => {
      const malha = o as THREE.Mesh;
      if (!malha.isMesh) return;
      this.geometrias.add(malha.geometry);
      for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) this.materiais.add(m);
    });
  }

  /** O pack tem um tom so' de pele, e um mais escuro em uma cabeca. Mede a razao. */
  private medirPele(): void {
    let pele: THREE.Color | null = null;
    let escura: THREE.Color | null = null;
    for (const m of this.materiais) {
      const c = (m as THREE.MeshStandardMaterial).color;
      if (m.name === 'Skin' && !pele) pele = c;
      if (m.name === 'Skin_Darker' && !escura) escura = c;
    }
    if (pele && escura) {
      this.razaoDaPeleEscura.setRGB(escura.r / pele.r, escura.g / pele.g, escura.b / pele.b);
    }
  }
}

const BRANCO = new THREE.Color(1, 1, 1);
const luz = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** As pecas que um corpo vai ter: o teste confere que o montado bate com isto. */
export function malhasDoVisual(v: Visual): string[] {
  const nomes = PECAS.map((p) => parteDe(v.familia, v[p], p)!.malha);
  if (v.acessorio) nomes.push(parteDe(v.familia, v.acessorio, 'acessorio')!.malha);
  return nomes;
}
