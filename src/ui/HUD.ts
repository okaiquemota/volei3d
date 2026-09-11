import { MATCH } from '../config';
import type { MotivoDoPonto } from '../match/Match';
import type { Side } from '../world/Court';

/** Pega um elemento por id, ou explode. Erro cedo e claro vale mais que null. */
function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao encontrado`);
  return el as T;
}

/**
 * O HUD.
 *
 * Markup no index.html, setters aqui — a divisao do rpk.fps. Texto em DOM sai
 * mais nitido que texto desenhado em canvas, escala sozinho e nao custa
 * desenho nenhum no laco de render.
 *
 * O HUD so' escuta EVENTOS da partida. Ele nao le' estado de bola, quadra ou
 * jogador, e nao tem update por quadro alem do relogio do aviso.
 */
export class HUD {
  private raiz = elemento('hud');
  private placarHome = elemento('home-score');
  private placarAway = elemento('away-score');
  private nomeHome = elemento('home-name');
  private nomeAway = elemento('away-name');
  private linhaDeSaque = elemento('serve-line');
  private aviso = elemento('announcement');
  private dicaDeAcao = elemento('action-hint');

  private tempoDoAviso = 0;

  mostrar(visivel: boolean): void {
    this.raiz.classList.toggle('hidden', !visivel);
  }

  definirNomes(home: string, away: string): void {
    this.nomeHome.textContent = home;
    this.nomeAway.textContent = away;
  }

  placar(home: number, away: number): void {
    this.placarHome.textContent = String(home);
    this.placarAway.textContent = String(away);
  }

  saque(lado: Side, nome: string, ehVoce: boolean): void {
    this.linhaDeSaque.textContent = `SAQUE: ${nome}`;
    this.linhaDeSaque.classList.toggle('away', lado === 'away');
    this.dicaDeAcao.classList.toggle('hidden', !ehVoce);
  }

  esconderDicaDeSaque(): void {
    this.dicaDeAcao.classList.add('hidden');
  }

  ponto(lado: Side, motivo: MotivoDoPonto, nome: string): void {
    this.aviso.textContent = `${motivo} — PONTO DE ${nome}`;
    this.aviso.classList.toggle('away', lado === 'away');
    this.aviso.classList.add('visivel');
    this.tempoDoAviso = MATCH.announcement;
  }

  update(dt: number): void {
    if (this.tempoDoAviso <= 0) return;

    this.tempoDoAviso -= dt;
    if (this.tempoDoAviso <= 0) this.aviso.classList.remove('visivel');
  }
}
