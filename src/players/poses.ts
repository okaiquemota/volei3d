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
}

export interface Receita {
  nome: string;
  duracao: number;
  quadros: Quadro[];
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
 * Um quadro-chave. `pose` e' so' o que a receita escreveu a mao.
 *
 * As pernas vem por baixo, de `pernasDe`, na hora de montar o clipe — e o que a
 * receita escrever sobre perna VENCE. E' como pulo e mergulho recolhem e
 * esticam as pernas, que nesses dois nao estao pisando em nada.
 */
function quadro(t: number, descer: number, pose: Pose): Quadro {
  return { t, descer, pose };
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
      UpperLegR: mix([B, 3], [T, 1]), LowerLegR: mix([B, 2], [T, 1.2]),
      UpperLegL: mix([B, 3], [T, 1]), LowerLegL: mix([B, 2], [T, 1.2]),
    }),
    quadro(0.6, 0, {
      // Braco direito armado atras da cabeca, esquerdo a' frente pra mirar: e'
      // a pose de quem vai cortar, e encaixa no quadro de contato do `Ataque`.
      UpperArmR: mix([C, 2.5], [T, 1.2]), LowerArmR: mix([C, 1.5], [T, 1.2]),
      UpperArmL: mix([C, 2.5], [F, 0.8]), LowerArmL: mix([C, 3], [F, 0.5]),
      UpperLegR: mix([B, 4], [T, 1]), LowerLegR: mix([B, 3], [T, 1]),
      UpperLegL: mix([B, 4], [T, 1]), LowerLegL: mix([B, 3], [T, 1]),
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
 * ATAQUE — a cortada, e a batida de pe'.
 *
 * t=0 e' o contato: braco direito no alto e ESTICADO (o `LowerArm` aponta quase
 * pra onde o `UpperArm` aponta), que e' o que separa uma cortada de um tapa.
 * Depois o braco varre pra baixo e pra frente, e o ultimo quadro ja' e' a
 * aterrissagem agachada.
 *
 * Tem perna recolhida porque a cortada quase sempre e' no ar: sem ela o `Pulo`
 * sai do ar assim que o gesto entra, e o boneco atacaria de perna reta.
 */
const ATAQUE: Receita = {
  nome: 'Ataque',
  duracao: 0.45,
  quadros: [
    quadro(0, 0, {
      UpperArmR: mix([C, 3], [F, 1.4]), LowerArmR: mix([C, 3], [F, 1.5]),
      // O braco de MIRA desce enquanto o outro bate. Com os dois no alto — que
      // foi a primeira tentativa — nao da' pra dizer qual bateu na bola.
      UpperArmL: mix([C, 0.6], [F, 1]), LowerArmL: mix([C, 0.5], [F, 1]),
      Chest: mix([C, 7], [F, 1]),
    }),
    quadro(0.2, 0, {
      UpperArmR: mix([F, 2], [B, 1.8], [E, 0.4]), LowerArmR: mix([F, 1], [B, 2.4], [E, 0.3]),
      UpperArmL: mix([B, 2], [E, 0.8]), LowerArmL: mix([B, 2], [F, 0.5]),
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
    quadro(0, 0.1, {
      UpperArmR: mix([C, 1], [D, 1.2], [F, 0.3]), LowerArmR: mix([C, 2], [F, 0.7], [E, 0.5]),
      UpperArmL: mix([C, 1], [E, 1.2], [F, 0.3]), LowerArmL: mix([C, 2], [F, 0.7], [D, 0.5]),
      Chest: mix([C, 9], [T, 1]),
    }),
    quadro(0.12, 0, {
      UpperArmR: mix([C, 2.5], [D, 1], [F, 0.4]), LowerArmR: mix([C, 3], [F, 0.5], [E, 0.3]),
      UpperArmL: mix([C, 2.5], [E, 1], [F, 0.4]), LowerArmL: mix([C, 3], [F, 0.5], [D, 0.3]),
      Chest: mix([C, 10], [T, 1]),
    }),
    quadro(0.35, 0.06, {
      UpperArmR: mix([C, 0.6], [D, 1.2], [F, 0.5]), LowerArmR: mix([C, 1.2], [F, 1]),
      UpperArmL: mix([C, 0.6], [E, 1.2], [F, 0.5]), LowerArmL: mix([C, 1.2], [F, 1]),
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
      UpperArmR: mix([C, 3], [F, 1]), LowerArmR: mix([C, 3], [F, 1.2]),
      // Aberta pro lado e mais baixa: a mao acabou de largar a bola, e duas
      // maos no alto lado a lado leem como comemoracao, nao como saque.
      UpperArmL: mix([C, 1], [F, 0.8], [E, 1]), LowerArmL: mix([C, 1.2], [F, 0.8], [E, 0.6]),
      Chest: mix([C, 8], [F, 1]),
    }),
    quadro(0.22, 0.04, {
      UpperArmR: mix([F, 2], [B, 1.2]), LowerArmR: mix([F, 1.4], [B, 2]),
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

export const RECEITAS: readonly Receita[] = [PULO, MERGULHO, ATAQUE, MANCHETE, LEVANTAMENTO, SAQUE];

/**
 * Os clipes que tocam UMA VEZ e param no ultimo quadro.
 *
 * Todos estes, e nenhum do pack. Os gestos porque um acompanhamento em ciclo
 * viraria tique; `Pulo` e `Mergulho` porque o ultimo quadro DELES e' a pose de
 * manter — voltar ao inicio no meio do voo seria o corpo se recolhendo no ar.
 */
export const DE_UMA_VEZ: ReadonlySet<string> = new Set(RECEITAS.map((r) => r.nome));

/** Quanto o gesto segura o corpo, em segundos. Sai da propria receita. */
export function duracaoDoToque(acao: Acao): number {
  const nome = CLIPE_DO_TOQUE[acao];
  return RECEITAS.find((r) => r.nome === nome)?.duracao ?? 0;
}

// ---------------------------------------------------- de pose pra AnimationClip

const _alvo = new THREE.Vector3();
const _paiInv = new THREE.Quaternion();
const _local = new THREE.Quaternion();

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

  const repouso = new Map<string, THREE.Quaternion>();
  const eixos = new Map<string, THREE.Vector3>();
  for (const [nome, osso] of ossos) {
    repouso.set(nome, osso.quaternion.clone());
    eixos.set(nome, eixoDoOsso(osso, new THREE.Vector3()));
  }

  const voltarAoRepouso = (): void => {
    for (const [nome, osso] of ossos) osso.quaternion.copy(repouso.get(nome)!);
    raiz.updateMatrixWorld(true);
  };

  const clipes: THREE.AnimationClip[] = [];

  for (const receita of receitas) {
    // Que ossos esta receita toca, em qualquer quadro. Os que ela nao toca ficam
    // de fora do clipe, e assim continuam vindo da animacao de baixo.
    const usados = new Set<string>(PERNAS);
    for (const q of receita.quadros) for (const nome of Object.keys(q.pose)) usados.add(nome);

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

    for (const quadro of receita.quadros) {
      voltarAoRepouso();

      // As pernas por baixo, o que a receita escreveu por cima.
      const pose: Pose = { ...pernasDe(quadro.descer), ...quadro.pose };

      for (const nome of emOrdem) {
        const direcao = pose[nome];
        if (!direcao) continue;   // sem direcao neste quadro: fica no repouso

        const osso = ossos.get(nome)!;
        apontar(osso, eixos.get(nome)!, direcao, _local);
        osso.quaternion.copy(_local);
        raiz.updateMatrixWorld(true);
      }

      for (const nome of usados) {
        const q = ossos.get(nome)!.quaternion;
        valores.get(nome)!.push(q.x, q.y, q.z, q.w);
      }

      alturas.push(corpoRepouso.x, corpoRepouso.y - quadro.descer, corpoRepouso.z);
    }

    voltarAoRepouso();

    const trilhas: THREE.KeyframeTrack[] = [...usados].map((nome) =>
      new THREE.QuaternionKeyframeTrack(`${nome}.quaternion`, tempos, valores.get(nome)!));

    /**
     * O `Body` entra em TODO clipe, e e' ele quem agacha: as pernas penduram
     * nele, entao dobrar joelho levanta o pe' e quem abaixa o corpo e' este
     * osso descendo.
     *
     * A rotacao vai junto, PRESA NO REPOUSO — e repouso quer dizer os 27 graus
     * de giro em Y que ele tem, nao a identidade. Zerar parecia mais limpo e
     * torcia o boneco inteiro: o modelo foi desenhado com o `Body` girado +27 e
     * o `Torso` girado -27,7 de volta, um cancelando o outro. Mexendo so' num
     * dos dois, o tronco saia de lado — dava pra ver na sonda, com a mao
     * esquerda 12 cm mais funda que a direita em todas as poses.
     */
    const bq = repouso.get('Body') ?? new THREE.Quaternion();
    trilhas.push(new THREE.VectorKeyframeTrack('Body.position', tempos, alturas));
    trilhas.push(new THREE.QuaternionKeyframeTrack('Body.quaternion', tempos,
      tempos.flatMap(() => [bq.x, bq.y, bq.z, bq.w])));

    clipes.push(new THREE.AnimationClip(receita.nome, receita.duracao, trilhas));
  }

  return clipes;
}

function profundidade(osso: THREE.Object3D): number {
  let n = 0;
  for (let o: THREE.Object3D | null = osso; o; o = o.parent) n++;
  return n;
}

/** Os eixos do corpo, pro teste conferir que a sonda continua valendo. */
export const DIRECOES = { F, T, C, B, D, E } as const;
