import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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
