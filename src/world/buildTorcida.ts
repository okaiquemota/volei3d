import * as THREE from 'three';
import { ESTADIO } from '../config';

/**
 * A torcida na arquibancada.
 *
 * Os lugares NAO estao escritos aqui. Eles sao descobertos por raycast contra a
 * geometria dos degraus: uma grade de raios cai de cima, e onde o raio bate numa
 * superficie HORIZONTAL acima do chao, senta uma pessoa.
 *
 * E' mais trabalho que uma tabela de fileiras, e paga em duas moedas. A primeira
 * e' que a arquibancada deste modelo nao e' regular — tem degrau mais fundo,
 * escada no meio, canto chanfrado — e qualquer tabela erraria em algum trecho,
 * com gente boiando ou enterrada. A segunda e' `ESTADIO.escala`: ela ja' mudou
 * tres vezes nesta conversa, e uma tabela de fileiras teria que ser reescrita a
 * cada vez.
 *
 * Tudo vai num `InstancedMesh` so': mil pessoas custam UM desenho. Uma malha por
 * pessoa seriam mil, e a arquibancada sozinha passaria o jogo inteiro em
 * chamadas de desenho.
 */

/**
 * Os materiais que sao BANCO — onde a torcida senta.
 *
 * Sao os dois degraus de arquibancada do modelo, e nao a casca nem as escadas.
 * Limitar o raycast a eles deixa cada raio custar 1.400 triangulos em vez dos
 * 124 mil do estadio inteiro.
 *
 * Moram AQUI, e nao no carregador do estadio, pela regra de sempre: o
 * carregador importa o `.glb` por URL do Vite, e um `import` desses no topo do
 * arquivo fecha a porta do teste pro arquivo inteiro. Nome de material contra
 * um modelo de fora e' justamente o que precisa de teste.
 */
export const MATERIAIS_DE_BANCO: ReadonlySet<string> = new Set(['Material.030', 'Material.033']);

/** De onde os raios caem. Acima de qualquer coisa do estadio. */
const ALTURA_DO_RAIO = 40;

/** Abaixo disso e' chao de arena, e nao banco. Ninguem senta no piso de jogo. */
export const ALTURA_MINIMA = 0.45;

/** O cosseno do quanto a superficie pode inclinar e ainda ser assento. */
const HORIZONTAL = 0.9;

/**
 * As cores de camisa.
 *
 * Metade puxa pro azul e pro laranja dos times — arquibancada de jogo tem lado
 * — e o resto e' roupa de gente comum, que e' o que impede o conjunto de virar
 * uma bandeira de duas cores.
 */
const CAMISAS = [
  0x2f6fd0, 0x2f6fd0, 0x1b62c8, 0x5b9bec,
  0xe2542f, 0xe2542f, 0xe08a3c, 0xf7c23a,
  0xf2f2ef, 0xd8d3c8, 0x3d4457, 0x18a89b,
  0x8c4a7a, 0x6b8f3a,
];

/** Tons de pele, pra cabeca nao sair toda da mesma cor. */
const PELES = [0xf0c8a0, 0xd9a273, 0xa9714a, 0x7a4b2a, 0x513024];

export interface TorcidaConstruida {
  root: THREE.Group;
  /** Quantos couberam. So' pra quem esta' medindo. */
  readonly quantidade: number;
  dispose(): void;
}

/**
 * Gerador com semente: a mesma arquibancada em toda partida.
 *
 * Sem isto, duas capturas do mesmo angulo nunca batem — e comparar antes e
 * depois de uma mudanca vira adivinhacao. E' a mesma razao da areia ter semente.
 */
function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Tronco e cabeca sao DUAS malhas, e nao uma so' juntada.
 *
 * Juntar sairia em um desenho em vez de dois, e custaria a cor: `instanceColor`
 * e' UMA cor por instancia, entao uma pessoa inteira numa geometria so' fica
 * monocromatica — mil pilulas coloridas. Com as duas separadas, a camisa e a
 * pele andam em listas proprias, e e' isso que faz a arquibancada ler como
 * gente e nao como textura. Dois desenhos pra mil pessoas continua barato.
 */
function pecasDoCorpo(altura: number): { tronco: THREE.BufferGeometry; cabeca: THREE.BufferGeometry } {
  /**
   * Contagem de faces no minimo: a torcida e' MIL corpos.
   *
   * Cada segmento a mais custa 833 vezes. Com 5 lados e o polo em 3 aneis o
   * corpo sai em ~50 triangulos e, a' distancia da arquibancada, ninguem ve' a
   * diferenca pra uma capsula lisa. A 6 e 4 a torcida sozinha passava de 60 mil
   * triangulos, mais da metade do estadio inteiro.
   */
  const tronco = new THREE.CapsuleGeometry(altura * 0.19, altura * 0.34, 1, 5);
  tronco.translate(0, altura * 0.34, 0);

  const cabeca = new THREE.SphereGeometry(altura * 0.14, 5, 3);
  cabeca.translate(0, altura * 0.72, 0);

  return { tronco, cabeca };
}

/**
 * Descobre os lugares e senta gente neles.
 *
 * `estadio` tem que estar com a matriz de mundo ATUALIZADA e na escala final —
 * o raycast le' `matrixWorld`, e um estadio medido antes de encolher poria a
 * torcida flutuando onde os degraus estavam.
 */
export function construirTorcida(estadio: THREE.Object3D): TorcidaConstruida {
  const bancos: THREE.Mesh[] = [];
  estadio.traverse((o) => {
    const malha = o as THREE.Mesh;
    if (!malha.isMesh) return;
    for (const m of Array.isArray(malha.material) ? malha.material : [malha.material]) {
      if (MATERIAIS_DE_BANCO.has(m.name)) { bancos.push(malha); return; }
    }
  });

  const root = new THREE.Group();
  root.name = 'torcida';
  const { passo, densidade, altura } = ESTADIO.torcida;

  const caixa = new THREE.Box3().setFromObject(estadio);
  const raio = new THREE.Raycaster();
  const deCima = new THREE.Vector3(0, -1, 0);
  const origem = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const rnd = aleatorio(20250921);

  const lugares: Array<{ p: THREE.Vector3; giro: number }> = [];

  for (let x = caixa.min.x; x <= caixa.max.x; x += passo) {
    for (let z = caixa.min.z; z <= caixa.max.z; z += passo) {
      if (rnd() > densidade) continue;

      // O sorteio vem ANTES do raycast: e' o filtro mais barato dos dois, e
      // pular o raio de quem nao vai sentar corta um terco do trabalho.
      origem.set(x + (rnd() - 0.5) * passo * 0.5, ALTURA_DO_RAIO, z + (rnd() - 0.5) * passo * 0.5);
      raio.set(origem, deCima);

      const batidas = raio.intersectObjects(bancos, false);
      const primeira = batidas[0];
      if (!primeira || primeira.point.y < ALTURA_MINIMA) continue;

      // So' senta em superficie plana. Sem isto a torcida escorre pela face
      // vertical do degrau e fica gente saindo do meio da parede.
      if (primeira.face) {
        normal.copy(primeira.face.normal)
          .transformDirection(primeira.object.matrixWorld);
        if (normal.y < HORIZONTAL) continue;
      }

      /**
       * Todo mundo olha pro centro, mais um desvio.
       *
       * Torcida perfeitamente alinhada le' como grade de soldados. O desvio de
       * ate' meio radiano e' o bastante pra quebrar a fileira sem ninguem
       * aparecer de costas pro jogo.
       */
      const paraOCentro = Math.atan2(-primeira.point.x, -primeira.point.z);
      lugares.push({ p: primeira.point.clone(), giro: paraOCentro + (rnd() - 0.5) * 0.5 });
    }
  }

  const quantos = Math.max(1, lugares.length);
  const { tronco, cabeca } = pecasDoCorpo(altura);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });

  const instanciar = (geo: THREE.BufferGeometry, nome: string): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, material, quantos);
    m.name = nome;
    m.castShadow = false;
    m.receiveShadow = false;
    // A caixa da torcida e' enorme e a camera chega perto da rede: sem isto a
    // arquibancada inteira some quando o centro dela sai do frustum.
    m.frustumCulled = false;
    return m;
  };

  const corpos = instanciar(tronco, 'torcida-corpos');
  const cabecas = instanciar(cabeca, 'torcida-cabecas');

  const m4 = new THREE.Matrix4();
  const giro = new THREE.Quaternion();
  const eixoY = new THREE.Vector3(0, 1, 0);
  const tamanho = new THREE.Vector3();
  const cor = new THREE.Color();

  lugares.forEach((lugar, i) => {
    /**
     * Um pouco de altura pra cada um, e sempre pra MENOS.
     *
     * Gente do mesmo tamanho na mesma fileira e' a coisa que mais denuncia
     * copia. Encolher, e nunca crescer, e' de proposito: quem cresce acaba com
     * a cabeca dentro do degrau de tras.
     */
    const escala = 1 - rnd() * 0.18;
    giro.setFromAxisAngle(eixoY, lugar.giro);
    m4.compose(lugar.p, giro, tamanho.setScalar(escala));

    // A MESMA matriz nas duas: a cabeca tem que andar junto com o tronco.
    corpos.setMatrixAt(i, m4);
    cabecas.setMatrixAt(i, m4);

    corpos.setColorAt(i, cor.setHex(CAMISAS[Math.floor(rnd() * CAMISAS.length)]!));
    cabecas.setColorAt(i, cor.setHex(PELES[Math.floor(rnd() * PELES.length)]!));
  });

  for (const m of [corpos, cabecas]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.count = lugares.length;
    root.add(m);
  }

  return {
    root,
    quantidade: lugares.length,
    dispose(): void {
      tronco.dispose();
      cabeca.dispose();
      material.dispose();
      corpos.dispose();
      cabecas.dispose();
    },
  };
}
