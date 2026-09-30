import { MATCH, STORAGE_KEY, TEMPO, TOQUE } from '../config';
import { clamp01 } from '../core/math';
import type { MotivoDoPonto } from '../match/Match';
import type { Side } from '../world/Court';

const CHAVE_DO_MANUAL = `${STORAGE_KEY}.manual-escondido`;

/** Pega um elemento por id, ou explode. Erro cedo e claro vale mais que null. */
function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} nao encontrado`);
  return el as T;
}

/**
 * Religa uma animacao de CSS que ja' tocou.
 *
 * Tirar e por a classe no mesmo quadro nao faz nada: o navegador junta as duas
 * mudancas e nada recomeca. Ler `offsetWidth` no meio forca ele a aplicar a
 * primeira, e a segunda vira uma animacao nova.
 */
function reanimar(el: HTMLElement, classe: string): void {
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
}

/**
 * O HUD.
 *
 * Markup no index.html, setters aqui. Texto em DOM sai mais nitido que texto
 * desenhado em canvas, escala sozinho e nao custa desenho nenhum no laco de
 * render.
 *
 * O HUD so' escuta EVENTOS da partida. Ele nao le' estado de bola, quadra ou
 * jogador, e nao tem update por quadro alem dos relogios dos avisos.
 */
export class HUD {
  private raiz = elemento('hud');
  private placarHome = elemento('home-score');
  private placarAway = elemento('away-score');
  private nomeHome = elemento('home-name');
  private nomeAway = elemento('away-name');
  private bolaHome = elemento('saque-home');
  private bolaAway = elemento('saque-away');
  private linhaDeSaque = elemento('serve-line');
  private aviso = elemento('announcement');
  private avisoMotivo = elemento('aviso-motivo');
  private avisoTexto = elemento('aviso-texto');
  private dicaDeAcao = elemento('action-hint');
  private contagemDoSaque = elemento('saque-contagem');
  private manual = elemento('manual');
  private quadra = elemento('quadra-atual');
  private nomeDaQuadra = elemento('quadra-nome');
  private dicaDaAreia = elemento('dica-praia');
  private teclaDaAreia = elemento('dica-tecla');
  private textoDaAreia = elemento('dica-texto');
  private barraDeCarga = elemento('carga');
  private barraDoToque = elemento('toque');
  private preenchimentoDoToque = elemento('toque-fill');
  private avisoDoToque = elemento('toque-aviso');
  private preenchimentoDaCarga = elemento('carga-fill');
  private barraDoTempo = elemento('tempo');
  private preenchimentoDoTempo = elemento('tempo-fill');
  private veuDoLento = elemento('lento');

  private tempoDoAviso = 0;
  private tempoDoToque = 0;
  private ehMeuSaque = false;
  private pontosVistos: [number, number] = [0, 0];

  constructor() {
    this.restaurarManual();
  }

  mostrar(visivel: boolean): void {
    this.raiz.classList.toggle('hidden', !visivel);
  }

  /**
   * Mostra ou esconde a faixa de teclas.
   *
   * A preferencia e' guardada: quem ja' decorou os controles nao devia ter que
   * esconder a faixa toda vez que abre o jogo.
   */
  alternarManual(): void {
    const escondido = this.manual.classList.toggle('hidden');
    try {
      localStorage.setItem(CHAVE_DO_MANUAL, escondido ? '1' : '0');
    } catch {
      // localStorage bloqueado (aba anonima, cookies desligados). Esconder a
      // faixa nao pode depender disso funcionar.
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

  /**
   * O placar. O numero que MUDOU pisca em ouro — e so' quando foi UM ponto de
   * UM lado. Trocar de quadra muda os dois de uma vez, e piscar ali seria
   * dizer "algo aconteceu" sem que nada tenha acontecido.
   */
  placar(home: number, away: number): void {
    const [h, a] = this.pontosVistos;
    this.placarHome.textContent = String(home);
    this.placarAway.textContent = String(away);
    if (home === h + 1 && away === a) reanimar(this.placarHome, 'pulou');
    if (away === a + 1 && home === h) reanimar(this.placarAway, 'pulou');
    this.pontosVistos = [home, away];
  }

  saque(lado: Side, nome: string, ehVoce: boolean): void {
    this.linhaDeSaque.textContent = `SAQUE ${nome}`;
    this.linhaDeSaque.classList.toggle('away', lado === 'away');
    this.bolaHome.classList.toggle('ativo', lado === 'home');
    this.bolaAway.classList.toggle('ativo', lado === 'away');
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
    this.contagemDoSaque.textContent = String(Math.ceil(segundos));
    // Os dois ultimos segundos acendem: e' quando ainda da' tempo de reagir.
    this.dicaDeAcao.classList.toggle('urgente', segundos <= 2);
  }

  esconderDicaDeSaque(): void {
    this.dicaDeAcao.classList.add('hidden');
  }

  /**
   * A barra de forca, que e' um QTE.
   *
   * `fracao` e' o percurso inteiro da varredura, de 0 a 1 — zona e excesso
   * incluidos. A zona em si e' desenhada pelo CSS, que sabe onde ela fica; o
   * que vem daqui e' so' ONDE a barra esta' e o que isso significou. Menos de
   * zero esconde.
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
   * A barra do poder de camera lenta, e o veu que mostra que ele pegou.
   *
   * `fracao` negativa esconde — e' o caso de quem esta' na areia, onde nao ha'
   * toque pra salvar. O veu sai junto: um mundo lento sem aviso na tela e' um
   * jogo que parece ter travado.
   */
  tempo(fracao: number, ativo: boolean): void {
    const visivel = fracao >= 0;
    this.barraDoTempo.classList.toggle('hidden', !visivel);
    this.veuDoLento.classList.toggle('visivel', visivel && ativo);
    if (!visivel) return;

    this.preenchimentoDoTempo.style.width = `${Math.round(clamp01(fracao) * 100)}%`;
    this.barraDoTempo.classList.toggle('ativo', ativo);
    // "Vazia" e' nao dar pra LIGAR, e nao estar em zero: e' o mesmo degrau que
    // o `Tempo` usa, e os dois tem que contar a mesma historia.
    this.barraDoTempo.classList.toggle('vazia', !ativo && fracao < TEMPO.minimoParaLigar);
  }

  /**
   * Avisa qual quadra a camera esta' mostrando.
   *
   * So' aparece quando se esta' ASSISTINDO. Na propria quadra, o aviso seria
   * ruido permanente dizendo o obvio.
   */
  avisoDeQuadra(nome: string, ehMinhaQuadra: boolean): void {
    this.quadra.classList.toggle('hidden', ehMinhaQuadra);
    if (!ehMinhaQuadra) this.nomeDaQuadra.textContent = `QUADRA ${nome}`;
  }

  /** Esconde o aviso de quadra sem dizer que quadra e' a sua. */
  esconderAvisoDeQuadra(): void {
    this.quadra.classList.add('hidden');
  }

  /**
   * O aviso de quem esta' andando pela areia: a tecla e o que ela faz. Null
   * esconde.
   *
   * Fica separado da dica de saque de proposito: uma diz o que fazer com a
   * bola, a outra diz o que ha' em volta. Misturar as duas num elemento so'
   * faria o estado de uma apagar a outra em algum caminho que ninguem testou.
   */
  dicaDaPraia(texto: string | null, tecla = ''): void {
    this.dicaDaAreia.classList.toggle('hidden', texto === null);
    if (texto === null) return;
    this.teclaDaAreia.textContent = tecla;
    this.teclaDaAreia.classList.toggle('hidden', tecla === '');
    this.textoDaAreia.textContent = texto;
  }

  /**
   * A janela do toque: o quanto ESTE contato sairia limpo, se fosse agora.
   *
   * A barra sobe enquanto a bola vem pro corpo e cai quando ela passa — o pico
   * e' a hora. Ao vivo, e nao uma previsao: previsao diria QUANDO tocar; isto
   * diz o que sai se tocar agora, que e' a mesma informacao com uma mentira a
   * menos. Negativo esconde.
   */
  janelaDeToque(qualidade: number): void {
    const visivel = qualidade >= 0;
    this.barraDoToque.classList.toggle('hidden', !visivel);
    if (!visivel) return;

    this.preenchimentoDoToque.style.width = `${Math.round(Math.min(1, qualidade) * 100)}%`;
    this.barraDoToque.classList.toggle('limpo', qualidade >= 0.7);
  }

  /**
   * Como saiu o golpe que acabou de sair: estoura grande e assenta.
   *
   * Sem isto a dificuldade fica muda: a bola vai pro lugar errado e o jogador
   * nao tem como saber se errou a mira ou o tempo.
   */
  private avisarGolpe(texto: string, classe: '' | 'bom' | 'ruim'): void {
    this.avisoDoToque.textContent = texto;
    this.avisoDoToque.className = classe;
    reanimar(this.avisoDoToque, 'visivel');
    this.tempoDoToque = 0.9;
  }

  /** Como a barra de forca foi lida no golpe que acabou de sair. */
  avisoDaCarga(naZona: boolean, passou: boolean): void {
    if (!passou && !naZona) return;
    this.avisarGolpe(passou ? 'PASSOU DO PONTO' : 'NO PONTO!', passou ? 'ruim' : 'bom');
  }

  qualidadeDoToque(qualidade: number): void {
    const [texto, classe] = qualidade < TOQUE.qualidadeMinima ? ['QUEIMOU', 'ruim'] as const
      : qualidade < 0.4 ? ['NA PONTA', 'ruim'] as const
      : qualidade < 0.7 ? ['NO JEITO', ''] as const
      : ['NO PONTO!', 'bom'] as const;
    this.avisarGolpe(texto, classe);
  }

  /** O ponto: uma faixa atravessando a tela, na cor de quem fez. */
  ponto(lado: Side, motivo: MotivoDoPonto, nome: string): void {
    this.avisoMotivo.textContent = motivo;
    this.avisoTexto.textContent = `PONTO ${nome}`;
    this.aviso.classList.toggle('away', lado === 'away');
    reanimar(this.aviso, 'visivel');
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
