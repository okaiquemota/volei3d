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
