/**
 * A leitura do joystick virtual. Logica pura, com teste.
 *
 * Recebe quanto o polegar se afastou do centro (pixels de TELA, y pra baixo) e
 * devolve o eixo do jogo: x pra direita, z pra FRENTE (y da tela invertido),
 * os dois de -1 a 1 e com modulo no maximo 1.
 *
 * Analogico de verdade, e nao oito direcoes: o `Motor` aceita direcao com
 * modulo menor que 1 e anda mais devagar, e o `Animador` troca corrida por
 * caminhada pela velocidade. Polegar perto do centro e' andar, longe e' correr
 * — de graca, sem botao de andar.
 */
export interface Eixo { x: number; z: number }

export function lerJoystick(
  dx: number,
  dy: number,
  raio: number,
  zonaMorta: number,
  out: Eixo = { x: 0, z: 0 },
): Eixo {
  const d = Math.hypot(dx, dy);
  const morta = raio * zonaMorta;
  if (d <= morta || raio <= morta) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  /**
   * A zona morta e' descontada do MODULO, e nao cortada dele.
   *
   * Cortando, o eixo pularia de 0 pra 0,18 no primeiro pixel fora dela, e o
   * atleta arrancaria em vez de comecar a andar. Remapeada, a faixa util vai de
   * 0 a 1 inteira.
   */
  const modulo = Math.min(1, (d - morta) / (raio - morta));
  out.x = (dx / d) * modulo;
  out.z = (-dy / d) * modulo;
  return out;
}
