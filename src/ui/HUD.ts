import { MATCH, STORAGE_KEY } from '../config';

const CHAVE_DO_MANUAL = `${STORAGE_KEY}.manual-escondido`;
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
  private manual = elemento('manual');

  private tempoDoAviso = 0;

  constructor() {
    this.restaurarManual();
  }

  mostrar(visivel: boolean): void {
    this.raiz.classList.toggle('hidden', !visivel);
  }

  /**
   * Mostra ou esconde o manual de teclas.
   *
   * A preferencia e' guardada: quem ja' decorou os controles nao devia ter que
   * esconder o painel toda vez que abre o jogo.
   */
  alternarManual(): void {
    const escondido = this.manual.classList.toggle('hidden');
    try {
      localStorage.setItem(CHAVE_DO_MANUAL, escondido ? '1' : '0');
    } catch {
      // localStorage bloqueado (aba anonima, cookies desligados). Esconder o
      // painel nao pode depender disso funcionar.
    }
  }

  private restaurarManual(): void {
    try {
      if (localStorage.getItem(CHAVE_DO_MANUAL) === '1') this.manual.classList.add('hidden');
    } catch {
      // idem
    }
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
