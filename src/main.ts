import { Game } from './core/Game';
import { createRenderer } from './core/gpu';

const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error('canvas #viewport nao encontrado');
}

// WebGL pode simplesmente nao existir (driver, GPU bloqueada, navegador antigo).
// Melhor uma mensagem clara do que uma tela preta silenciosa.
const suportaWebGL = (): boolean => {
  try {
    const teste = document.createElement('canvas');
    return !!(teste.getContext('webgl2') ?? teste.getContext('webgl'));
  } catch {
    return false;
  }
};

if (!suportaWebGL()) {
  document.body.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;font-family:monospace;color:#e8e6e3;text-align:center;padding:24px">' +
    '<div><h1>WebGL indisponivel</h1><p style="opacity:.6;margin-top:12px">' +
    'Este navegador nao consegue rodar o jogo. Tente ativar a aceleracao de hardware.</p></div></div>';
} else {
  // O renderer nasce antes do jogo porque a anisotropia maxima depende dele, e
  // as texturas da quadra sao criadas no construtor do Game.
  const renderer = createRenderer(canvas);
  const game = new Game(canvas, renderer);

  // Gancho de depuracao: no console da' pra bisbilhotar e, principalmente,
  // avancar o tempo de jogo sem depender do relogio:
  //   for (let t = 0; t < 10; t += 1/60) __VOLEI.update(1/60);
  (window as unknown as { __VOLEI: Game }).__VOLEI = game;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}
