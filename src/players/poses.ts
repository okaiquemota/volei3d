import * as THREE from 'three';
import { CLIPE_DO_TOQUE } from './animacoes';
import type { Acao } from './Hitter';

/**
 * As animacoes que o pack nao tem: pulo, mergulho e os quatro gestos de bola.
 *
 * Escritas a mao, como numero e comentario, igual ao resto do projeto — e nao
 * como arquivo binario que ninguem revisa.
 *
 * A DECISAO que faz isto ser viavel: a pose nao diz "gire o ombro 40 graus em
 * X". Ela diz PRA ONDE O OSSO APONTA, em espaco do corpo, e o quaternion sai de
 * uma conta. O motivo e' que este rig e' feito a mao e os eixos locais do braco
 * esquerdo e do direito NAO sao espelhados: escrever angulo por eixo exigiria
 * decorar cada osso e ainda erraria calado na hora de espelhar uma pose.
 *
 * Medido com uma sonda no proprio .glb: o corpo olha pra +Z, cima e' +Y, e a
 * DIREITA do corpo e' -X — a mesma convencao do `controle.ts`.
 */

/** Direcoes em espaco do CORPO. Somar e misturar: tudo e' normalizado depois. */
const F = [0, 0, 1];      // frente
const T = [0, 0, -1];     // tras
const C = [0, 1, 0];      // cima
const B = [0, -1, 0];     // baixo
const D = [-1, 0, 0];     // direita do corpo
const E = [1, 0, 0];      // esquerda do corpo

/** Mistura direcoes com peso. `mix([B,3],[F,1])` e' "pra baixo, puxando pra frente". */
function mix(...partes: Array<[number[], number]>): number[] {
  const v = [0, 0, 0];
  for (const [d, p] of partes) for (let i = 0; i < 3; i++) v[i]! += d[i]! * p;
  return v;
}

/** Uma pose: por osso, pra onde a ponta dele aponta. Osso ausente fica em repouso. */
export type Pose = Record<string, number[]>;

/** Um quadro-chave: um instante e a pose nele. */
export interface Quadro {
  t: number;
  pose: Pose;
  /** Quanto o quadril desce, em metros. Ver `pernasDe`. */
  descer: number;
  /**
   * Torcao de um osso em torno de si mesmo, em radianos, depois de apontar.
   *
   * `apontar` deixa esse giro livre, e na maioria dos ossos ninguem ve'. Na
   * MAO ve': o repouso do rig tem a palma virada pro corpo, polegar pra cima,
   * e segurar a bola por baixo pede a palma pra cima. O osso continua
   * apontando pro mesmo lugar; so' gira em volta do proprio eixo.
   */
  giros?: Record<string, number>;
}

export interface Receita {
  nome: string;
  duracao: number;
  quadros: Quadro[];
  /**
   * So' do peito pra cima, tocando POR CIMA do clipe de baixo.
   *
   * O clipe nao leva perna, quadril nem pe': quem manda neles continua sendo o
   * `Idle` ou o `Walk` que estiver tocando, e o `Animador` mistura este com
   * peso alto so' nos ossos que ele escreve. E' o que deixa o sacador segurar
   * a bola ANDANDO — um clipe de corpo inteiro faria o boneco deslizar de pe'
   * parado. Sem pernas, `descer` tem que ser zero: nao ha' quadril pra baixar.
   */
  camada?: boolean;
}

/**
 * POR QUE TODO GESTO COMECA NO CONTATO.
 *
 * O atleta so' sabe que tocou a bola DEPOIS de tocar: o `Hitter` resolve o
 * toque e a bola sai no mesmo quadro. Nao ha' aviso previo pra armar o braco.
 *
 * Entao o quadro t=0 de cada gesto e' a pose DO CONTATO, e o resto do clipe e'
 * o acompanhamento. Quem faz o papel da armada e' a propria mistura entre
 * clipes: o braco sai de onde estava e chega na pose de contato em
 * `CRUZAMENTO_DO_GESTO` — curto de proposito, porque uma armada longa faria a
 * bola sair antes da mao chegar. Fica um golpe seco, que e' como um ataque de
 * verdade se parece; uma armada de 0,2 s ficaria visivelmente fora de hora.
 */

// ------------------------------------------------------- pernas e agachamento

/**
 * Medidas da perna, tiradas do proprio .glb com a sonda.
 *
 * Servem pra uma conta so', e importante: as pernas deste rig penduram no
 * `Body`, nao sustentam ele. Dobrar o joelho NAO abaixa o quadril — levanta o
 * pe'. Quem agacha e' o `Body` descendo, e ai o joelho tem que dobrar o tanto
 * exato pra sola continuar na areia. Uma coisa sem a outra da' boneco flutuando
 * ou pe' enterrado, e foi o primeiro defeito que apareceu ao medir.
 */
const OSSO_DA_PERNA = 0.433;   // coxa e canela tem o mesmo comprimento
const QUADRIL = 0.930;         // altura da juncao da coxa, em repouso
const TORNOZELO = 0.097;       // altura do tornozelo, em repouso

/**
 * As pernas que mantem o pe' no chao com o quadril `descer` metros mais baixo.
 *
 * Coxa pra frente e canela pra tras, no MESMO angulo: assim o tornozelo desce
 * reto, sem sair de baixo do quadril. O angulo sai do cosseno do vao.
 */
function pernasDe(descer: number): Pose {
  const vao = QUADRIL - descer - TORNOZELO;
  const cos = Math.min(1, Math.max(-1, vao / (2 * OSSO_DA_PERNA)));
  const dobra = Math.tan(Math.acos(cos));
  return {
    UpperLegR: mix([B, 1], [F, dobra]), LowerLegR: mix([B, 1], [T, dobra]),
    UpperLegL: mix([B, 1], [F, dobra]), LowerLegL: mix([B, 1], [T, dobra]),
  };
}

/** Os ossos que `pernasDe` escreve. Entram em todo clipe, escritos ou nao. */
const PERNAS = ['UpperLegR', 'LowerLegR', 'UpperLegL', 'LowerLegL'] as const;

/**
 * Os PES, e a canela que cada um segue.
 *
 * `FootL` e `FootR` nao sao os pes da cadeia da perna: sao alvos de IK
 * pendurados no `Root`. E a pele do sapato e' presa a DOIS ossos — o cano a'
 * canela, a sola ao `Foot`. As animacoes do pack movem o `Foot` em todo quadro;
 * as escritas aqui nao moviam, e o pe' ficava parado onde estava enquanto a
 * canela ia embora. A pele esticava entre os dois, e o sapato virava uma
 * prancha de meio metro no chao — no pulo de forma gritante, e em TODO gesto de
 * leve, porque a pose de repouso deste modelo e' um passo de caminhada e as
 * pernas "de pe'" daqui poem o tornozelo embaixo do quadril, longe dali.
 *
 * Por isso todo clipe grava os dois pes, quadro a quadro — ver `pesDoQuadro`.
 */
const PES = [['FootL', 'LowerLegL'], ['FootR', 'LowerLegR']] as const;

/**
 * Um quadro-chave. `pose` e' so' o que a receita escreveu a mao.
 *
 * As pernas vem por baixo, de `pernasDe`, na hora de montar o clipe — e o que a
 * receita escrever sobre perna VENCE. E' como pulo e mergulho recolhem e
 * esticam as pernas, que nesses dois nao estao pisando em nada.
 */
function quadro(t: number, descer: number, pose: Pose, giros?: Record<string, number>): Quadro {
  return giros ? { t, descer, pose, giros } : { t, descer, pose };
}

// ---------------------------------------------------------------- as poses

/**
 * PULO.
 *
 * O jogo ja' controla a ALTURA — o corpo sobe pela fisica, nao pela animacao.
 * O que falta e' a pose: bracos subindo e pernas recolhidas. Dois quadros so',
 * e de proposito: o salto dura 0,59 s e um ciclo com muito movimento dentro
 * dessa janela vira tremor.
 *
 * O clipe comeca com os bracos JA' na metade da subida. A armada acontece no
 * chao, antes de decolar, e quando este clipe entra o atleta ja' saiu — comecar
 * de braco caido seria remar no ar.
 */
const PULO: Receita = {
  nome: 'Pulo',
  duracao: 0.6,
  quadros: [
    quadro(0, 0, {
      // Quase na horizontal: o braco deste modelo tem 42 cm e o ombro esta' a
      // 1,37 m, entao um levantar de 45 graus ja' poe a mao acima da cabeca. Pra
      // o salto ter subida visivel, o quadro de saida tem que comecar baixo.
      UpperArmR: mix([C, 0.4], [F, 1]), LowerArmR: mix([C, 0.8], [F, 1]),
      UpperArmL: mix([C, 0.4], [F, 1]), LowerArmL: mix([C, 0.8], [F, 1]),
      /**
       * Perna quase ESTICADA e embaixo do corpo: e' a saida do chao, a perna
       * que acabou de empurrar. A primeira versao jogava coxa E canela pra
       * tras, e o corpo inteiro virava uma diagonal — de lado lia como boneco
       * caindo pra frente, e nao como salto.
       */
      UpperLegR: mix([B, 6], [F, 0.25]), LowerLegR: mix([B, 6], [T, 0.6]),
      UpperLegL: mix([B, 6], [F, 0.1]), LowerLegL: mix([B, 6], [T, 0.7]),
    }),
    quadro(0.6, 0, {
      // Dois bracos RETOS e juntos no alto, como quem bloqueia. E' a silhueta
      // que separa o pulo do levantamento (cotovelo aberto, mao na testa) e do
      // ataque (um braco so'). As tres eram "braco pro alto" e viravam a mesma
      // coisa a' distancia da camera de jogo.
      UpperArmR: mix([C, 5], [F, 1]), LowerArmR: mix([C, 5], [F, 1]),
      UpperArmL: mix([C, 5], [F, 1]), LowerArmL: mix([C, 5], [F, 1]),
      // No alto os joelhos dobram: coxa um pouco a' frente, canela pra tras, e
      // o pe' (preso na canela) fica apontado embaixo do quadril.
      UpperLegR: mix([B, 3], [F, 0.9]), LowerLegR: mix([B, 2], [T, 1.3]),
      UpperLegL: mix([B, 3], [F, 0.6]), LowerLegL: mix([B, 2], [T, 1.5]),
    }),
  ],
};

/**
 * MERGULHO.
 *
 * ATENCAO ao referencial, e' o contrario do que parece. O `Motor` deita o corpo
 * inteiro 1,35 rad em torno do proprio +X, DEPOIS de mirar. Com o corpo quase
 * deitado, o "pra cima" do corpo aponta pra FRENTE no mundo e o "pra frente" do
 * corpo aponta pra BAIXO.
 *
 * Ou seja: a pose de repouso, de braco caido, ja' deixa os bracos apontando pra
 * TRAS no mundo. Pra esticar o peixinho a' frente os bracos tem que subir em
 * espaco do corpo (`C`), e as pernas so' precisam de um `T` pequeno pra sair do
 * chao — elas ja' vem esticadas pra tras pela inclinacao. Escrever isto com `F`
 * de "pra frente", que foi a primeira tentativa, enfiava os bracos na areia.
 *
 * Nada de deitar tronco aqui: quem deita e' o Motor, quem estica e' esta pose.
 */
const MERGULHO: Receita = {
  nome: 'Mergulho',
  duracao: 0.5,
  quadros: [
    quadro(0, 0, {
      UpperArmR: mix([C, 3], [F, 0.8]), LowerArmR: mix([C, 3], [F, 0.6]),
      UpperArmL: mix([C, 3], [F, 0.8]), LowerArmL: mix([C, 3], [F, 0.6]),
      // Peito pra tras do corpo = cabeca erguida quando deitado: quem mergulha
      // olha a bola, nao a areia.
      Chest: mix([C, 7], [T, 1]),
      UpperLegR: mix([B, 5], [T, 1]), LowerLegR: mix([B, 5], [T, 1.4]),
      UpperLegL: mix([B, 5], [T, 1]), LowerLegL: mix([B, 5], [T, 1.4]),
    }),
    quadro(0.5, 0, {
      // A mao desce pro chao no fim do voo: e' o amortecimento do tombo.
      UpperArmR: mix([C, 3], [F, 1.4]), LowerArmR: mix([C, 3], [F, 1.2]),
      UpperArmL: mix([C, 3], [F, 1.4]), LowerArmL: mix([C, 3], [F, 1.2]),
      Chest: mix([C, 8], [T, 1]),
      UpperLegR: mix([B, 4], [T, 1]), LowerLegR: mix([B, 4], [T, 1.6]),
      UpperLegL: mix([B, 4], [T, 1]), LowerLegL: mix([B, 4], [T, 1.6]),
    }),
  ],
};

/**
 * ATAQUE — a batida DE PE'. A do ar e' a `Cortada`.
 *
 * t=0 e' o contato: braco direito no alto e ESTICADO (o `LowerArm` aponta quase
 * pra onde o `UpperArm` aponta), que e' o que separa uma batida de um tapa.
 * Depois o braco varre pra baixo e pra frente, e o ultimo quadro agacha pra
 * absorver.
 */
const ATAQUE: Receita = {
  nome: 'Ataque',
  duracao: 0.45,
  quadros: [
    quadro(0, 0, {
      // Quase na vertical e esticado: a mao tem que ser, sozinha, o ponto mais
      // alto do corpo.
      UpperArmR: mix([C, 4], [F, 1]), LowerArmR: mix([C, 4], [F, 1.2]),
      /**
       * O braco de mira vai pro QUADRIL, nao pro peito.
       *
       * E' o que o cortador faz de verdade — o braco livre puxa pra baixo pra
       * girar o tronco — e e' tambem a unica coisa que faz o gesto ler como
       * ataque a' distancia. Com os dois bracos em cima, ataque, saque,
       * levantamento e pulo viram a mesma silhueta: "levantou os dois bracos".
       */
      UpperArmL: mix([B, 2], [T, 1], [E, 0.5]), LowerArmL: mix([B, 2], [T, 0.8]),
      Chest: mix([C, 7], [T, 1]),
    }),
    quadro(0.18, 0, {
      // A varrida passa do quadril: e' ela que le' como pancada, e nao como
      // "baixou o braco".
      UpperArmR: mix([F, 1.5], [B, 2.5]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 2.5], [T, 0.6]), LowerArmL: mix([B, 2.5], [F, 0.4]),
      Chest: mix([C, 3], [F, 2]),
    }),
    quadro(0.45, 0.12, {
      UpperArmR: mix([B, 3], [F, 1]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 3], [F, 0.6]), LowerArmL: mix([B, 3], [F, 0.6]),
      Chest: mix([C, 8], [F, 1]),
    }),
  ],
};

/**
 * CORTADA — o ataque no AR.
 *
 * Separada do `Ataque` porque as pernas sao outras. A batida de pe' pisa na
 * areia; a cortada acontece no alto do salto, com o corpo em arco: joelhos
 * dobrados e pes pra tras no contato, e o corpo fechando feito canivete na
 * varrida — e' o fechar que da' a pancada. O `Ataque` antigo servia pros dois,
 * e a cortada saia de perna reta, pendurada no ar.
 *
 * Perna escrita a mao = quadro no ar: o pe' vai preso na canela, apontado.
 */
const CORTADA: Receita = {
  nome: 'Cortada',
  duracao: 0.45,
  quadros: [
    quadro(0, 0, {
      UpperArmR: mix([C, 4], [F, 1]), LowerArmR: mix([C, 4], [F, 1.3]),
      UpperArmL: mix([B, 2], [T, 0.6], [E, 0.5]), LowerArmL: mix([B, 2], [F, 0.3]),
      // O arco: peito pra tras, e as pernas dobradas atras do corpo.
      Chest: mix([C, 6], [T, 1]),
      UpperLegR: mix([B, 3], [F, 0.35]), LowerLegR: mix([B, 1.3], [T, 2]),
      UpperLegL: mix([B, 3], [F, 0.1]), LowerLegL: mix([B, 1.5], [T, 1.7]),
    }),
    quadro(0.16, 0, {
      // O canivete: braco varre pra baixo, peito fecha, coxas sobem.
      UpperArmR: mix([F, 1.5], [B, 2.2], [E, 0.4]), LowerArmR: mix([B, 3], [F, 1.2]),
      UpperArmL: mix([B, 2.5], [T, 0.5]), LowerArmL: mix([B, 2.5], [F, 0.4]),
      Chest: mix([C, 3], [F, 2]),
      UpperLegR: mix([B, 2], [F, 1]), LowerLegR: mix([B, 2], [T, 1.1]),
      UpperLegL: mix([B, 2], [F, 0.8]), LowerLegL: mix([B, 2], [T, 1.2]),
    }),
    quadro(0.45, 0, {
      // Descendo: pernas estendem pra receber o chao, bracos soltos.
      UpperArmR: mix([B, 3], [F, 1]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 3], [F, 0.6]), LowerArmL: mix([B, 3], [F, 0.6]),
      Chest: mix([C, 8], [F, 1]),
      UpperLegR: mix([B, 5], [F, 0.5]), LowerLegR: mix([B, 5], [T, 0.4]),
      UpperLegL: mix([B, 5], [F, 0.3]), LowerLegL: mix([B, 5], [T, 0.5]),
    }),
  ],
};

/**
 * MANCHETE.
 *
 * O gesto inteiro e' AGACHAR: quem passa de manchete desce no quadril e sobe
 * junto com a bola. Por isso o `descer` de 15 cm no contato e quase nada no
 * acompanhamento — sem essa subida a manchete vira "ficou parado de braco
 * estendido", que foi como ela saiu na primeira tentativa.
 *
 * Nos bracos, duas coisas fazem ler como manchete e nenhuma e' obvia: o
 * cotovelo nao dobrar (`LowerArm` quase na direcao do `UpperArm`) e as maos se
 * encontrarem no meio — por isso o direito puxa pra `E` e o esquerdo pra `D`.
 * Sem essa convergencia os ombros mantem as maos a 20 cm uma da outra e viram
 * dois bracos soltos em vez de uma plataforma.
 */
const MANCHETE: Receita = {
  nome: 'Manchete',
  duracao: 0.4,
  quadros: [
    quadro(0, 0.15, {
      UpperArmR: mix([B, 2], [F, 1.5], [E, 0.5]), LowerArmR: mix([B, 2], [F, 1.6], [E, 0.4]),
      UpperArmL: mix([B, 2], [F, 1.5], [D, 0.5]), LowerArmL: mix([B, 2], [F, 1.6], [D, 0.4]),
      // Tronco a' frente: o ombro vem por cima da plataforma. So' o braco nao
      // alcanca — ele tem 42 cm e a bola vem na altura do joelho.
      Abdomen: mix([C, 1], [F, 0.45]),
      Chest: mix([C, 5], [F, 1]),
    }),
    quadro(0.16, 0.04, {
      UpperArmR: mix([B, 2], [F, 1.9], [E, 0.4]), LowerArmR: mix([B, 2], [F, 2], [E, 0.3]),
      UpperArmL: mix([B, 2], [F, 1.9], [D, 0.4]), LowerArmL: mix([B, 2], [F, 2], [D, 0.3]),
      Abdomen: mix([C, 1], [F, 0.25]),
      Chest: mix([C, 7], [F, 1]),
    }),
    quadro(0.4, 0.12, {
      UpperArmR: mix([B, 3], [F, 1], [E, 0.2]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 3], [F, 1], [D, 0.2]), LowerArmL: mix([B, 3], [F, 1]),
      Abdomen: mix([C, 1], [F, 0.3]),
      Chest: mix([C, 7], [F, 1]),
    }),
  ],
};

/**
 * LEVANTAMENTO.
 *
 * Maos acima da testa, cotovelos abertos. Aqui o cotovelo DOBRA — e' o oposto
 * exato da manchete, e e' o que separa os dois de relance, a' distancia da
 * camera de jogo, onde o resto do corpo some.
 *
 * O empurrao e' perna junto com braco: o quadril sobe de 10 cm pra zero no
 * mesmo quadro em que os bracos estendem.
 */
const LEVANTAMENTO: Receita = {
  nome: 'Levantamento',
  duracao: 0.35,
  quadros: [
    quadro(0, 0.12, {
      /**
       * Cotovelo QUASE na horizontal e antebraco subindo pra dentro. A mao para
       * na altura da testa, e isso e' o ponto: mao acima da cabeca era o que
       * fazia o levantamento virar o mesmo "bracos pro alto" do pulo e do
       * ataque. O losango cotovelo-mao-cotovelo e' a silhueta do gesto.
       */
      UpperArmR: mix([C, 1], [D, 3], [F, 0.5]), LowerArmR: mix([C, 1], [E, 0.7], [F, 0.35]),
      UpperArmL: mix([C, 1], [E, 3], [F, 0.5]), LowerArmL: mix([C, 1], [D, 0.7], [F, 0.35]),
      Chest: mix([C, 9], [T, 1]),
    }),
    quadro(0.12, 0, {
      // O empurrao: perna estende e a mao sobe um palmo. Continua sem passar do
      // alto da cabeca.
      UpperArmR: mix([C, 1], [D, 2], [F, 0.5]), LowerArmR: mix([C, 1], [E, 0.4], [F, 0.3]),
      UpperArmL: mix([C, 1], [E, 2], [F, 0.5]), LowerArmL: mix([C, 1], [D, 0.4], [F, 0.3]),
      Chest: mix([C, 10], [T, 1]),
    }),
    quadro(0.35, 0.06, {
      UpperArmR: mix([C, 1], [D, 2.5], [F, 0.8]), LowerArmR: mix([C, 1], [F, 0.8]),
      UpperArmL: mix([C, 1], [E, 2.5], [F, 0.8]), LowerArmL: mix([C, 1], [F, 0.8]),
      Chest: mix([C, 8], [F, 1]),
    }),
  ],
};

/**
 * SAQUE.
 *
 * Quase o ataque, sem pulo e sem recolher perna. O que ele tem de proprio e' o
 * braco ESQUERDO: no contato ele ainda esta' no alto, caindo do lancamento —
 * porque a ancora da bola no saque fica do lado esquerdo do corpo, e uma mao
 * esquerda ja' recolhida faria a bola aparecer sozinha no ar.
 */
const SAQUE: Receita = {
  nome: 'Saque',
  duracao: 0.5,
  quadros: [
    quadro(0, 0, {
      UpperArmR: mix([C, 4], [F, 1]), LowerArmR: mix([C, 4], [F, 1.2]),
      // Esticada pra FRENTE, na altura do ombro: e' a mao que acabou de largar
      // a bola e ficou apontando pra ela. No alto, ao lado da outra, lia como
      // comemoracao — e igual ao pulo e ao levantamento.
      UpperArmL: mix([F, 2], [C, 0.5], [E, 0.6]), LowerArmL: mix([F, 2], [C, 0.4], [E, 0.3]),
      Chest: mix([C, 9], [F, 1]),
    }),
    quadro(0.22, 0.04, {
      UpperArmR: mix([F, 1.5], [B, 2]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 1.5], [F, 1], [E, 0.5]), LowerArmL: mix([B, 2], [F, 1]),
      Chest: mix([C, 5], [F, 2]),
    }),
    quadro(0.5, 0.06, {
      UpperArmR: mix([B, 3], [F, 1]), LowerArmR: mix([B, 3], [F, 1]),
      UpperArmL: mix([B, 3], [F, 0.6]), LowerArmL: mix([B, 3], [F, 0.6]),
      Chest: mix([C, 8], [F, 1]),
    }),
  ],
};

/**
 * ATERRISSAGEM — o amortecimento de quem cai de um salto.
 *
 * Sem ela o `Pulo` ficava congelado de braco pro alto ate' o pe' tocar a areia
 * e dai' cortava seco pra corrida: o boneco pousava duro, feito peca de metal.
 * Quem cai de um salto dobra o joelho e baixa os bracos pra frente, e sobe.
 * E' curta, e quem decide quando entra e' `clipeDoCorpo` (`pousando`).
 */
const ATERRISSAGEM: Receita = {
  nome: 'Aterrissagem',
  duracao: 0.3,
  quadros: [
    quadro(0, 0.17, {
      UpperArmR: mix([B, 3], [F, 1], [D, 0.4]), LowerArmR: mix([B, 2], [F, 1.2]),
      UpperArmL: mix([B, 3], [F, 1], [E, 0.4]), LowerArmL: mix([B, 2], [F, 1.2]),
      Chest: mix([C, 5], [F, 1.2]),
    }),
    quadro(0.3, 0.03, {
      UpperArmR: mix([B, 4], [F, 0.5]), LowerArmR: mix([B, 4], [F, 0.6]),
      UpperArmL: mix([B, 4], [F, 0.5]), LowerArmL: mix([B, 4], [F, 0.6]),
      Chest: mix([C, 8], [F, 0.6]),
    }),
  ],
};

/**
 * ESPERA DO SAQUE — a bola na mao esquerda, a direita solta.
 *
 * O sacador ficava de braco caido com a bola boiando ao lado do corpo. E' como
 * se saca destro: a esquerda segura (e depois larga, que e' o braco esticado do
 * `Saque`), a direita bate. No jogo a bola vai em cima do osso desta palma
 * (`Athlete.levarBolaNaMao`), entao a palma tem que ficar virada pra CIMA — ha'
 * teste pra isso, com o `Idle` por baixo como no jogo.
 *
 * E' CAMADA: o sacador pode andar pela linha de fundo escolhendo o lugar, e a
 * bola tem que continuar na mao enquanto as pernas andam.
 */
const ESPERA_DO_SAQUE: Receita = {
  nome: 'EsperaDoSaque',
  duracao: 0.8,
  camada: true,
  quadros: [
    // A palma vira pra cima com a torcao dividida entre antebraco e punho: um
    // quarto de volta num osso so' estrangulava a pele do pulso.
    quadro(0, 0, {
      UpperArmL: mix([B, 2.5], [F, 1], [E, 0.8]), LowerArmL: mix([F, 2], [E, 0.35]),
      UpperArmR: mix([B, 4], [F, 0.4], [D, 0.2]), LowerArmR: mix([B, 3], [F, 0.8]),
      Chest: mix([C, 9], [F, 0.5]),
    }, { LowerArmL: -0.8, WristL: -0.77 }),
    quadro(0.8, 0, {
      UpperArmL: mix([B, 2.5], [F, 1], [E, 0.8]), LowerArmL: mix([F, 2], [E, 0.35]),
      UpperArmR: mix([B, 4], [F, 0.5], [D, 0.2]), LowerArmR: mix([B, 3], [F, 1]),
      Chest: mix([C, 9], [F, 0.6]),
    }, { LowerArmL: -0.8, WristL: -0.77 }),
  ],
};

export const RECEITAS: readonly Receita[] = [
  PULO, MERGULHO, ATAQUE, CORTADA, MANCHETE, LEVANTAMENTO, SAQUE, ATERRISSAGEM, ESPERA_DO_SAQUE,
];

/**
 * Os clipes que tocam UMA VEZ e param no ultimo quadro.
 *
 * Todos estes, e nenhum do pack. Os gestos porque um acompanhamento em ciclo
 * viraria tique; `Pulo` e `Mergulho` porque o ultimo quadro DELES e' a pose de
 * manter — voltar ao inicio no meio do voo seria o corpo se recolhendo no ar.
 */
export const DE_UMA_VEZ: ReadonlySet<string> = new Set(RECEITAS.map((r) => r.nome));

/** Os clipes de camada: tocam por cima do corpo, so' nos ossos que escrevem. */
export const CAMADAS: ReadonlySet<string> = new Set(RECEITAS.filter((r) => r.camada).map((r) => r.nome));

/** Quanto o gesto segura o corpo, em segundos. Sai da propria receita. */
export function duracaoDoToque(acao: Acao): number {
  const nome = CLIPE_DO_TOQUE[acao];
  return RECEITAS.find((r) => r.nome === nome)?.duracao ?? 0;
}

// ---------------------------------------------------- de pose pra AnimationClip

const _alvo = new THREE.Vector3();
const _paiInv = new THREE.Quaternion();
const _local = new THREE.Quaternion();
const _torcao = new THREE.Quaternion();

/**
 * O quaternion LOCAL que faz este osso apontar pra `direcao`, em espaco do corpo.
 *
 * `eixoLocal` e' pra onde a ponta do osso aponta no espaco DELE. A conta e':
 * leva a direcao desejada pro espaco do pai, e acha a rotacao que manda
 * `eixoLocal` pra la'.
 *
 * O giro em torno do proprio osso fica livre, e isso e' aceitavel: em braco e
 * perna ninguem ve' a torcao, e fixar ela exigiria escrever a pose em angulo
 * por eixo — que e' exatamente o que este arquivo existe pra evitar.
 */
function apontar(osso: THREE.Bone, eixoLocal: THREE.Vector3, direcao: number[], out: THREE.Quaternion): void {
  _alvo.set(direcao[0]!, direcao[1]!, direcao[2]!).normalize();

  const pai = osso.parent;
  if (pai) {
    pai.getWorldQuaternion(_paiInv).invert();
    _alvo.applyQuaternion(_paiInv);
  }

  out.setFromUnitVectors(eixoLocal, _alvo);
}

/**
 * Neste rig todo osso guarda o filho em +Y local.
 *
 * Conferido osso a osso na sonda: ombro, cotovelo, joelho, pescoco, dedo, todos
 * com o filho em (0, +algo, 0). Isso da' um eixo pros ossos FOLHA, que existem e
 * sao usados: o joelho e' folha aqui, porque `FootL`/`FootR` e `PTL`/`PTR` sao
 * alvos de IK pendurados no `Root` — fora da corrente da perna — e nao os pes
 * da hierarquia. Sem este padrao o joelho ficaria sem pose.
 */
const EIXO_PADRAO = new THREE.Vector3(0, 1, 0);

/** Pra onde a ponta do osso aponta no espaco dele proprio. */
function eixoDoOsso(osso: THREE.Bone, out: THREE.Vector3): THREE.Vector3 {
  const filho = osso.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
  if (!filho || filho.position.lengthSq() < 1e-8) return out.copy(EIXO_PADRAO);
  return out.copy(filho.position).normalize();
}

/**
 * Monta as clipes em cima do esqueleto carregado.
 *
 * Precisa do esqueleto porque a pose e' resolvida CONTRA ele: o eixo de cada
 * osso e a rotacao do pai saem do modelo, nao de uma tabela. E' o que faz as
 * receitas continuarem valendo se o pack for atualizado — e o que faz elas
 * falharem alto, e nao caladas, se um osso mudar de nome.
 *
 * Roda no molde recem-carregado e ANTES de qualquer copia: mexe nos ossos pra
 * medir e devolve tudo ao repouso no fim.
 */
export function montarClipes(raiz: THREE.Object3D, receitas: readonly Receita[] = RECEITAS): THREE.AnimationClip[] {
  const ossos = new Map<string, THREE.Bone>();
  raiz.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.set(o.name, o as THREE.Bone); });

  const corpoRepouso = ossos.get('Body')?.position.clone() ?? new THREE.Vector3();
  raiz.updateMatrixWorld(true);
  const pes = medirPes(ossos);
  const reto = medirQuadrilReto(ossos);

  const repouso = new Map<string, THREE.Quaternion>();
  const eixos = new Map<string, THREE.Vector3>();
  for (const [nome, osso] of ossos) {
    repouso.set(nome, osso.quaternion.clone());
    eixos.set(nome, eixoDoOsso(osso, new THREE.Vector3()));
  }

  const corpo = ossos.get('Body');
  const torso = ossos.get('Torso');
  const voltarAoRepouso = (): void => {
    for (const [nome, osso] of ossos) osso.quaternion.copy(repouso.get(nome)!);
    corpo?.position.copy(corpoRepouso);
    raiz.updateMatrixWorld(true);
  };

  const clipes: THREE.AnimationClip[] = [];

  for (const receita of receitas) {
    const camada = receita.camada === true;
    if (camada && receita.quadros.some((q) => q.descer !== 0)) {
      throw new Error(`"${receita.nome}" e' camada e nao tem quadril: descer tem que ser 0`);
    }

    // Que ossos esta receita toca, em qualquer quadro. Os que ela nao toca ficam
    // de fora do clipe, e assim continuam vindo da animacao de baixo.
    const usados = new Set<string>(camada ? [] : PERNAS);
    for (const q of receita.quadros) {
      for (const nome of Object.keys(q.pose)) usados.add(nome);
      for (const nome of Object.keys(q.giros ?? {})) usados.add(nome);
    }

    for (const nome of usados) {
      if (!ossos.has(nome)) throw new Error(`pose de "${receita.nome}": osso "${nome}" nao existe no modelo`);
    }

    /**
     * Pai antes de filho, SEMPRE.
     *
     * A conta usa a rotacao do pai em mundo. Resolver o cotovelo antes do ombro
     * usaria a posicao velha do ombro, e o braco sairia torto de um jeito que so'
     * aparece quando as duas pecas se movem juntas.
     */
    const emOrdem = [...usados].sort((a, b) => profundidade(ossos.get(a)!) - profundidade(ossos.get(b)!));

    const tempos = receita.quadros.map((q) => q.t);
    const valores = new Map<string, number[]>();
    for (const nome of usados) valores.set(nome, []);

    // O quadril, que nao e' pose e sim altura. Ver `pernasDe`.
    const alturas: number[] = [];
    // Os pes: posicao e giro por quadro, pros dois. Ver `PES`.
    const pesPos = pes.map(() => [] as number[]);
    const pesGiro = pes.map(() => [] as number[]);

    for (const quadro of receita.quadros) {
      voltarAoRepouso();

      /**
       * O quadril desce AQUI, antes de posar, e nao so' na trilha do clipe.
       *
       * Os pes sao medidos a partir da canela, e a canela pendura no `Body`:
       * com o quadril ainda na altura de repouso, a perna dobrada de
       * `pernasDe` sobe o tornozelo, e o pe' era gravado `descer` metros acima
       * da areia — 12 cm no fim do ataque. O teste da sola pegou.
       */
      corpo?.position.set(corpoRepouso.x, corpoRepouso.y - quadro.descer, corpoRepouso.z);
      // Quadril reto e tronco compensado, como a caminhada do pack. A camada
      // nao: ela toca por cima do Idle, que mantem o quadril virado.
      if (!camada) {
        corpo?.quaternion.copy(reto.corpo);
        torso?.quaternion.copy(reto.torso);
      }
      raiz.updateMatrixWorld(true);

      // As pernas por baixo, o que a receita escreveu por cima.
      const pose: Pose = camada ? quadro.pose : { ...pernasDe(quadro.descer), ...quadro.pose };

      for (const nome of emOrdem) {
        const direcao = pose[nome];
        const giro = quadro.giros?.[nome];
        if (!direcao && !giro) continue;   // nada neste quadro: fica no repouso

        const osso = ossos.get(nome)!;
        if (direcao && ehPerna(nome)) orientarPerna(osso, nome, direcao, _local);
        else if (direcao) apontar(osso, eixos.get(nome)!, direcao, _local);
        else _local.copy(osso.quaternion);
        if (giro) _local.multiply(_torcao.setFromAxisAngle(eixos.get(nome)!, giro));
        osso.quaternion.copy(_local);
        raiz.updateMatrixWorld(true);
      }

      for (const nome of usados) {
        const q = ossos.get(nome)!.quaternion;
        valores.get(nome)!.push(q.x, q.y, q.z, q.w);
      }

      alturas.push(corpoRepouso.x, corpoRepouso.y - quadro.descer, corpoRepouso.z);

      const noAr = PERNAS.some((n) => n in quadro.pose);
      pes.forEach((pe, i) => {
        pesDoQuadro(pe, noAr, _pePos, _peGiro);
        pesPos[i]!.push(_pePos.x, _pePos.y, _pePos.z);
        pesGiro[i]!.push(_peGiro.x, _peGiro.y, _peGiro.z, _peGiro.w);
      });
    }

    voltarAoRepouso();

    const trilhas: THREE.KeyframeTrack[] = [...usados].map((nome) =>
      new THREE.QuaternionKeyframeTrack(`${nome}.quaternion`, tempos, valores.get(nome)!));

    if (camada) {
      clipes.push(new THREE.AnimationClip(receita.nome, receita.duracao, trilhas));
      continue;
    }

    /**
     * O `Body` entra em TODO clipe, e e' ele quem agacha: as pernas penduram
     * nele, entao dobrar joelho levanta o pe' e quem abaixa o corpo e' este
     * osso descendo.
     *
     * E a rotacao vai RETA, com o `Torso` junto. O modelo foi desenhado com o
     * `Body` girado +27 graus e o `Torso` -27 de volta — o quadril virado de
     * uma base de luta, que e' o Idle do pack. Essas poses herdavam o quadril
     * virado, e as pernas saiam do quadril torto. A caminhada e a corrida do
     * pack fazem o que se faz aqui: `Body` a 0 e o `Torso` compensado. Mexer so'
     * num dos dois torce o tronco — a mao esquerda ia 12 cm mais funda que a
     * direita — e por isso os dois vao sempre juntos (`medirQuadrilReto`).
     */
    const bq = reto.corpo;
    const tq = reto.torso;
    trilhas.push(new THREE.VectorKeyframeTrack('Body.position', tempos, alturas));
    trilhas.push(new THREE.QuaternionKeyframeTrack('Body.quaternion', tempos,
      tempos.flatMap(() => [bq.x, bq.y, bq.z, bq.w])));
    if (torso && !usados.has('Torso')) {
      trilhas.push(new THREE.QuaternionKeyframeTrack('Torso.quaternion', tempos,
        tempos.flatMap(() => [tq.x, tq.y, tq.z, tq.w])));
    }

    pes.forEach((pe, i) => {
      trilhas.push(new THREE.VectorKeyframeTrack(`${pe.pe.name}.position`, tempos, pesPos[i]!));
      trilhas.push(new THREE.QuaternionKeyframeTrack(`${pe.pe.name}.quaternion`, tempos, pesGiro[i]!));
    });

    clipes.push(new THREE.AnimationClip(receita.nome, receita.duracao, trilhas));
  }

  return clipes;
}

/**
 * A TORCAO da perna: o que `apontar` nao sabe.
 *
 * `apontar` diz pra onde o osso aponta e deixa livre o giro em volta dele. No
 * braco ninguem ve'; na perna ve' todo mundo. O repouso deste modelo tem a
 * perna esquerda virada ~50 graus pra fora (a passada do rig), e as poses
 * dobravam o joelho pra frente com a rotula virada pro lado: a perna parecia
 * torcida, e o pe', preso na canela, ia junto — no pulo os dois pes apontavam
 * pro mesmo lado.
 *
 * A convencao foi MEDIDA na caminhada do pack, que esta' certa: a coxa tem o
 * +Z local de lado (pra -X na esquerda, +X na direita); a canela e o pe' tem o
 * +X local pra +X; o bico do pe' e' o +Y local, e o +Z sai da sola pro chao. Com o osso
 * apontado (+Y) e o lado fixo, a rotacao inteira esta' decidida — sem torcao
 * sobrando pra escolher errado.
 */
const COXAS: Readonly<Record<string, number>> = { UpperLegL: -1, UpperLegR: 1 };
function ehPerna(nome: string): boolean {
  return nome.startsWith('UpperLeg') || nome.startsWith('LowerLeg');
}

const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _base = new THREE.Matrix4();
const _giroMundo = new THREE.Quaternion();

/** Tira de `v` a parte ao longo de `eixo` (unitario) e normaliza. */
function ortogonal(v: THREE.Vector3, eixo: THREE.Vector3): THREE.Vector3 {
  return v.addScaledVector(eixo, -v.dot(eixo)).normalize();
}

/** O quaternion LOCAL da coxa ou da canela, apontada pra `direcao` e sem torcao. */
function orientarPerna(osso: THREE.Bone, nome: string, direcao: number[], out: THREE.Quaternion): void {
  _by.set(direcao[0]!, direcao[1]!, direcao[2]!).normalize();
  const lado = COXAS[nome];
  if (lado !== undefined) {
    ortogonal(_bz.set(lado, 0, 0), _by);
    _bx.crossVectors(_by, _bz);
  } else {
    ortogonal(_bx.set(1, 0, 0), _by);
    _bz.crossVectors(_bx, _by);
  }
  _giroMundo.setFromRotationMatrix(_base.makeBasis(_bx, _by, _bz));
  const pai = osso.parent;
  if (pai) out.copy(pai.getWorldQuaternion(_paiInv).invert()).multiply(_giroMundo);
  else out.copy(_giroMundo);
}

/**
 * O `Body` sem os 27 graus, e o `Torso` que mantem o tronco de frente com ele.
 *
 * As duas medidas saem juntas porque uma so' vale com a outra: o `Torso`
 * compensa o giro do `Body`, e trocar um sem o outro vira o peito de lado.
 */
function medirQuadrilReto(ossos: Map<string, THREE.Bone>): { corpo: THREE.Quaternion; torso: THREE.Quaternion } {
  const corpo = ossos.get('Body');
  const torso = ossos.get('Torso');
  if (!corpo?.parent || !torso?.parent) {
    return { corpo: corpo?.quaternion.clone() ?? new THREE.Quaternion(), torso: torso?.quaternion.clone() ?? new THREE.Quaternion() };
  }
  const corpoMundo = corpo.getWorldQuaternion(new THREE.Quaternion());
  const torsoMundo = torso.getWorldQuaternion(new THREE.Quaternion());
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(corpoMundo);
  const retoMundo = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(frente.x, frente.z))
    .multiply(corpoMundo);
  const corpoLocal = corpo.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(retoMundo);

  // O Torso e' medido com o Body ja' reto, e o repouso volta no fim.
  const antes = corpo.quaternion.clone();
  corpo.quaternion.copy(corpoLocal);
  corpo.updateMatrixWorld(true);
  const torsoLocal = torso.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(torsoMundo);
  corpo.quaternion.copy(antes);
  corpo.updateMatrixWorld(true);
  return { corpo: corpoLocal, torso: torsoLocal };
}

/** Um pe' e a canela dele, medidos no repouso. */
interface MedidaDoPe {
  pe: THREE.Bone;
  canela: THREE.Bone;
  /**
   * Do tornozelo (ponta da canela) ate' a origem do pe', no espaco DO PE'.
   *
   * Preso ao pe', e nao ao mundo: o pe' gira em volta do tornozelo, e a
   * distancia entre os dois ossos que seguram o sapato nunca muda — e' o que
   * impede o sapato de esticar.
   */
  doTornozelo: THREE.Vector3;
}

/** Mede os dois pes no repouso. Chamar com o esqueleto em repouso e atualizado. */
function medirPes(ossos: Map<string, THREE.Bone>): MedidaDoPe[] {
  return PES.map(([nomeDoPe, nomeDaCanela]) => {
    const pe = ossos.get(nomeDoPe);
    const canela = ossos.get(nomeDaCanela);
    if (!pe || !canela) throw new Error(`o modelo nao tem ${nomeDoPe}/${nomeDaCanela}`);
    const tornozelo = canela.localToWorld(new THREE.Vector3(0, OSSO_DA_PERNA, 0));
    const giro = pe.getWorldQuaternion(new THREE.Quaternion());
    return {
      pe,
      canela,
      doTornozelo: pe.getWorldPosition(new THREE.Vector3()).sub(tornozelo).applyQuaternion(giro.invert()),
    };
  });
}

/**
 * O pe' plano e de frente: bico (+Y local) pra frente, +Z saindo da sola pra baixo, e o
 * +X de lado. E' o pe' plantado da caminhada do pack. O do repouso NAO serve:
 * o esquerdo vem virado ~60 graus pra fora.
 */
const PE_PLANO = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)));

/** No ar, o bico desce ALEM da canela: pe' esticado de quem saltou. */
const PONTA_DO_PE = 0.35;

const _mundo = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _pePos = new THREE.Vector3();
const _peGiro = new THREE.Quaternion();
const _peMundo = new THREE.Vector3();
const _escala = new THREE.Vector3(1, 1, 1);
const _tornozelo = new THREE.Vector3();
const _joelho = new THREE.Vector3();
const _canela = new THREE.Vector3();
const _eixoX = new THREE.Vector3(1, 0, 0);
const _inclinar = new THREE.Quaternion();

/**
 * Onde o pe' vai neste quadro, em espaco do pai dele (o `Root`).
 *
 * Dois jeitos, e quem decide e' a receita escrever perna ou nao:
 *
 * - NO CHAO (perna de `pernasDe`): sola plana, de frente, embaixo do
 *   tornozelo. A canela inclina e o pe' nao: o sapato dobra no tornozelo, que
 *   e' o que um tornozelo faz.
 * - NO AR (perna escrita): o pe' inclina com a canela em volta do eixo do
 *   lado — sempre de frente, nunca virado — e o bico desce mais
 *   `PONTA_DO_PE`, o pe' esticado de quem salta.
 *
 * Nos dois, a origem do pe' fica a' mesma distancia do tornozelo que no
 * repouso, medida no espaco do pe': o sapato nao estica.
 */
function pesDoQuadro(m: MedidaDoPe, noAr: boolean, pos: THREE.Vector3, giro: THREE.Quaternion): void {
  m.canela.localToWorld(_tornozelo.set(0, OSSO_DA_PERNA, 0));
  _giroMundo.copy(PE_PLANO);
  if (noAr) {
    m.canela.getWorldPosition(_joelho);
    _canela.subVectors(_tornozelo, _joelho).normalize();
    // O angulo em volta do eixo do lado que leva "pra baixo" ate' a canela.
    const inclinacao = Math.atan2(-_canela.z, -_canela.y);
    _giroMundo.premultiply(_inclinar.setFromAxisAngle(_eixoX, inclinacao + PONTA_DO_PE));
  }
  _peMundo.copy(m.doTornozelo).applyQuaternion(_giroMundo).add(_tornozelo);
  _mundo.compose(_peMundo, _giroMundo, _escala.set(1, 1, 1));
  const pai = m.pe.parent;
  if (pai) _mundo.premultiply(_inv.copy(pai.matrixWorld).invert());
  _mundo.decompose(pos, giro, _escala);
}

function profundidade(osso: THREE.Object3D): number {
  let n = 0;
  for (let o: THREE.Object3D | null = osso; o; o = o.parent) n++;
  return n;
}

/** Os eixos do corpo, pro teste conferir que a sonda continua valendo. */
export const DIRECOES = { F, T, C, B, D, E } as const;
