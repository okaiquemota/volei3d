/**
 * Qual animacao o corpo esta' fazendo, dado o que o `Motor` diz.
 *
 * Funcao pura, e por isso tem teste. A escolha parece obvia lida em voz alta
 * ("parado toca Idle, andando toca Run") e nao e': o atleta deste jogo encara a
 * BOLA enquanto anda relativo a' camera, ou seja, ele anda de lado quase o
 * tempo todo. Com um `Run` frontal so', metade da partida seria o boneco
 * deslizando de lado com as pernas correndo pra frente.
 *
 * O pack traz as quatro direcoes casando entre si, e e' o que esta' logica
 * existe pra usar.
 */

/** O que o corpo esta' fazendo agora. Tudo sai do `Motor`. */
export interface EstadoDoCorpo {
  noChao: boolean;
  mergulhando: boolean;
  levantando: boolean;
  /** Modulo da velocidade horizontal, em m/s. */
  velocidade: number;
  /**
   * Angulo do ANDAR em relacao a' FRENTE do corpo, em radianos, de -pi a pi.
   *
   * 0 e' andar pra onde se olha; +pi/2 e' andar pra direita de quem olha;
   * -pi/2 pra esquerda; +-pi e' andar de costas.
   */
  anguloDoAndar: number;
}

/** Abaixo disto o corpo esta' parado, e nao "andando bem devagar". */
const PARADO = 0.5;

/**
 * Acima disto e' corrida; entre `PARADO` e isto, caminhada.
 *
 * O atleta so' tem uma velocidade de topo (6,5 m/s), entao a caminhada aparece
 * nas pontas: o primeiro passo depois de parado e a freada antes de parar. Sem
 * ela o boneco sai correndo a toda do repouso, e e' o que mais denuncia
 * animacao presa a estado em vez de a velocidade.
 */
const CORRENDO = 3.2;

/** Meio caminho entre frente e lado: dali em diante o passo e' lateral. */
const QUARTO = Math.PI / 4;
const TRES_QUARTOS = (Math.PI * 3) / 4;

/**
 * O nome do clipe pra este estado.
 *
 * Os nomes sao os do pack. Se um deles nao existir no modelo carregado, quem
 * toca cai no `Idle` — ver `Animador`.
 */
export function clipeDoCorpo(estado: EstadoDoCorpo): string {
  /**
   * Mergulhando ou caido, o corpo ja' esta' deitado pelo `Motor`.
   *
   * Ele gira o corpo inteiro 1,35 rad, e uma animacao de pernas por cima disso
   * briga com o tombo em vez de somar. Ate' existir um clipe de peixinho de
   * verdade, o corpo vai deitado e RIGIDO — que e' exatamente o que a capsula
   * fazia, e ela lia bem.
   */
  if (estado.mergulhando || estado.levantando) return 'Idle_Neutral';

  // No ar tambem nao ha' clipe proprio ainda. O salto se le' pela altura, que e'
  // do Motor, nao pela pose.
  if (!estado.noChao) return 'Idle_Neutral';

  if (estado.velocidade < PARADO) return 'Idle';

  const a = estado.anguloDoAndar;
  const correndo = estado.velocidade >= CORRENDO;

  // De costas e de lado so' existem correndo: o pack nao tem caminhada lateral,
  // e um `Walk` frontal com o corpo indo pro lado e' o defeito que esta funcao
  // existe pra evitar.
  if (!correndo) return 'Walk';

  const volta = Math.abs(a);
  if (volta <= QUARTO) return 'Run';
  if (volta >= TRES_QUARTOS) return 'Run_Back';
  return a > 0 ? 'Run_Right' : 'Run_Left';
}
