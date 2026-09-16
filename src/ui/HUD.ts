import { MATCH, STORAGE_KEY, TOQUE } from '../config';

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
  private quadra = elemento('quadra-atual');
  private dicaDaAreia = elemento('dica-praia');
  private barraDeCarga = elemento('carga');
  private barraDoToque = elemento('toque');
  private preenchimentoDoToque = elemento('toque-fill');
  private avisoDoToque = elemento('toque-aviso');
  private preenchimentoDaCarga = elemento('carga-fill');

  private tempoDoAviso = 0;
  private tempoDoToque = 0;
  private ehMeuSaque = false;

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
    this.ehMeuSaque = ehVoce;
  }

  /**
   * Contagem regressiva do saque. Null esconde.
   *
   * So' aparece pro saque do JOGADOR: um relogio correndo no saque da CPU e'
   * informacao que ele nao pode usar pra nada, e relogio na tela sem acao
   * possivel e' so' ansiedade.
   */
  relogioDoSaque(segundos: number | null): void {
    if (segundos === null || !this.ehMeuSaque) {
      this.dicaDeAcao.classList.add('hidden');
      return;
    }

    this.dicaDeAcao.classList.remove('hidden');
    // "Segure" e nao "clique": o saque sai dos dois jeitos, mas o que o
    // jogador precisa descobrir e' que segurar muda alguma coisa.
    this.dicaDeAcao.textContent = `SEGURE e SOLTE para SACAR  ${Math.ceil(segundos)}`;
    // Os dois ultimos segundos acendem: e' quando ainda da' tempo de reagir.
    this.dicaDeAcao.classList.toggle('urgente', segundos <= 2);
  }

  esconderDicaDeSaque(): void {
    this.dicaDeAcao.classList.add('hidden');
  }

  /**
   * Barra de forca do ataque. Menos de zero esconde.
   *
   * O anel de mira ja' cresce com a carga, e e' pra la' que o jogador olha. A
   * barra existe pro caso em que nao ha' anel — bola do outro lado, ou mira
   * fora da quadra — pra carga nunca ser invisivel.
   */
  /**
   * A barra de forca, que e' um QTE.
   *
   * `fracao` e' o percurso inteiro da varredura, de 0 a 1 — zona e excesso
   * incluidos. A zona em si e' desenhada pelo CSS, que sabe onde ela fica; o
   * que vem daqui e' so' ONDE a barra esta' e o que isso significou.
   */
  carga(fracao: number, naZona = false, passou = false): void {
    const visivel = fracao >= 0;
    this.barraDeCarga.classList.toggle('hidden', !visivel);
    if (!visivel) return;

    this.preenchimentoDaCarga.style.width = `${Math.round(Math.min(1, fracao) * 100)}%`;
    this.barraDeCarga.classList.toggle('cheia', naZona);
    this.barraDeCarga.classList.toggle('passou', passou);
  }

  /**
   * Avisa qual quadra a camera esta' mostrando.
   *
   * So' aparece quando se esta' ASSISTINDO. Na propria quadra, o aviso seria
   * ruido permanente dizendo o obvio.
   */
  avisoDeQuadra(nome: string, ehMinhaQuadra: boolean): void {
    this.quadra.classList.toggle('hidden', ehMinhaQuadra);
    if (!ehMinhaQuadra) this.quadra.textContent = `ASSISTINDO ${nome}  ·  TAB volta`;
  }

  /** Esconde o aviso de quadra sem dizer que quadra e' a sua. */
  esconderAvisoDeQuadra(): void {
    this.quadra.classList.add('hidden');
  }

  /**
   * O aviso de quem esta' andando pela areia. Null esconde.
   *
   * Fica separado da dica de saque de proposito: uma diz o que fazer com a
   * bola, a outra diz o que ha' em volta. Misturar as duas num elemento so'
   * faria o estado de uma apagar a outra em algum caminho que ninguem testou.
   */
  dicaDaPraia(texto: string | null): void {
    this.dicaDaAreia.classList.toggle('hidden', texto === null);
    if (texto !== null) this.dicaDaAreia.textContent = texto;
  }

  /**
   * A janela do toque: o quanto ESTE contato sairia limpo, se fosse agora.
   *
   * E' a leitura que o Volleyball Unbound da' com uma barra de tempo, traduzida
   * pro que este jogo mede: geometria. A barra sobe enquanto a bola vem pro
   * corpo e cai quando ela passa — o pico e' a hora. Negativo esconde.
   *
   * Ao vivo, e nao uma previsao. Previsao diria QUANDO tocar; isto diz o que
   * sai se tocar agora, que e' a mesma informacao com uma mentira a menos.
   */
  janelaDeToque(qualidade: number): void {
    const visivel = qualidade >= 0;
    this.barraDoToque.classList.toggle('hidden', !visivel);
    if (!visivel) return;

    this.preenchimentoDoToque.style.width = `${Math.round(Math.min(1, qualidade) * 100)}%`;
    this.barraDoToque.classList.toggle('limpo', qualidade >= 0.7);
  }

  /**
   * Como saiu o toque que acabou de sair.
   *
   * Sem isto a dificuldade fica muda: a bola vai pro lugar errado e o jogador
   * nao tem como saber se errou a mira ou o tempo.
   */
  /** Como a barra de forca foi lida no golpe que acabou de sair. */
  avisoDaCarga(naZona: boolean, passou: boolean): void {
    if (!passou && !naZona) return;

    this.avisoDoToque.textContent = passou ? 'PASSOU DO PONTO' : 'NO PONTO';
    this.avisoDoToque.className = `visivel ${passou ? 'ruim' : 'bom'}`;
    this.tempoDoToque = 0.9;
  }

  qualidadeDoToque(qualidade: number): void {
    const [texto, classe] = qualidade < TOQUE.qualidadeMinima ? ['QUEIMOU', 'ruim']
      : qualidade < 0.4 ? ['NA PONTA', 'ruim']
      : qualidade < 0.7 ? ['NO JEITO', '']
      : ['NO PONTO', 'bom'];

    this.avisoDoToque.textContent = texto;
    this.avisoDoToque.className = `visivel ${classe}`;
    this.tempoDoToque = 0.9;
  }

  ponto(lado: Side, motivo: MotivoDoPonto, nome: string): void {
    this.aviso.textContent = `${motivo} — PONTO DE ${nome}`;
    this.aviso.classList.toggle('away', lado === 'away');
    this.aviso.classList.add('visivel');
    this.tempoDoAviso = MATCH.announcement;
  }

  update(dt: number): void {
    if (this.tempoDoToque > 0) {
      this.tempoDoToque -= dt;
      if (this.tempoDoToque <= 0) this.avisoDoToque.classList.remove('visivel');
    }

    if (this.tempoDoAviso <= 0) return;

    this.tempoDoAviso -= dt;
    if (this.tempoDoAviso <= 0) this.aviso.classList.remove('visivel');
  }
}
