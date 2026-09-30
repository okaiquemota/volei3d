import { COURT, REDE } from '../config';

/**
 * O PANO da rede: uma grade de pontos que se mexe pra frente e pra tras.
 *
 * E' logica pura — nada de three, nada de desenho — e por isso tem teste. Quem
 * desenha e' `buildRede`, que so' le' `z` daqui.
 *
 * O modelo e' o de uma MEMBRANA ESTICADA, e so' na direcao de fora do plano
 * (z). Cada ponto e' puxado pela media dos vizinhos (a tensao do pano, que faz
 * o tranco correr como onda de um poste ao outro) e por uma ancora fraca de
 * volta ao plano (que faz a rede voltar a ficar lisa). A fita e a corda de
 * baixo sao cabos: ancora bem mais forte. As duas colunas das pontas estao
 * amarradas nos postes e nao se mexem.
 *
 * So' z, e nao x-y-z: a rede de volei se deforma pra frente e pra tras, e e'
 * isso que se ve' da camera. Um pano completo, com esticar e dobrar, custaria
 * restricoes de distancia e iteracoes pra desenhar exatamente o mesmo.
 *
 * Integracao semi-implicita (velocidade primeiro, posicao depois) em passo
 * FIXO de 1/100 s, o mesmo da bola. O modo mais rapido e' o da fita (14 m/s
 * com pontos a 25 cm): w * dt ~ 1,2, dentro do limite de estabilidade (2).
 * Subir `ondaDaFita` muito alem disso faz o pano explodir, e o teste pega.
 */

const PASSO = 1 / 100;
const MAX_PASSOS = 5;
/** Abaixo disto em tudo, a rede esta' parada: para de simular. */
const REPOUSO = 1e-4;
/** Quanto tempo parada antes de dormir. Evita dormir no meio de uma inversao. */
const TEMPO_PRA_DORMIR = 0.5;

export class TecidoDaRede {
  readonly colunas = REDE.tecido.colunas;
  readonly linhas = REDE.tecido.linhas;
  /** Posicao de repouso de cada ponto, no plano da rede (espaco local). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** O deslocamento pra fora do plano. E' o que o desenho le'. */
  readonly z: Float32Array;
  private readonly vz: Float32Array;
  private readonly ancora: Float32Array;
  private readonly preso: Uint8Array;

  /** Rigidez horizontal POR LINHA: a fita e a corda de baixo sao mais tensas. */
  private readonly kx: Float32Array;
  private readonly ky: number;
  private acumulador = 0;
  private parado = 0;
  /** Dormindo: nada se mexe e o passo nao faz nada. Empurrar acorda. */
  dormindo = true;
  /** Mudou desde a ultima vez que alguem desenhou. */
  mudou = true;

  constructor() {
    const n = this.colunas * this.linhas;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.ancora = new Float32Array(n);
    this.preso = new Uint8Array(n);

    const base = COURT.netHeight - COURT.netDepth;
    const hx = (2 * REDE.meiaLargura) / (this.colunas - 1);
    const hy = COURT.netDepth / (this.linhas - 1);
    // Laplaciano com o passo de cada eixo: a onda anda na mesma velocidade
    // na horizontal e na vertical, mesmo com a grade retangular.
    const c2 = REDE.tecido.onda * REDE.tecido.onda;
    this.kx = new Float32Array(this.linhas).fill(c2 / (hx * hx));
    this.kx[0] = REDE.tecido.ondaDaBase ** 2 / (hx * hx);
    this.kx[this.linhas - 1] = REDE.tecido.ondaDaFita ** 2 / (hx * hx);
    this.ky = c2 / (hy * hy);

    for (let l = 0; l < this.linhas; l++) {
      for (let c = 0; c < this.colunas; c++) {
        const i = this.indice(c, l);
        this.x[i] = -REDE.meiaLargura + c * hx;
        this.y[i] = base + l * hy;
        this.preso[i] = c === 0 || c === this.colunas - 1 ? 1 : 0;
        this.ancora[i] = l === this.linhas - 1 ? REDE.tecido.ancoraDaFita
          : l === 0 ? REDE.tecido.ancoraDaBase
          : REDE.tecido.ancora;
      }
    }
  }

  /** Linha 0 e' a corda de baixo; a ultima e' a fita. */
  indice(coluna: number, linha: number): number {
    return linha * this.colunas + coluna;
  }

  /**
   * A bola afundando a malha: um funil em volta do ponto de contato.
   *
   * O funil tem o raio `raioDaBola` e a profundidade que a FISICA da bola
   * disse — o pano segue a bola, e nao o contrario. Ponto que ja' esta' mais
   * afundado que o funil fica como esta' (a onda de um toque anterior nao e'
   * apagada), e ponto empurrado perde a velocidade que tinha: quem manda
   * nele, enquanto a bola esta' ali, e' a bola.
   *
   * `sentido` e' pra onde a malha e' empurrada: o oposto do lado de onde a
   * bola veio.
   */
  afundar(cx: number, cy: number, afundamento: number, sentido: number): void {
    if (afundamento <= 0) return;
    const raio = REDE.tecido.raioDaBola;
    for (let i = 0; i < this.z.length; i++) {
      if (this.preso[i]) continue;
      const d = Math.hypot(this.x[i]! - cx, this.y[i]! - cy);
      if (d >= raio) continue;
      // Achatado no centro (1 - d²), e nao pontudo: o ponto da grade mais perto
      // da bola fica a ate' 16 cm dela, e um funil pontudo deixava a malha 40%
      // mais rasa que a bola — a bola aparecia atravessando o pano.
      const w = 1 - (d / raio) * (d / raio);
      const alvo = sentido * afundamento * w;
      if (alvo * sentido > this.z[i]! * sentido) {
        this.z[i] = alvo;
        this.vz[i] = 0;
      }
    }
    this.acordar();
  }

  /**
   * Um corpo (esfera) encostado: nenhum ponto fica dentro dele.
   *
   * O ponto que estiver dentro vai pra superficie da esfera, do lado de la'
   * do corpo. `cz` e' o centro em z local — o sinal diz de que lado o corpo
   * esta'.
   *
   * `vz` e' a velocidade do corpo em z, e o ponto empurrado sai com ela. E'
   * isso que faz a rede BALANCAR depois de um encontrao: o corpo para no vao
   * da rede (`Court.NET_GAP`), o pano nao — segue um pouco e volta. Sem isso o
   * pano so' acompanharia o corpo, e parado junto com ele.
   */
  encostar(cx: number, cy: number, cz: number, raio: number, vz = 0): void {
    const lado = cz < 0 ? -1 : 1;
    let mexeu = false;
    for (let i = 0; i < this.z.length; i++) {
      if (this.preso[i]) continue;
      const dx = this.x[i]! - cx;
      const dy = this.y[i]! - cy;
      const plano = raio * raio - dx * dx - dy * dy;
      if (plano <= 0) continue;
      const limite = cz - lado * Math.sqrt(plano);
      if (this.z[i]! * lado > limite * lado) {
        this.z[i] = limite;
        // So' empurra pra longe do corpo; puxar de volta ninguem puxa.
        this.vz[i] = vz * lado < 0 ? vz : 0;
        mexeu = true;
      }
    }
    if (mexeu) this.acordar();
  }

  /**
   * Um tranco: velocidade `vz` somada aos pontos em volta de (cx, cy).
   *
   * E' o que a bola faz na FITA (bate e segue) e o que um corpo faz quando
   * chega correndo na rede.
   */
  cutucar(cx: number, cy: number, raio: number, vz: number): void {
    if (vz === 0) return;
    for (let i = 0; i < this.z.length; i++) {
      if (this.preso[i]) continue;
      const d = Math.hypot(this.x[i]! - cx, this.y[i]! - cy);
      if (d >= raio) continue;
      const w = 1 - d / raio;
      this.vz[i] = this.vz[i]! + vz * w * w;
    }
    this.acordar();
  }

  private acordar(): void {
    this.dormindo = false;
    this.parado = 0;
    this.mudou = true;
  }

  /** Avanca o pano. Dormindo, nao faz nada — e' o caso de quase todo quadro. */
  update(dt: number): void {
    if (this.dormindo) return;
    this.acumulador = Math.min(this.acumulador + dt, PASSO * MAX_PASSOS);
    while (this.acumulador >= PASSO) {
      this.acumulador -= PASSO;
      this.passo(PASSO);
    }
    this.mudou = true;
  }

  private passo(dt: number): void {
    const { colunas, linhas, z, vz } = this;
    const freio = REDE.tecido.amortecimento;
    const limite = REDE.afundamentoMaximo;
    let maior = 0;

    // Velocidades primeiro, todas a partir das posicoes do passo anterior.
    for (let l = 0; l < linhas; l++) {
      const kx = this.kx[l]!;
      for (let c = 0; c < colunas; c++) {
        const i = l * colunas + c;
        if (this.preso[i]) continue;
        const zi = z[i]!;
        // Vizinho que nao existe (borda de cima e de baixo) nao puxa: borda livre.
        const horizontal = z[i - 1]! + z[i + 1]! - 2 * zi;
        let vertical = 0;
        if (l > 0) vertical += z[i - colunas]! - zi;
        if (l < linhas - 1) vertical += z[i + colunas]! - zi;
        const a = kx * horizontal + this.ky * vertical - this.ancora[i]! * zi - freio * vz[i]!;
        vz[i] = vz[i]! + a * dt;
      }
    }

    for (let i = 0; i < z.length; i++) {
      if (this.preso[i]) continue;
      let zi = z[i]! + vz[i]! * dt;
      if (zi > limite) { zi = limite; vz[i] = 0; }
      else if (zi < -limite) { zi = -limite; vz[i] = 0; }
      z[i] = zi;
      maior = Math.max(maior, Math.abs(zi), Math.abs(vz[i]!) * dt);
    }

    if (maior < REPOUSO) {
      this.parado += dt;
      if (this.parado >= TEMPO_PRA_DORMIR) {
        z.fill(0);
        vz.fill(0);
        this.dormindo = true;
      }
    } else {
      this.parado = 0;
    }
  }

  /** O maior deslocamento agora, em metros. Pra teste e pra quem quiser saber. */
  get maiorDeslocamento(): number {
    let m = 0;
    for (let i = 0; i < this.z.length; i++) m = Math.max(m, Math.abs(this.z[i]!));
    return m;
  }

  /** O deslocamento da FITA na altura de `x`, interpolado entre as colunas. */
  zDaFita(x: number): number {
    const l = this.linhas - 1;
    const t = (x + REDE.meiaLargura) / (2 * REDE.meiaLargura) * (this.colunas - 1);
    const c = Math.max(0, Math.min(this.colunas - 2, Math.floor(t)));
    const f = Math.max(0, Math.min(1, t - c));
    return this.z[this.indice(c, l)]! * (1 - f) + this.z[this.indice(c + 1, l)]! * f;
  }
}
