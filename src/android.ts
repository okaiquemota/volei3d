import type { AppPlugin } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * O que so' existe dentro do app Android. No navegador, nada aqui roda.
 *
 * O botao VOLTAR do Android e' o Esc do jogo: pausa em quadra, volta uma tela
 * nos menus. A unica excecao e' o menu principal, onde nao ha' pra onde
 * voltar — ali ele faz o que todo app faz, que e' ir pro fundo (e nao fechar:
 * fechar perderia uma partida pausada atras do menu).
 *
 * O Esc e' FABRICADO como evento de teclado, e nao chamado direto no Game ou
 * nas telas: e' o mesmo caminho do teclado de verdade, que `Input` e
 * `Navegacao` ja' sabem tratar em cada estado. Um segundo caminho pro voltar
 * seria mais um lugar pra o comportamento divergir.
 */
export function ligarAndroid(): void {
  if (!Capacitor.isNativePlatform()) return;

  /**
   * O plugin e' registrado aqui, pelo nome, e NAO importado do `@capacitor/app`.
   *
   * O pacote traz junto uma versao web dele por `import()` dinamico, e isso
   * divide o bundle em dois `.js` — o `build:single` recusa (com razao: so' um
   * dos pedacos entraria no arquivo unico) e o deploy do Pages caiu por isso.
   * Aqui so' o lado nativo serve, entao sem implementacao web nao ha' `import()`.
   * O pacote continua nas dependencias: e' ele que o `cap sync` instala no Android.
   */
  const App = registerPlugin<AppPlugin>('App');

  void App.addListener('backButton', () => {
    const outraTela = document.querySelector('.tela:not(.hidden):not(#menu)');
    const noMenuPrincipal = !outraTela && !document.getElementById('menu')?.classList.contains('hidden');
    if (noMenuPrincipal) {
      void App.minimizeApp();
      return;
    }

    const evento = { code: 'Escape', key: 'Escape', bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', evento));
    // Soltar no quadro seguinte: o jogo le' "apertou agora" uma vez por quadro.
    requestAnimationFrame(() => window.dispatchEvent(new KeyboardEvent('keyup', evento)));
  });
}
