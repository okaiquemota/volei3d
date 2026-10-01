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
 * O corpo montado e' UMA malha, com UM esqueleto e UM material — e nao as
 * pecas como vem do arquivo, uma malha por material. Daquele jeito eram uma
 * duzia de malhas por corpo, cada uma desenhada duas vezes por quadro (a
 * imagem e a sombra), cada peca com um esqueleto pra atualizar: 82 malhas de
 * pele na praia, e mais de 150 dos 167 desenhos do quadro. Junto, e' um
 * desenho por corpo e por passe. O que deixa juntar sem perder nada: o pack
 * inteiro usa o MESMO material (aspereza 0,5, sem metal, dos dois lados), e
 * o que muda de material pra material e' so' a cor — que vira cor de vertice.
 *
 * O cuidado todo esta' no espaco dos vertices. Cada peca vem de um arquivo,
 * com a malha comprimida numa escala propria (quantizacao), e a matriz inversa
 * de cada osso ajustada pra desfazer essa escala — por isso cada peca tinha o
 * esqueleto dela. Pra dividir um so', cada peca e' levada uma vez pro mesmo
 * espaco: o do osso Root em repouso, que e' a raiz do corpo. Medido, nas
 * duas familias: assim normalizadas, as inversas das 250 pecas concordam osso
 * a osso (todas foram ligadas na mesma pose). Peca que discordar ganha
 * entradas proprias no esqueleto (`ligar`), em vez de sair torta.
 */

/** Um arquivo do pack ja' lido pelo GLTFLoader. */
export interface ArquivoDeCorpo {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** Os vertices de uma peca com o mesmo material: pintados da mesma cor. */
interface Fatia {
  material: string;
  /** A cor que o pack deu ao material. */
  cor: THREE.Color;
  inicio: number;
  fim: number;
  /** A cor por vertice que o arquivo traz em algumas pecas: multiplica a do material. */
  tinta: Float32Array | null;
}

/** Uma peca convertida pro espaco da familia, pronta pra entrar num corpo. */
interface PecaPronta {
  /** O nome da malha no arquivo: e' por ele que o teste confere as pecas. */
  malha: string;
  posicoes: Float32Array;
  normais: Int16Array;
  /** Quatro por vertice, ja' no indice do esqueleto da familia. */
  ossos: Uint16Array;
  pesos: Uint8Array;
  /** Contados a partir do primeiro vertice da peca. */
  indices: Uint32Array;
  fatias: Fatia[];
}

interface FamiliaPronta {
  /** A base sem malha nenhuma: e' o que cada corpo copia. */
  esqueleto: THREE.Object3D;
  animacoes: THREE.AnimationClip[];
  /** `fonte/peca` -> o no da peca no arquivo (uma malha, ou um grupo delas). */
  partes: Map<string, THREE.Object3D>;
  /** As mesmas, convertidas na primeira vez que um corpo as usa. */
  prontas: Map<string, PecaPronta>;
  /** O repouso de cada osso, em metros da raiz. */
  repouso: Map<string, THREE.Matrix4>;
  /**
   * O esqueleto de pele: o osso de cada indice, e a inversa dele. Um osso so'
   * aparece duas vezes se alguma peca foi ligada a ele numa pose diferente.
   */
  ossos: string[];
  inversas: THREE.Matrix4[];
  /** A inversa ja' veio de um osso que alguma peca usa? Senao pode ser trocada. */
  conferida: boolean[];
}

/** O osso que define o espaco comum: a raiz do esqueleto, nos pes. */
const OSSO_DE_REFERENCIA = 'Root';
/** Quanto duas inversas podem diferir e ainda ser a mesma (0,1 mm no vertice). */
const TOLERANCIA = 1e-4;
/** O nome da malha do corpo montado. */
export const MALHA_DO_CORPO = 'corpo';

/**
 * A esfera de corte do corpo, em metros da raiz (os pes).
 *
 * Com ela o corpo sai do desenho quando sai do quadro — antes ia pra GPU
 * sempre, mesmo do outro lado da praia. E' fixa, e nao calculada: o three
 * calcularia uma vez, na pose em que o corpo estivesse, e um braco esticado
 * depois sairia dela — o atleta piscaria na borda da tela. Medido nos 21
 * corpos, em todas as clipes: nada passa de 1,15 m do centro. A folga cobre o
 * que a clipe nao mostra (mistura, olhar, pe' preso na canela); o tombo do
 * mergulho gira a raiz, e a esfera gira junto.
 */
export const ESFERA_DO_CORPO: Readonly<THREE.Sphere> = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.5);

const ehCabelo = (nome: string): boolean => /^(Hair|Moustache)/.test(nome);
const IDENTIDADE = new THREE.Matrix4();
const _cor = new THREE.Color();

export class Corpos {
  private readonly geometrias = new Set<THREE.BufferGeometry>();
  private readonly materiais = new Set<THREE.Material>();
  /** A pele como o pack pinta, e o tom mais escuro dela (labio, sombra). */
  private readonly razaoDaPeleEscura = new THREE.Color(0.8, 0.8, 0.8);
  /** O material de todo corpo: o do pack, com a cor vindo do vertice. */
  private readonly material: THREE.MeshStandardMaterial;

  private constructor(
    private readonly familias: Readonly<Record<Familia, FamiliaPronta>>,
    molde: THREE.MeshStandardMaterial,
  ) {
    this.material = molde.clone();
    this.material.name = MALHA_DO_CORPO;
    this.material.color.setRGB(1, 1, 1);
    this.material.vertexColors = true;
  }

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
    const geometrias = new Set<THREE.BufferGeometry>();
    const materiais = new Set<THREE.Material>();

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
          no.traverse((o) => {
            const malha = o as THREE.Mesh;
            if (!malha.isMesh) return;
            geometrias.add(malha.geometry);
            for (const m of [malha.material].flat()) materiais.add(m);
          });
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
      const repouso = new Map<string, THREE.Matrix4>();
      esqueleto.traverse((o) => { if ((o as THREE.Bone).isBone) repouso.set(o.name, o.matrixWorld.clone()); });

      // As receitas foram afinadas no homem; a mulher e' posada com ele de
      // referencia (ver `apontar`, em poses.ts). O homem vem primeiro em FAMILIAS.
      const referencia = familia === 'masculino' ? undefined : prontas.masculino?.esqueleto;
      const animacoes = [...base.animations, ...montarClipes(esqueleto, RECEITAS, referencia)];
      medirPassos(esqueleto, animacoes);
      prontas[familia] = {
        esqueleto, animacoes, partes, repouso, prontas: new Map(), ossos: [], inversas: [], conferida: [],
      };
    }

    const molde = [...materiais].find((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
    if (!molde) throw new Error('o pack nao tem material de corpo');
    const corpos = new Corpos(prontas, molde as THREE.MeshStandardMaterial);
    for (const g of geometrias) corpos.geometrias.add(g);
    for (const m of materiais) corpos.materiais.add(m);
    corpos.medirPele();
    return corpos;
  }

  animacoes(familia: Familia): readonly THREE.AnimationClip[] {
    return this.familias[familia].animacoes;
  }

  /**
   * Um corpo novo: uma malha com geometria e esqueleto proprios.
   *
   * Esqueleto proprio porque dois atletas com o mesmo esqueleto fazem a mesma
   * pose o tempo todo — e o sintoma nao parece bug de montagem, parece a IA
   * copiando o jogador. Geometria propria porque a cor e' do vertice, e a cor
   * e' por corpo. O material e' um so' pra todos: um shader, compilado uma vez.
   */
  montar(v: Visual): THREE.Object3D {
    const familia = this.familias[v.familia];
    const raiz = familia.esqueleto.clone(true);
    const ossos = new Map<string, THREE.Bone>();
    raiz.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o as THREE.Bone); });

    const escolhidas: Array<[Peca | 'acessorio', string]> = PECAS.map((p) => [p, v[p]]);
    if (v.acessorio) escolhidas.push(['acessorio', v.acessorio]);
    const pecas = escolhidas.map(([peca, id]) => {
      const parte = parteDe(v.familia, id, peca);
      if (!parte) throw new Error(`nao existe ${peca} de ${v.familia}/${id}`);
      return { peca, principal: parte.principal, pronta: this.pecaPronta(familia, `${id}/${peca}`) };
    });

    let vertices = 0;
    let indices = 0;
    for (const { pronta } of pecas) {
      vertices += pronta.posicoes.length / 3;
      indices += pronta.indices.length;
    }
    const posicoes = new Float32Array(vertices * 3);
    const normais = new Int16Array(vertices * 3);
    const cores = new Uint16Array(vertices * 3);
    const indiceDoOsso = familia.ossos.length <= 256 ? new Uint8Array(vertices * 4) : new Uint16Array(vertices * 4);
    const pesos = new Uint8Array(vertices * 4);
    const indice = vertices <= 65536 ? new Uint16Array(indices) : new Uint32Array(indices);
    const fatias: Array<{ peca: Peca | 'acessorio'; material: string; inicio: number; fim: number }> = [];

    let base = 0;
    let k = 0;
    for (const { peca, principal, pronta } of pecas) {
      posicoes.set(pronta.posicoes, base * 3);
      normais.set(pronta.normais, base * 3);
      indiceDoOsso.set(pronta.ossos, base * 4);
      pesos.set(pronta.pesos, base * 4);
      for (let i = 0; i < pronta.indices.length; i++) indice[k + i] = pronta.indices[i]! + base;
      for (const fatia of pronta.fatias) {
        const cor = this.corDa(fatia, peca, principal, v);
        for (let i = fatia.inicio; i < fatia.fim; i++) {
          const o = (base + i) * 3;
          const t = fatia.tinta;
          const j = (i - fatia.inicio) * 3;
          cores[o] = canal(cor.r * (t ? t[j]! : 1));
          cores[o + 1] = canal(cor.g * (t ? t[j + 1]! : 1));
          cores[o + 2] = canal(cor.b * (t ? t[j + 2]! : 1));
        }
        fatias.push({ peca, material: fatia.material, inicio: base + fatia.inicio, fim: base + fatia.fim });
      }
      base += pronta.posicoes.length / 3;
      k += pronta.indices.length;
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
    geometria.setAttribute('normal', new THREE.BufferAttribute(normais, 3, true));
    // Cor LINEAR, como a do material era. Em 8 bits o linear perde os escuros
    // (cabelo preto, pele escura); em 16 sobra.
    geometria.setAttribute('color', new THREE.BufferAttribute(cores, 3, true));
    geometria.setAttribute('skinIndex', new THREE.BufferAttribute(indiceDoOsso, 4));
    geometria.setAttribute('skinWeight', new THREE.BufferAttribute(pesos, 4, true));
    geometria.setIndex(new THREE.BufferAttribute(indice, 1));

    const malha = new THREE.SkinnedMesh(geometria, this.material);
    malha.name = MALHA_DO_CORPO;
    malha.castShadow = true;
    malha.boundingSphere = ESFERA_DO_CORPO.clone();
    malha.userData = { pecas: pecas.map((p) => p.pronta.malha), fatias };
    raiz.add(malha);
    // A malha esta' na raiz e os vertices estao em metros da raiz: a matriz
    // de ligacao e' a identidade.
    malha.bind(new THREE.Skeleton(familia.ossos.map((n) => ossos.get(n)!), familia.inversas.slice()), IDENTIDADE);

    raiz.updateMatrixWorld(true);
    return raiz;
  }

  /** Descarta um corpo montado: so' o que e' dele (geometria e esqueleto). */
  static descartar(corpo: THREE.Object3D): void {
    corpo.traverse((o) => {
      const malha = o as THREE.SkinnedMesh;
      if (!malha.isSkinnedMesh) return;
      malha.geometry.dispose();
      malha.skeleton.dispose();
    });
  }

  dispose(): void {
    for (const g of this.geometrias) g.dispose();
    for (const m of this.materiais) m.dispose();
    this.material.dispose();
  }

  /**
   * A cor de um material, no corpo `v`.
   *
   * Pele, cabelo, e o material principal da camisa e da calca (`principal`,
   * no catalogo); o resto fica como o pack desenhou. Devolve uma cor de
   * trabalho: copie antes de chamar de novo.
   */
  private corDa(fatia: Fatia, peca: Peca | 'acessorio', principal: string | null, v: Visual): THREE.Color {
    const nome = fatia.material;
    const cor = _cor.copy(fatia.cor);
    if (nome === 'Skin') cor.setHex(v.pele);
    else if (nome === 'Skin_Darker') cor.setHex(v.pele).multiply(this.razaoDaPeleEscura);
    else if (v.cabelo !== null && ehCabelo(nome)) cor.setHex(v.cabelo);
    else if (v.cabelo !== null && nome === 'Eyebrows') cor.setHex(v.cabelo).multiplyScalar(0.55);
    else if (nome === principal && peca === 'tronco' && v.camisa !== null) cor.setHex(v.camisa);
    else if (nome === principal && peca === 'pernas' && v.calca !== null) cor.setHex(v.calca);
    return cor;
  }

  /**
   * A peca no espaco da familia, convertida na primeira vez que alguem usa.
   *
   * So' na primeira: sao ~90 pecas e um corpo usa quatro ou cinco. Converter
   * todas na chegada seria pagar de saida por pecas que talvez ninguem vista.
   */
  private pecaPronta(familia: FamiliaPronta, chave: string): PecaPronta {
    const feita = familia.prontas.get(chave);
    if (feita) return feita;
    const no = familia.partes.get(chave);
    if (!no) throw new Error(`a peca ${chave} nao foi carregada`);

    const malhas: THREE.SkinnedMesh[] = [];
    no.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(o as THREE.SkinnedMesh); });
    let vertices = 0;
    let indices = 0;
    for (const m of malhas) {
      vertices += m.geometry.getAttribute('position').count;
      indices += m.geometry.index?.count ?? m.geometry.getAttribute('position').count;
    }
    const pronta: PecaPronta = {
      malha: no.name,
      posicoes: new Float32Array(vertices * 3),
      normais: new Int16Array(vertices * 3),
      ossos: new Uint16Array(vertices * 4),
      pesos: new Uint8Array(vertices * 4),
      indices: new Uint32Array(indices),
      fatias: [],
    };

    let base = 0;
    let k = 0;
    for (const malha of malhas) {
      const g = malha.geometry;
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const posicao = g.getAttribute('position');
      const normal = g.getAttribute('normal');
      const osso = g.getAttribute('skinIndex');
      const peso = g.getAttribute('skinWeight');
      const tinta = g.getAttribute('color');
      const [paraComum, indiceNaFamilia] = this.ligar(familia, malha);
      /**
       * A normal vai pelo mesmo caminho do vertice, sem a translacao — e' o
       * que o shader faz com a pele (a matriz do osso direto na normal, e o
       * comprimento acertado depois). Hoje o caminho e' so' escala.
       */
      const m = paraComum.elements;
      const r = new THREE.Matrix3().setFromMatrix4(paraComum).elements;
      // Direto nos vetores: o acessor do three por componente custava 15 ms
      // por corpo novo, no meio do menu.
      const P = cru(posicao);
      const N = cru(normal);
      const O = cru(osso);
      const W = cru(peso);

      for (let i = 0; i < posicao.count; i++) {
        const o = (base + i) * 3;
        const x = ler(P, i, 0);
        const y = ler(P, i, 1);
        const z = ler(P, i, 2);
        const w = 1 / (m[3]! * x + m[7]! * y + m[11]! * z + m[15]!);
        pronta.posicoes[o] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * w;
        pronta.posicoes[o + 1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * w;
        pronta.posicoes[o + 2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * w;
        const a = ler(N, i, 0);
        const b = ler(N, i, 1);
        const c = ler(N, i, 2);
        const nx = r[0]! * a + r[3]! * b + r[6]! * c;
        const ny = r[1]! * a + r[4]! * b + r[7]! * c;
        const nz = r[2]! * a + r[5]! * b + r[8]! * c;
        const comprimento = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        pronta.normais[o] = Math.round((nx / comprimento) * 32767);
        pronta.normais[o + 1] = Math.round((ny / comprimento) * 32767);
        pronta.normais[o + 2] = Math.round((nz / comprimento) * 32767);
        for (let j = 0; j < 4; j++) {
          const peso = ler(W, i, j);
          pronta.pesos[(base + i) * 4 + j] = Math.round(peso * 255);
          pronta.ossos[(base + i) * 4 + j] = peso > 0 ? indiceNaFamilia[ler(O, i, j)]! : 0;
        }
      }

      const indiceLocal = g.index?.array;
      const n = indiceLocal?.length ?? posicao.count;
      for (let i = 0; i < n; i++) pronta.indices[k + i] = (indiceLocal ? indiceLocal[i]! : i) + base;

      const material = malha.material as THREE.MeshStandardMaterial;
      let cores: Float32Array | null = null;
      if (tinta && material.vertexColors) {
        const T = cru(tinta);
        cores = new Float32Array(posicao.count * 3);
        for (let i = 0; i < posicao.count; i++) {
          cores[i * 3] = ler(T, i, 0);
          cores[i * 3 + 1] = ler(T, i, 1);
          cores[i * 3 + 2] = ler(T, i, 2);
        }
      }
      pronta.fatias.push({ material: material.name, cor: material.color.clone(), inicio: base, fim: base + posicao.count, tinta: cores });

      base += posicao.count;
      k += n;
    }

    familia.prontas.set(chave, pronta);
    return pronta;
  }

  /**
   * Liga uma malha do arquivo ao esqueleto da familia.
   *
   * Devolve a matriz que leva os vertices dela pro espaco comum (o do Root em
   * repouso: desfaz a quantizacao), e o indice de cada osso dela no esqueleto
   * da familia. A inversa de cada osso, ja' no espaco comum, e' conferida com
   * a que a familia tem: igual (o normal), usa a da familia; diferente (peca
   * ligada noutra pose), entra como osso novo — o MESMO osso, outra inversa.
   */
  private ligar(familia: FamiliaPronta, malha: THREE.SkinnedMesh): [THREE.Matrix4, Uint16Array] {
    const { bones, boneInverses } = malha.skeleton;
    const doVertice = (i: number): THREE.Matrix4 => new THREE.Matrix4().multiplyMatrices(boneInverses[i]!, malha.bindMatrix);
    const r = bones.findIndex((b) => b.name === OSSO_DE_REFERENCIA);
    const repouso = familia.repouso.get(OSSO_DE_REFERENCIA);
    if (r < 0 || !repouso) throw new Error(`${malha.name}: sem o osso ${OSSO_DE_REFERENCIA}`);
    const paraComum = repouso.clone().multiply(doVertice(r));
    const doComum = paraComum.clone().invert();

    const usados = new Set<number>();
    const osso = cru(malha.geometry.getAttribute('skinIndex'));
    const peso = cru(malha.geometry.getAttribute('skinWeight'));
    for (let i = 0; i < malha.geometry.getAttribute('skinIndex').count; i++) {
      for (let c = 0; c < 4; c++) if (ler(peso, i, c) > 0) usados.add(ler(osso, i, c));
    }

    const indice = new Uint16Array(bones.length);
    for (let i = 0; i < bones.length; i++) {
      const nome = bones[i]!.name;
      if (!familia.repouso.has(nome)) throw new Error(`${malha.name}: osso ${nome} nao existe na base`);
      const inversa = doVertice(i).multiply(doComum);
      const usado = usados.has(i);
      let j = familia.ossos.findIndex((n, x) => n === nome && (!usado || !familia.conferida[x] || perto(familia.inversas[x]!, inversa)));
      if (j < 0) {
        j = familia.ossos.length;
        familia.ossos.push(nome);
        familia.inversas.push(inversa);
        familia.conferida.push(usado);
      } else if (usado && !familia.conferida[j]) {
        // A que estava ali veio de um osso que ninguem usava: vale esta.
        familia.inversas[j] = inversa;
        familia.conferida[j] = true;
      }
      indice[i] = j;
    }
    return [paraComum, indice];
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

/**
 * Os numeros de um atributo do arquivo como estao no vetor: de quanto em
 * quanto anda um vertice, onde comeca, e como desfazer a normalizacao.
 */
interface Cru {
  v: Float32Array;
  passo: number;
  inicio: number;
  escala: number;
  minimo: number;
}

function cru(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Cru {
  const intercalado = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
  const v = (intercalado ? (a as THREE.InterleavedBufferAttribute).data.array : (a as THREE.BufferAttribute).array) as ArrayLike<number>;
  const maximo = v instanceof Int8Array ? 127 : v instanceof Uint8Array ? 255 : v instanceof Int16Array ? 32767
    : v instanceof Uint16Array ? 65535 : v instanceof Int32Array ? 2147483647 : v instanceof Uint32Array ? 4294967295 : 1;
  const comSinal = v instanceof Int8Array || v instanceof Int16Array || v instanceof Int32Array;
  return {
    // Tudo em Float32Array, copiado pelo proprio navegador: um tipo so' de
    // vetor e' o que deixa o laco de leitura rapido (com Int16, Int8 e Uint8
    // misturados no mesmo `ler`, cada leitura custava dez vezes mais).
    v: v instanceof Float32Array ? v : new Float32Array(v),
    passo: intercalado ? (a as THREE.InterleavedBufferAttribute).data.stride : a.itemSize,
    inicio: intercalado ? (a as THREE.InterleavedBufferAttribute).offset : 0,
    escala: a.normalized ? 1 / maximo : 1,
    // O mesmo corte do `denormalize` do three: -128/127 vira -1, nao -1,008.
    minimo: a.normalized && comSinal ? -1 : -Infinity,
  };
}

/** O componente `c` do vertice `i`, ja' sem a normalizacao. */
const ler = (a: Cru, i: number, c: number): number => Math.max(a.v[a.inicio + i * a.passo + c]! * a.escala, a.minimo);

const perto = (a: THREE.Matrix4, b: THREE.Matrix4): boolean =>
  a.elements.every((x, i) => Math.abs(x - b.elements[i]!) < TOLERANCIA);

/** Um canal de cor linear em 16 bits. */
const canal = (x: number): number => Math.round(Math.min(Math.max(x, 0), 1) * 65535);

/** As pecas que um corpo vai ter: o teste confere que o montado bate com isto. */
export function malhasDoVisual(v: Visual): string[] {
  const nomes = PECAS.map((p) => parteDe(v.familia, v[p], p)!.malha);
  if (v.acessorio) nomes.push(parteDe(v.familia, v.acessorio, 'acessorio')!.malha);
  return nomes;
}
