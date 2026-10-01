/**
 * A resolucao AUTOMATICA: baixa quando o quadro pesa, sobe quando sobra.
 *
 * O ajuste fixo resolve uma maquina e um cenario: quem joga num notebook fraco
 * escolhe 70% e pronto. Mas o peso do quadro muda dentro do jogo — a praia com
 * tres quadras pesa mais que o estudio, o estadio mais que os dois, e uma tela
 * de alta densidade pede quatro vezes os pixels de uma comum —, e o numero
 * certo pra um e' desperdicio no outro.
 *
 * Quem decide e' o intervalo entre quadros, numa janela de meio segundo: a
 * MEDIANA, pra um engasgo sozinho nao mexer em nada. E so' quando o gargalo e'
 * pixel. Se o processador passou o quadro inteiro ocupado, baixar a resolucao
 * nao ajuda — o quadro e' lento por outra coisa —, e a escala fica onde esta'.
 *
 * Subir e' mais devagar que descer, e cada subida que nao se sustenta dobra a
 * espera da proxima. Sem isso a escala sobe, pesa, desce, sobe de novo, e a
 * imagem pisca de nitidez a cada poucos segundos.
 */

/** A escala vai daqui ate' 1. Abaixo de metade a imagem vira borrao. */
export const ESCALA_MINIMA = 0.5;
/** Meio segundo de quadros por decisao — e pelo menos cinco quadros, se o jogo estiver muito lento. */
const JANELA = 0.5;
const QUADROS_POR_JANELA = 5;
/** A mediana acima disto (50 qps) e' quadro pesado. */
const PESADO = 1 / 50;
/** Abaixo disto (57 qps) e' quadro com folga: o monitor e' quem segura. */
const FOLGADO = 1 / 57;
/** O processador ocupado por mais que isto do intervalo: o gargalo nao e' pixel. */
const OCUPADO = 0.75;
/** O alvo das contas de descida: 60 qps. */
const ALVO = 1 / 60;
/** Quanto tempo de folga seguida antes de tentar subir. */
const SUBIR_DEPOIS = 3;
const PASSO_DE_SUBIDA = 0.1;
/** Uma subida que pesa antes disto nao se sustentou; depois, a cena e' que mudou. */
const PROVA_DA_SUBIDA = 4;
const ESPERA_INICIAL = 3;
const ESPERA_MAXIMA = 64;
/** Intervalo maior que isto nao e' o jogo: e' aba escondida, depurador, carga. */
const FORA_DO_JOGO = 1;

/** Em passos de 5%: trocar a escala realoca a tela, e tem que ser raro. */
const arredondar = (x: number): number => Math.round(x * 20) / 20;

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export class ResolucaoAutomatica {
  escala = 1;

  private intervalos: number[] = [];
  private trabalhos: number[] = [];
  private naJanela = 0;
  /** Relogio proprio, em segundos de quadro: o teste avanca sem esperar. */
  private relogio = 0;
  private folgaSeguida = 0;
  /**
   * A menor escala que pesou da ultima vez, e quando da' pra tentar ela de
   * novo. Abaixo dela sobe-se a vontade; nela, so' depois da espera — que
   * dobra a cada vez que ela pesa de novo.
   */
  private teto: number | null = null;
  private espera = ESPERA_INICIAL;
  private tentarOTetoEm = 0;
  /** A ultima subida, enquanto ainda esta' a prova: de onde veio, e quando. */
  private subida: { de: number; em: number } | null = null;
  /**
   * A janela logo depois de uma DESCIDA nao conta: ainda ha' quadros da
   * escala velha a caminho da tela, e julgar por eles faria descer duas vezes.
   */
  private assentando = false;

  /** Recomeca de uma escala (a fixa que estava valendo, ao ligar o AUTO). */
  reiniciar(escala = 1): void {
    this.escala = Math.min(1, Math.max(ESCALA_MINIMA, arredondar(escala)));
    this.zerarJanela();
    this.folgaSeguida = 0;
    this.teto = null;
    this.espera = ESPERA_INICIAL;
    this.subida = null;
    this.assentando = false;
  }

  /**
   * Um quadro: o intervalo desde o anterior e quanto dele o processador
   * passou trabalhando (atualizar e mandar desenhar), em segundos. Devolve
   * `true` quando a escala mudou.
   */
  amostrar(intervalo: number, trabalho: number): boolean {
    if (!(intervalo > 0) || intervalo > FORA_DO_JOGO) {
      this.zerarJanela();
      return false;
    }
    this.relogio += intervalo;
    this.intervalos.push(intervalo);
    this.trabalhos.push(trabalho);
    this.naJanela += intervalo;
    if (this.naJanela < JANELA || this.intervalos.length < QUADROS_POR_JANELA) return false;

    const quadro = mediana(this.intervalos);
    const ocupado = mediana(this.trabalhos) > quadro * OCUPADO;
    this.zerarJanela();
    if (this.assentando) {
      this.assentando = false;
      return false;
    }
    if (quadro > PESADO) return this.pesou(quadro, ocupado);
    if (quadro < FOLGADO) return this.sobrou();
    // Entre os dois: nem pesa nem sobra. Fica.
    this.folgaSeguida = 0;
    return false;
  }

  private pesou(quadro: number, ocupado: boolean): boolean {
    this.folgaSeguida = 0;
    if (ocupado || this.escala <= ESCALA_MINIMA) return false;
    const subida = this.subida && this.relogio - this.subida.em < PROVA_DA_SUBIDA ? this.subida : null;
    this.subida = null;
    // Pesou de novo no teto, ou acima: a proxima tentativa espera o dobro.
    const noTeto = subida !== null && this.teto !== null && this.escala >= this.teto;
    this.espera = noTeto ? Math.min(this.espera * 2, ESPERA_MAXIMA) : ESPERA_INICIAL;
    this.teto = Math.min(this.teto ?? 1, this.escala);
    this.tentarOTetoEm = this.relogio + this.espera;
    // A subida que nao aguentou volta pra onde estava, que aguentava.
    if (subida) return this.mudar(subida.de);
    // Pixel e' area: o tempo cai com o quadrado da escala.
    const fator = Math.min(0.92, Math.max(0.8, Math.sqrt(ALVO / quadro)));
    return this.mudar(Math.max(ESCALA_MINIMA, Math.min(this.escala - 0.05, arredondar(this.escala * fator))));
  }

  private sobrou(): boolean {
    this.folgaSeguida += JANELA;
    // A subida aguentou a prova: se chegou no teto, o teto deixou de valer.
    if (this.subida && this.relogio - this.subida.em >= PROVA_DA_SUBIDA) {
      if (this.teto !== null && this.escala >= this.teto) {
        this.teto = null;
        this.espera = ESPERA_INICIAL;
      }
      this.subida = null;
    }
    // Uma subida de cada vez: a proxima so' depois que esta passar na prova.
    if (this.subida || this.escala >= 1 || this.folgaSeguida < SUBIR_DEPOIS) return false;
    const alvo = Math.min(1, arredondar(this.escala + PASSO_DE_SUBIDA));
    if (this.teto === null || alvo < this.teto) return this.subir(alvo);
    // O teto: de novo so' depois da espera, e o proprio teto, nao alem.
    if (this.relogio >= this.tentarOTetoEm) return this.subir(this.teto);
    // Enquanto isso, o degrau logo abaixo dele, se houver.
    const abaixo = arredondar(this.teto - 0.05);
    return abaixo > this.escala ? this.subir(abaixo) : false;
  }

  private subir(alvo: number): boolean {
    if (alvo <= this.escala) return false;
    this.folgaSeguida = 0;
    this.subida = { de: this.escala, em: this.relogio };
    // Subindo nao ha' o que assentar: os quadros a caminho sao da escala
    // menor, e se mesmo assim a janela pesar, quem pesou foi a nova.
    return this.mudar(alvo, false);
  }

  private mudar(escala: number, assentar = true): boolean {
    if (escala === this.escala) return false;
    this.escala = escala;
    this.assentando = assentar;
    return true;
  }

  private zerarJanela(): void {
    this.intervalos = [];
    this.trabalhos = [];
    this.naJanela = 0;
  }
}
