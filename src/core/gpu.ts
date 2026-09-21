/**
 * Quem esta' desenhando: GPU de verdade ou rasterizador por software.
 *
 * Vale mais do que parece. A causa mais comum de "o jogo esta' travado" num
 * jogo WebGL nao esta' no jogo: e' o navegador caindo pra software — SwiftShader
 * no Chrome, llvmpipe no Linux, "Microsoft Basic Render Driver" (WARP) no
 * Windows quando falta driver de video ou a sessao e' remota. Nesse estado cada
 * pixel e' calculado na CPU, e nenhuma otimizacao de shader muda a ordem de
 * grandeza.
 *
 * Sabendo disso na inicializacao da' pra fazer duas coisas uteis: avisar (o F3
 * acende em vermelho) e ja' nascer com ajustes que tornam o jogo jogavel
 * assim — resolucao menor e sem suavizacao de serrilhado, que em software sao
 * os dois maiores custos.
 *
 * Detecta uma vez so': cada chamada criaria um contexto WebGL descartavel.
 */
import * as THREE from 'three';

interface RendererInfo {
  /** Nome legivel do renderizador, pra mostrar no F3. */
  nome: string;
  /** Verdadeiro quando quem desenha e' a CPU. */
  software: boolean;
}

let cache: RendererInfo | null = null;

export function detectRenderer(): RendererInfo {
  if (cache) return cache;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      cache = { nome: 'sem WebGL', software: true };
    } else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const cru = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      cache = {
        nome: cru.replace(/^ANGLE \(|\)$/g, '').slice(0, 46),
        software: /swiftshader|llvmpipe|software|basic render|basic display|microsoft basic/i.test(cru),
      };
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    cache = { nome: 'desconhecida', software: false };
  }
  return cache;
}

/**
 * Cria o renderer do jogo.
 *
 * Mora aqui, e nao no `Game`, porque precisa existir ANTES dele: os modelos sao
 * carregados antes do jogo (o aquecimento de shaders precisa dos materiais
 * deles), e textura comprimida so' pode ser decodificada depois que o
 * `KTX2Loader` souber o que esta GPU aceita — o que exige um renderer.
 *
 * Sem GPU, cada amostra extra de suavizacao e' trabalho de CPU multiplicado
 * pela tela inteira: e' dos custos mais caros que existem em software.
 */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !detectRenderer().software,
    powerPreference: 'high-performance',
  });

  /**
   * Tone mapping FILMICO, no lugar do corte seco.
   *
   * O padrao do three e' `NoToneMapping`: o valor linear vai direto pra tela e
   * o que passa de 1 e' CORTADO. Com sol forte isso achata tudo que e' claro no
   * mesmo teto — dois tons diferentes de areia iluminada chegam na tela como a
   * mesma cor, e a cor morre justamente onde ha' mais luz. E' a diferenca entre
   * "claro" e "sem cor", e era o que fazia a praia parecer papelao.
   *
   * ACES curva os altos em vez de corta-los: o claro continua claro, mas
   * guarda a cor. Em troca ela escurece os medios, e por isso a exposicao sobe
   * junto — os dois numeros sao UM ajuste so', nunca dois.
   */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  return renderer;
}
