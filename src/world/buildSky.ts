import * as THREE from 'three';
import { COLORS } from '../config';

/**
 * O ceu, com gradiente.
 *
 * Era uma cor chapada em `scene.background`, e uma cor chapada nao e' ceu: ceu
 * escurece pro alto e clareia pro horizonte, e e' esse degrade que diz ao olho
 * onde esta' longe. Sem ele a areia encontrava o ceu numa linha de navalha e a
 * praia inteira lia como papel de parede.
 *
 * E' uma CUPULA e nao um fundo de tela. Fundo de tela e' desenhado colado no
 * quadro: nao gira com a camera, entao trocar o enquadramento faria o horizonte
 * deslizar e o degrade ficar parado — os dois descolam, e o erro aparece
 * exatamente quando se mexe na roda. A cupula gira junto porque esta' no mundo.
 *
 * Nao recebe nevoa (`fog: false`) nem escreve profundidade: ela e' o fundo de
 * tudo, e nevoa em cima de ceu so' lavaria o degrade que ela existe pra ter.
 */
export interface CeuConstruido {
  malha: THREE.Mesh;
  descartaveis: Array<{ dispose(): void }>;
  /** A cor do ceu RENTE ao horizonte. E' a que a nevoa tem que usar. */
  corDoHorizonte: THREE.Color;
}

/**
 * A faixa de cor, de baixo pra cima.
 *
 * Uma textura de 2 px de largura por 64 de altura: o degrade e' vertical, entao
 * largura nao serve pra nada alem de satisfazer o hardware. Duas paradas seriam
 * uma rampa linear, que le' como plastico; as tres abaixo deixam o azul segurar
 * mais tempo no alto e abrir rapido perto do horizonte, que e' o que o ceu faz.
 */
function faixaDoCeu(): THREE.CanvasTexture {
  const tela = document.createElement('canvas');
  tela.width = 2;
  tela.height = 64;
  const ctx = tela.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, tela.height, 0, 0);
  grad.addColorStop(0, `#${COLORS.horizonte.toString(16).padStart(6, '0')}`);
  grad.addColorStop(0.45, `#${COLORS.sky.toString(16).padStart(6, '0')}`);
  grad.addColorStop(1, `#${COLORS.zenite.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, tela.width, tela.height);

  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/**
 * `raio` vem do `far` da camera: a cupula tem que caber dentro do alcance de
 * visao, ou ela e' recortada e o ceu vira preto.
 */
export function construirCeu(raio: number): CeuConstruido {
  const textura = faixaDoCeu();
  const geo = new THREE.SphereGeometry(raio, 24, 16);
  const material = new THREE.MeshBasicMaterial({
    map: textura,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });

  const malha = new THREE.Mesh(geo, material);
  // Fundo de tudo: desenha primeiro e nao disputa profundidade com nada.
  malha.renderOrder = -1;

  return {
    malha,
    descartaveis: [geo, material, textura],
    corDoHorizonte: new THREE.Color(COLORS.horizonte),
  };
}
