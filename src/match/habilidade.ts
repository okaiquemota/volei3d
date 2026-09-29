import { AI_SKILL, type AiSkill } from '../config';

/**
 * A habilidade de um adversario a partir de UM numero: a forca, de 0 a 1.
 *
 * O jogo tinha tres degraus — facil, normal, dificil — e um circuito precisa de
 * rampa: o terceiro adversario do torneio municipal tem que ser um pouco mais
 * duro que o segundo, e o do mundial bem mais que os dois. Tres degraus dariam
 * adversarios repetidos e saltos bruscos.
 *
 * A interpolacao passa PELO `normal`, em vez de ir numa reta do facil ao
 * dificil. Nao e' capricho: os tres presets foram afinados a mao e medidos (o
 * teto da defesa em 0,4, por exemplo, custou uma quadra congelada pra
 * descobrir), e uma reta direta cruzaria o meio num ponto que ninguem testou.
 * Assim a forca 0,5 E' o normal, campo por campo.
 *
 * A forca e' presa em [0, 1]. Os presets sao os extremos medidos; extrapolar
 * alem deles poderia dar atraso negativo ou erro de mira negativo, que o resto
 * do codigo nao espera.
 */
export function habilidadeDe(forca: number): AiSkill {
  const f = Math.min(1, Math.max(0, forca));

  const [de, para, t] = f <= 0.5
    ? [AI_SKILL.facil, AI_SKILL.normal, f / 0.5]
    : [AI_SKILL.normal, AI_SKILL.dificil, (f - 0.5) / 0.5];

  const saida = {} as AiSkill;
  for (const chave of Object.keys(de) as Array<keyof AiSkill>) {
    saida[chave] = de[chave] + (para[chave] - de[chave]) * t;
  }
  return saida;
}
