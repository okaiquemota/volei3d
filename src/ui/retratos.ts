import * as THREE from 'three';
import { VISUAL_PADRAO, chaveDoVisual, type Visual } from '../players/corpos';
import { Corpos } from '../players/montarCorpo';

/**
 * O RETRATO de um personagem: o proprio boneco 3D, fotografado.
 *
 * A carta do elenco, a ficha, o VS e o seu perfil mostram o MESMO corpo que
 * entra na quadra — montado pelas mesmas pecas, na pose de espera do pack. E'
 * o que deixa reconhecer do outro lado da rede quem voce viu na ficha.
 *
 * Foto, e nao cena viva: sao dezenas de retratos na tela de adversarios, e
 * uma cena 3D por carta seria dezenas de contextos de WebGL. Aqui ha' UM,
 * pequeno, fora da tela, que tira cada foto uma vez e guarda pela combinacao
 * (`chaveDoVisual`). A foto vira uma imagem comum, e a interface continua
 * sendo so' DOM.
 *
 * Antes das pecas chegarem o retrato e' uma silhueta; quando chegam, todos os
 * que estao esperando sao preenchidos — sem a tela ter que se redesenhar.
 */

/**
 * Corpo inteiro (VS), da cintura pra cima (carta do elenco), cabeca e ombros
 * (ficha), ou so' a cabeca (o circulo do perfil, que e' pequeno demais pra
 * qualquer coisa alem do rosto).
 */
export type Quadro = 'corpo' | 'carta' | 'busto' | 'rosto';

/** Em pixels da foto. A carta mostra o corpo a uns 130 px; o dobro deixa nitido. */
const TAMANHO: Readonly<Record<Quadro, readonly [number, number]>> = {
  corpo: [300, 480],
  carta: [320, 320],
  busto: [256, 256],
  rosto: [192, 192],
};

/**
 * Pra onde a camera olha, e de quao longe. A lente e' fechada (18 graus) pra
 * achatar a perspectiva — retrato de jogo de esporte, nao foto de celular.
 */
const ENQUADRAMENTO: Readonly<Record<Quadro, { alvo: number; distancia: number }>> = {
  corpo: { alvo: 0.95, distancia: 6.6 },
  carta: { alvo: 1.3, distancia: 4.0 },
  busto: { alvo: 1.58, distancia: 2.3 },
  rosto: { alvo: 1.68, distancia: 1.45 },
};

/** Quanto do tempo de um quadro as fotos podem tomar. O resto fica pro jogo. */
const ORCAMENTO_MS = 10;

interface Pedido {
  img: HTMLImageElement;
  v: Visual;
  quadro: Quadro;
}

class Retratista {
  private corpos: Corpos | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly cena = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(18, 1, 0.1, 30);
  /** A foto de cada combinacao, pela chave. Promessa: a imagem e' codificada fora do quadro. */
  private readonly prontos = new Map<string, Promise<string>>();
  private pendentes: Pedido[] = [];
  private agendado = false;
  /** O shader do corpo ja' foi compilado neste contexto? Ver `aquecer`. */
  private aquecido = false;
  private aquecendo = false;

  constructor() {
    // Luz de estudio: o ceu quente do jogo por cima, uma principal de lado e
    // um contorno frio por tras, que descola o boneco do fundo da carta.
    this.cena.add(new THREE.HemisphereLight(0xfff1df, 0x4a3426, 1.6));
    const principal = new THREE.DirectionalLight(0xffe2c0, 2.4);
    principal.position.set(-2, 3, 4);
    const contorno = new THREE.DirectionalLight(0x9cc4ff, 1.8);
    contorno.position.set(3, 2.5, -3);
    this.cena.add(principal, contorno);
  }

  /** As pecas chegaram: tira as fotos que estavam esperando. */
  usar(corpos: Corpos): void {
    this.corpos = corpos;
    this.prontos.clear();
    this.agendar();
  }

  retrato(v: Visual, quadro: Quadro): HTMLElement {
    const caixa = document.createElement('span');
    caixa.className = `retrato retrato-${quadro}`;
    caixa.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    caixa.append(img);

    const pronto = this.prontos.get(`${quadro}|${chaveDoVisual(v)}`);
    if (pronto) {
      void pronto.then((url) => mostrar(img, url));
    } else {
      // Uma copia: quem pediu pode mudar o visual depois (o criador muda).
      this.pendentes.push({ img, v: { ...v }, quadro });
      this.agendar();
    }
    return caixa;
  }

  private agendar(): void {
    if (this.agendado || !this.corpos || this.pendentes.length === 0) return;
    this.agendado = true;
    requestAnimationFrame(() => this.processar());
  }

  /** Algumas fotos por quadro: a tela de adversarios pede oito de uma vez. */
  private processar(): void {
    this.agendado = false;
    if (!this.aquecido) {
      void this.aquecer();
      return;
    }
    const inicio = performance.now();
    while (this.pendentes.length > 0 && performance.now() - inicio < ORCAMENTO_MS) {
      const p = this.pendentes.shift()!;
      // Retrato que ja' saiu da tela nao precisa de foto.
      if (!p.img.isConnected) continue;
      const foto = this.fotografar(p.v, p.quadro);
      if (foto) void foto.then((url) => mostrar(p.img, url));
    }
    this.agendar();
  }

  /**
   * Compila o shader do corpo neste contexto antes da primeira foto.
   *
   * O retratista e' outro contexto de WebGL, com programas proprios: o
   * tranco de compilar o corpo, que o jogo ja' pagou, aqui se pagava de novo,
   * dentro da primeira foto — o maior travamento do arranque. Com
   * `compileAsync` a compilacao corre em paralelo e a foto espera por ela.
   */
  private async aquecer(): Promise<void> {
    const corpos = this.corpos;
    if (this.aquecendo || !corpos) return;
    const renderer = this.renderer ?? this.criarRenderer();
    if (!renderer) return;
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) {
      // Sem compilar em paralelo, compilar antes nao poupa nada: a foto compila.
      this.aquecido = true;
      this.agendar();
      return;
    }
    this.aquecendo = true;
    const amostra = corpos.montar(VISUAL_PADRAO);
    this.cena.add(amostra);
    try {
      await renderer.compileAsync(this.cena, this.camera);
    } catch {
      // Sem compilar antes, a primeira foto compila: mais lenta, mas sai.
    } finally {
      this.cena.remove(amostra);
      Corpos.descartar(amostra);
      this.aquecido = true;
      this.aquecendo = false;
      this.agendar();
    }
  }

  private fotografar(v: Visual, quadro: Quadro): Promise<string> | null {
    const chave = `${quadro}|${chaveDoVisual(v)}`;
    const pronto = this.prontos.get(chave);
    if (pronto) return pronto;
    const corpos = this.corpos;
    if (!corpos) return null;

    const renderer = this.renderer ?? this.criarRenderer();
    if (!renderer) return null;

    const [w, h] = TAMANHO[quadro];
    renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const { alvo, distancia } = ENQUADRAMENTO[quadro];
    // Um pouco de lado e de cima: de frente chapado, o boneco vira figurinha.
    const giro = 0.35;
    this.camera.position.set(Math.sin(giro) * distancia, alvo + distancia * 0.06, Math.cos(giro) * distancia);
    this.camera.lookAt(0, alvo, 0);
    this.camera.updateProjectionMatrix();

    const corpo = corpos.montar(v);
    const espera = corpos.animacoes(v.familia).find((c) => c.name === 'Idle');
    const mixer = new THREE.AnimationMixer(corpo);
    if (espera) {
      mixer.clipAction(espera).play();
      mixer.setTime(espera.duration * 0.3);
    }
    this.cena.add(corpo);
    renderer.render(this.cena, this.camera);
    /**
     * `toBlob`, e nao `toDataURL`: os dois copiam a imagem na hora (a proxima
     * foto pode redesenhar a tela a vontade), mas o PNG do `toDataURL` e'
     * codificado ali mesmo, no quadro do jogo, e o do `toBlob` fora dele.
     */
    const tela = renderer.domElement;
    const foto = new Promise<string>((pronta) => {
      tela.toBlob((png) => pronta(png ? URL.createObjectURL(png) : tela.toDataURL('image/png')), 'image/png');
    });
    this.cena.remove(corpo);
    mixer.stopAllAction();
    mixer.uncacheRoot(corpo);
    Corpos.descartar(corpo);

    this.prontos.set(chave, foto);
    return foto;
  }

  private criarRenderer(): THREE.WebGLRenderer | null {
    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      // O mesmo acabamento de cor da quadra: o retrato e o boneco em jogo tem
      // que parecer a mesma pessoa.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      this.renderer = renderer;
      return renderer;
    } catch (erro) {
      // Sem um segundo contexto de WebGL, os retratos ficam na silhueta.
      console.warn('sem retratos 3D', erro);
      this.corpos = null;
      return null;
    }
  }
}

function mostrar(img: HTMLImageElement, url: string): void {
  img.src = url;
  img.parentElement?.classList.add('pronto');
}

const RETRATISTA = new Retratista();

/** O retrato de um corpo. Volta na hora; a foto entra quando ficar pronta. */
export function desenharRetrato(v: Visual, quadro: Quadro = 'corpo'): HTMLElement {
  return RETRATISTA.retrato(v, quadro);
}

/** Chamado pelo jogo quando as pecas de corpo chegam. */
export function usarCorposNosRetratos(corpos: Corpos): void {
  RETRATISTA.usar(corpos);
}
