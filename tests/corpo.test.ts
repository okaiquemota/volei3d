import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Motor } from '../src/players/Motor';
import { ATHLETE } from '../src/config';
import { CORPO_PADRAO, fichaDe } from '../src/match/habilidade';
import { personagemPorId } from '../src/match/personagens';

/**
 * O que estes testes protegem:
 *
 * A ficha diz "velocidade 10" e "pulo 10". Se o `Motor` continuasse lendo o
 * `ATHLETE` fixo em algum canto, o numero estaria certo no objeto e errado na
 * quadra — e a unica forma de ver seria medir o corpo andando, que e' o que
 * isto faz.
 */

const novoMotor = (): Motor => new Motor((posicao, out) => out.copy(posicao));

/** Corre pro leste por `segundos` e devolve a maior velocidade vista. */
function correr(m: Motor, segundos: number): number {
  let maior = 0;
  m.moverPara(new THREE.Vector3(1, 0, 0));
  for (let i = 0; i < Math.round(segundos * 60); i++) {
    m.update(1 / 60);
    maior = Math.max(maior, m.velocidadeHorizontal.length());
  }
  return maior;
}

/** Pula parado e devolve a altura maxima. */
function pular(m: Motor): number {
  let maior = 0;
  m.pular();
  for (let i = 0; i < 120; i++) {
    m.update(1 / 60);
    maior = Math.max(maior, m.posicao.y);
  }
  return maior;
}

/**
 * A integracao em passo de 1/60 perde uns 5 cm no topo do arco — a velocidade
 * cai antes da posicao andar, todo quadro. Vale igual pra todo mundo, entao o
 * que se compara aqui e' um corpo contra o outro, medidos do mesmo jeito.
 */
const FOLGA_DO_PASSO = 0.06;

test('sem personagem, o corpo e o de sempre', () => {
  const m = novoMotor();
  assert.ok(Math.abs(correr(m, 1) - ATHLETE.moveSpeed) < 1e-9);
  assert.ok(Math.abs(pular(novoMotor()) - ATHLETE.jumpHeight) < FOLGA_DO_PASSO);
});

test('o corpo da ficha e o corpo que corre e pula na quadra', () => {
  const guto = fichaDe(personagemPorId('guto-vento')!.notas).corpo;   // velocidade 10
  const tatu = fichaDe(personagemPorId('tatu')!.notas).corpo;         // pulo 1

  const rapido = novoMotor();
  rapido.definirCorpo(guto);
  assert.ok(Math.abs(correr(rapido, 1) - guto.velocidade) < 1e-9, 'o velocista corre como qualquer um');
  assert.ok(guto.velocidade > CORPO_PADRAO.velocidade);

  const baixo = novoMotor();
  baixo.definirCorpo(tatu);
  const altura = pular(baixo);
  const normal = pular(novoMotor());
  assert.ok(Math.abs(altura - tatu.pulo) < FOLGA_DO_PASSO, `pulou ${altura.toFixed(2)}, a ficha diz ${tatu.pulo}`);
  assert.ok(altura < normal - 0.15, `pulo 1 subiu ${altura.toFixed(2)}, o normal ${normal.toFixed(2)}`);
});

/** Voltar a' CPU sem nome tem que devolver o corpo inteiro, e nao so' o nome. */
test('voltar ao corpo padrao desfaz a ficha', () => {
  const m = novoMotor();
  m.definirCorpo(fichaDe(personagemPorId('guto-vento')!.notas).corpo);
  m.definirCorpo(CORPO_PADRAO);
  assert.ok(Math.abs(correr(m, 1) - ATHLETE.moveSpeed) < 1e-9);
});
