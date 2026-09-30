/**
 * Um elemento com classe e texto.
 *
 * Sempre `textContent`, e nunca `innerHTML` com texto interpolado. Os nomes sao
 * nossos hoje; o dia em que vierem de um save editado a mao, uma string com `<`
 * dentro nao pode virar HTML.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, classe = '', texto = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto) e.textContent = texto;
  return e;
}

/** Cor de numero (0xRRGGBB) pra CSS. */
export function corCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Um icone da folha de simbolos do index.html (`#i-<nome>`).
 *
 * Referencia, e nao copia: o desenho mora num lugar so', e o traco em
 * `currentColor` faz o icone mudar de cor junto com o texto no foco.
 */
export function icone(nome: string, classe = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (classe) svg.setAttribute('class', classe);
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/** Um paralelogramo de estado. `tom` pinta: branco (padrao), escuro ou ouro. */
export function chip(texto: string, tom: '' | 'escuro' | 'ouro' = '', comIcone = ''): HTMLElement {
  const c = el('span', tom ? `chip ${tom}` : 'chip');
  if (comIcone) c.append(icone(comIcone));
  c.append(texto);
  return c;
}
