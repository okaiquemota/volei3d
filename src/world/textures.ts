import * as THREE from 'three';

/**
 * Texturas desenhadas em canvas — nada de baixar imagem.
 *
 * Mesma escolha do rpk.fps, e aqui da' pra ir ate' o fim: o volei nao tem um
 * unico arquivo binario, entao o build de arquivo unico sai 100% funcional.
 *
 * Sao tres superficies, e cada uma resolve um problema diferente:
 *
 * - AREIA: grao fino. O que faz areia parecer areia de longe nao e' a cor, e'
 *   a variacao em alta frequencia sob luz rasante. Por isso ela leva mapa de
 *   relevo derivado do proprio albedo — a mesma ideia da arena do rpk.fps,
 *   com ganho baixo (la' a licao foi que ganho demais vira plastico estofado).
 * - REDE: recorte por alpha. A malha nao e' desenho na caixa: e' buraco.
 * - BOLA: as seis faixas da bola de volei de praia.
 */

/** Anisotropia maxima da GPU. Precisa ser definida ANTES de criar as texturas. */
let anisotropiaMax = 1;

export function setMaxAnisotropy(valor: number): void {
  anisotropiaMax = Math.max(1, valor);
}

function criarCanvas(tamanho: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = tamanho;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel');
  return [c, ctx];
}

function texturaDe(canvas: HTMLCanvasElement, repetir: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, anisotropiaMax);
  if (repetir) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

/**
 * Gerador pseudoaleatorio com semente.
 *
 * Math.random deixaria a areia diferente a cada carregamento — nao quebra nada,
 * mas duas capturas do mesmo angulo nunca baterem atrapalha na hora de comparar
 * com o Unity. A semente e' a mesma que estava la'.
 */
function aleatorioComSemente(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

export interface Superficie {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** Quanto o relevo pesa, pro normalScale do material. */
  relevo: number;
  all: THREE.Texture[];
}

/**
 * Areia: cor com grao, mais o relevo derivado dela.
 *
 * O normal sai da PROPRIA imagem, por diferenca entre pixels vizinhos. Nao ha'
 * segundo desenho: o grao que se ve' na cor e' exatamente o que reage a' luz.
 */
export function criarAreia(): Superficie {
  const TAM = 128;
  const [canvas, ctx] = criarCanvas(TAM);
  const rnd = aleatorioComSemente(20240718);

  const imagem = ctx.createImageData(TAM, TAM);
  const grao = new Float32Array(TAM * TAM);

  // Base + grao. A cor base e' a da areia seca ao sol.
  const base = { r: 230, g: 201, b: 149 };
  for (let i = 0; i < grao.length; i++) {
    const g = (rnd() - 0.5) * 0.1;
    grao[i] = g;
    imagem.data[i * 4 + 0] = base.r * (1 + g);
    imagem.data[i * 4 + 1] = base.g * (1 + g * 0.9);
    imagem.data[i * 4 + 2] = base.b * (1 + g * 0.7);
    imagem.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imagem, 0, 0);

  return {
    map: texturaDe(canvas, true),
    normalMap: normalDeAltura(grao, TAM, 6),
    // Baixo de proposito: areia nao tem quina. Ganho alto aqui vira cascalho.
    relevo: 0.35,
    all: [],
  };
}

/**
 * Normal map a partir de um campo de altura.
 *
 * O gradiente do grao e' fraco (+-0.05), entao precisa de ganho. Fica em 6 pelo
 * mesmo motivo documentado no rpk.fps: com 14 o detalhe vira calombo.
 */
function normalDeAltura(altura: Float32Array, tam: number, ganho: number): THREE.Texture {
  const [canvas, ctx] = criarCanvas(tam);
  const imagem = ctx.createImageData(tam, tam);

  const em = (x: number, y: number): number =>
    altura[((y + tam) % tam) * tam + ((x + tam) % tam)]!;

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const dx = (em(x + 1, y) - em(x - 1, y)) * ganho;
      const dy = (em(x, y + 1) - em(x, y - 1)) * ganho;

      // Normal = normalize(-dx, -dy, 1), remapeada de [-1,1] pra [0,255].
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * tam + x) * 4;
      imagem.data[i + 0] = (-dx * inv * 0.5 + 0.5) * 255;
      imagem.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      imagem.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      imagem.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  // Normal map NAO e' cor: em sRGB o relevo sai torto.
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, anisotropiaMax);
  return tex;
}

/**
 * Malha da rede: cordao opaco e o resto transparente.
 *
 * Vai em alpha TEST, nao em alpha blend: a rede nao precisa de translucidez, e
 * o teste evita o problema de ordenacao de transparencia contra a bola.
 */
export function criarRede(): THREE.Texture {
  const TAM = 32;
  const [canvas, ctx] = criarCanvas(TAM);

  ctx.clearRect(0, 0, TAM, TAM);
  ctx.fillStyle = '#17171a';
  // Os tres primeiros pixels de cada eixo sao o cordao; o resto e' buraco.
  ctx.fillRect(0, 0, TAM, 3);
  ctx.fillRect(0, 0, 3, TAM);

  return texturaDe(canvas, true);
}

/**
 * Bola de volei de praia: seis faixas verticais, branco / azul / amarelo.
 *
 * A faixa e' o que deixa o giro visivel. Bola lisa some contra a areia e nao
 * da' pra ler a rotacao — que e' metade da leitura de uma cortada.
 */
export function criarBola(): THREE.Texture {
  const TAM = 64;
  const [canvas, ctx] = criarCanvas(TAM);

  const cores = ['#f7f7f7', '#1a59bf', '#facc26', '#f7f7f7', '#1a59bf', '#facc26'];
  const larguraFaixa = TAM / 6;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = cores[i]!;
    // +1 de sobreposicao: sem isso aparece uma costura clara entre as faixas.
    ctx.fillRect(Math.floor(i * larguraFaixa), 0, Math.ceil(larguraFaixa) + 1, TAM);
  }

  return texturaDe(canvas, true);
}

/**
 * Escala as UVs de uma caixa pelo TAMANHO dela, em metros.
 *
 * Vem do rpk.fps e e' o detalhe que mais muda a leitura: sem isso, a laje de
 * areia de 24 m e a linha de 0.06 m mostram uma repeticao cada, e o grao da
 * areia sai quatrocentas vezes maior que o da linha. Com isso, textura passa a
 * ser medida em METROS — um grao de areia tem o mesmo tamanho em qualquer peca.
 */
export function escalarUVsDaCaixa(
  geometria: THREE.BoxGeometry,
  largura: number,
  altura: number,
  profundidade: number,
  metrosPorRepeticao: number,
): void {
  const uv = geometria.attributes.uv;
  if (!uv) return;

  // A ordem das faces numa BoxGeometry e': +X, -X, +Y, -Y, +Z, -Z.
  // Cada face tem 4 vertices, e as duas dimensoes que ela mostra mudam.
  const dimensoes: Array<[number, number]> = [
    [profundidade, altura], [profundidade, altura],
    [largura, profundidade], [largura, profundidade],
    [largura, altura], [largura, altura],
  ];

  for (let face = 0; face < 6; face++) {
    const [u, v] = dimensoes[face]!;
    const escalaU = u / metrosPorRepeticao;
    const escalaV = v / metrosPorRepeticao;
    for (let i = 0; i < 4; i++) {
      const indice = face * 4 + i;
      uv.setXY(indice, uv.getX(indice) * escalaU, uv.getY(indice) * escalaV);
    }
  }
  uv.needsUpdate = true;
}
