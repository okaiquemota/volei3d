/**
 * Todos os numeros que valem a pena mexer ficam aqui.
 *
 * Os valores vieram do prototipo em Unity (hoje em RIP.volei3d-unity) e foram
 * mantidos como estavam: o port e' de COMPORTAMENTO, entao mudar tuning aqui
 * so' depois que o jogo estiver jogando igual ao original.
 *
 * Convencao de eixos, no espaco LOCAL da quadra:
 *   X = largura (lateral)
 *   Z = comprimento; a rede fica no plano Z = 0
 *   Y = altura; o chao da quadra fica em Y = 0
 *
 * O lado HOME (voce) vive em Z negativo, o AWAY (CPU) em Z positivo.
 */

/** Gravidade do mundo. A bola e o atleta multiplicam esta base. */
export const GRAVITY = 9.81;

export const COURT = {
  /** Comprimento no eixo Z. Oficial de volei de praia: 16 m. */
  length: 16,
  /** Largura no eixo X. Oficial: 8 m. */
  width: 8,
  /** Largura da fita das linhas demarcatorias. */
  lineWidth: 0.06,
  /**
   * Faixa de areia em volta da quadra.
   *
   * Nao e' so' visual: e' TAMBEM o limite de corrida dos atletas. Diminuir isso
   * aperta o jogo, porque uma bola profunda deixa de ser alcancavel.
   */
  freeZone: 4,

  /** Altura da borda superior da rede. */
  netHeight: 2.24,
  /** Altura da malha, medida do topo pra baixo. */
  netDepth: 1.0,
  /** Espessura do colisor da rede. */
  netThickness: 0.08,
  postHeight: 2.55,
  /** Distancia do poste pra fora da linha lateral. */
  postOffset: 0.7,

  /** Distancia da rede em que o atleta nasce, como fracao do meio-campo. */
  spawnDepthRatio: 0.6,
  /** Distancia atras da linha de fundo em que o sacador se posiciona. */
  serveBackOffset: 0.8,
  /** Altura em que a bola fica parada, na mao do sacador, antes do saque. */
  serveBallHeight: 1.35,
} as const;

export const BALL = {
  radius: 0.105,
  /**
   * Gravidade efetiva da bola: 9.81 x 1.35.
   *
   * O multiplicador existe pra deixar as trocas mais rapidas sem quebrar a
   * leitura da trajetoria — bola de volei real "flutua" demais pra um jogo em
   * terceira pessoa. E' o `g` de TODOS os calculos de trajetoria.
   */
  gravity: 9.81 * 1.35,
  /** Arrasto do ar. Baixo de proposito: trajetoria previsivel. */
  damping: 0.12,
  /** Teto de velocidade. Evita a bola sumir num toque mal resolvido. */
  maxSpeed: 34,
  /**
   * Abaixo desta velocidade, em contato com o chao, a bola dorme.
   * Sem isso ela treme na areia pra sempre.
   */
  sleepSpeed: 0.2,
  /** Spin visual (rad/s). Nao afeta a trajetoria: nao ha' efeito Magnus. */
  visualSpin: 8,
} as const;

/**
 * Restituicao e atrito por superficie.
 *
 * No Unity isso saia da combinacao dos materiais de fisica dos dois colisores,
 * com uma regra de precedencia que nao e' obvia (vence o modo de maior enum).
 * Aqui os valores JA' ESTAO combinados — sao o resultado final, nao os
 * ingredientes.
 */
export const SURFACE = {
  /** Areia: quique curto, a bola morre rapido. */
  sand: { restitution: 0.415, tangential: 0.65 },
  /** Rede: praticamente mata a bola. */
  net: { restitution: 0.05, tangential: 0.6 },
  /** Poste: duro, devolve. */
  post: { restitution: 0.55, tangential: 0.8 },
  /** Fora do campo: so' precisa resolver o ponto. */
  out: { restitution: 0.35, tangential: 0.5 },
} as const;

/**
 * Medidas e cores do CORPO. Separadas de ATHLETE, que e' fisica.
 *
 * Um atleta de 1,86 m: quadril na metade, ombro a 1,47, topo da cabeca em
 * 1,85. Nao sao numeros de gosto — sao as proporcoes que fazem a silhueta ler
 * como pessoa em vez de boneco.
 */
export const ATLETA = {
  ombroY: 1.47,
  quadrilY: 0.95,
  /**
   * Ombro mais LARGO que o tronco, de proposito.
   *
   * Com o ombro em 0.21 e o tronco em 0.175 de raio, o braco nascia dentro da
   * capsula e os dois viravam uma massa so'. A silhueta precisa do vao entre
   * braco e tronco pra ler como pessoa.
   */
  ombroX: 0.235,
  quadrilX: 0.1,
  bracoComprimento: 0.62,
  pernaComprimento: 0.95,

  pele: 0xd9a879,
  cabelo: 0x2a2119,

  /** Passadas por metro corrido. Define o ritmo da animacao. */
  passadasPorMetro: 1.35,
  /** Quanto a perna gira no auge da passada, em radianos. */
  amplitudeDaPassada: 0.62,
  /** Repetido de ATHLETE pra animacao normalizar a corrida sem importar fisica. */
  moveSpeed: 6.5,
} as const;

export const ATHLETE = {
  /** Altura e raio da capsula de colisao. */
  height: 1.86,
  radius: 0.32,

  moveSpeed: 6.5,
  acceleration: 45,
  deceleration: 60,

  jumpHeight: 0.85,
  /**
   * Gravidade do corpo: 2x a do mundo.
   *
   * Pulo com a gravidade do mundo fica lento e "lunar". Dobrando, o salto sai
   * seco — sobe rapido, para no alto, desce rapido — que e' como um atleta pula.
   */
  gravity: GRAVITY * 2,
  /** Janela em que o pulo ainda e' aceito depois de sair do chao. */
  coyoteTime: 0.08,
  /** Velocidade da virada (usada com damp). */
  turnSpeed: 14,
} as const;

export const HIT = {
  /** Distancia horizontal maxima entre atleta e bola pra tocar. */
  reachRadius: 1.3,
  /** Altura maxima alcancavel, a partir dos pes. */
  verticalReach: 2.7,
  /** Quanto abaixo dos pes ainda conta como alcance (bola rasteira). */
  lowReach: 0.35,
  /** Intervalo minimo entre dois toques do mesmo atleta. */
  cooldown: 0.3,

  /** Bola ate' esta altura (a partir dos pes) vira manchete. */
  bumpMaxHeight: 1.15,
  /** Altura minima pra cortar, com o atleta no ar. */
  spikeMinHeight: 1.75,

  /** Apice do arco, em metros de MUNDO. */
  bumpApex: 5.5,
  setApex: 6.0,
  serveApex: 6.5,

  /** Folga minima acima da fita da rede ao atacar o outro lado. */
  netClearance: 0.35,
  /**
   * Quantas vezes tentar levantar o arco quando ele bate na rede.
   *
   * E' o que impede o jogador de enterrar a bola na propria rede toda jogada:
   * o solver sobe o apice (ou alonga o tempo, na cortada) ate' passar.
   */
  netAttempts: 8,
  /** Quanto o apice sobe a cada tentativa. */
  apexStep: 0.7,
  /** Quanto o tempo de voo da cortada cresce a cada tentativa. */
  timeStep: 0.07,
} as const;

/**
 * Ataque com carga.
 *
 * O problema que isto resolve: forcar o ataque so' mudava o ALVO. A acao
 * continuava saindo do contexto, e com o atleta no chao isso da' "levantamento"
 * — o solver de APICE, um arco de 6 metros. Mirado no campo adversario e' um
 * balao lento, nao um ataque; parecia toque normal porque era toque normal.
 *
 * Agora o ataque forcado usa o solver de TEMPO (o mesmo da cortada) e a
 * velocidade sai da carga. Segurar o botao carrega; soltar bate.
 *
 * O arco mais rasteiro se auto-limita: bola baixa e rapida bate na rede, e o
 * laco de folga alonga o tempo ate' passar. Ou seja, nao da' pra cravar uma
 * bola rasante do fundo da quadra — a fisica cobra, nao uma regra.
 */
export const ATAQUE = {
  /** Segundos segurando ate' a forca cheia. */
  tempoDeCarga: 0.6,

  /**
   * Carga minima pra o toque virar ATAQUE em vez de passe.
   *
   * E' o que separa os dois usos do mesmo botao: um toque rapido arma a jogada
   * no proprio campo, segurar manda por cima da rede. Abaixo de 0.25 um clique
   * apressado viraria ataque sem querer; acima, um ataque de verdade exigiria
   * tempo demais pra sair.
   */
  cargaMinimaParaAtacar: 0.25,

  /** Velocidade horizontal do ataque com os pes no chao, da carga zero a' cheia. */
  dePeMin: 10,
  dePeMax: 18,

  /** No ar e em cima da bola: a cortada de verdade. */
  noArMin: 14,
  noArMax: 24,

  /**
   * Folga sobre a fita exigida de um ATAQUE. Menor que a dos outros toques.
   *
   * A folga de 0,35 m do passe engolia a carga inteira: com a bola a 2,5 m e a
   * rede a 2,24, NENHUMA velocidade cruza a fita 35 cm acima dela — o laco
   * alonga o tempo ate' virar balao, e toda carga converge pro mesmo lance.
   *
   * Com 0,15 a conta muda de lugar: de pe' continua travado em ~10 m/s (que e'
   * correto — nao se crava uma bola com os pes no chao), mas PULANDO a faixa
   * inteira passa, de 14 a 24. Altura vira forca, que e' como volei funciona.
   *
   * O preco e' do jogador: bola mais rasteira erra a fita com mais facilidade,
   * e rede e' ponto do adversario. E' a aposta que a carga oferece.
   */
  folgaDaRede: 0.15,
} as const;

export const PLAYER = {
  /** Profundidade do ataque quando o mouse ainda nao resolveu um ponto valido. */
  defaultAttackDepth: 0.65,
  /**
   * Janela em que um clique adiantado ainda e' aproveitado.
   *
   * Irmao do jumpBuffer do rpk.fps, e pelo mesmo motivo: sem ele o clique dado
   * um quadro antes da bola chegar se perde, e o jogo parece que travou.
   */
  hitBuffer: 0.18,
  /** Profundidade da armacao no proprio campo (manchete e levantamento). */
  bumpSetupDepth: 0.30,
  setSetupDepth: 0.16,
} as const;

/**
 * Dificuldade da IA. Tudo que separa facil de dificil sao estes cinco numeros.
 * "normal" e' exatamente o comportamento do prototipo em Unity.
 */
export interface AiSkill {
  /** Atraso entre o adversario bater e a IA reagir. */
  reactionDelay: number;
  /**
   * Forca do ataque, de 0 a 1, na mesma escala da carga do jogador.
   *
   * A IA nao carrega — ela bate sempre com a mesma forca. "normal" em 0,3 da'
   * 17 m/s na cortada, que e' exatamente a velocidade que ela tinha antes de
   * existir carga: o jogador ganhou uma alavanca, o adversario nao mudou.
   */
  attackForce: number;
  /** Erro de posicionamento ao perseguir a bola, em metros. */
  positionError: number;
  /** Erro de mira ao devolver, em metros no chao. */
  aimError: number;
  /** Chance de tentar cortar quando a bola vem alta perto da rede. */
  spikeChance: number;
  /** Tempo parado antes de sacar. */
  serveDelay: number;
}

export const AI_SKILL: Record<'facil' | 'normal' | 'dificil', AiSkill> = {
  facil: { reactionDelay: 0.34, positionError: 1.15, aimError: 2.0, spikeChance: 0.2, serveDelay: 1.4, attackForce: 0.15 },
  normal: { reactionDelay: 0.18, positionError: 0.55, aimError: 1.1, spikeChance: 0.45, serveDelay: 1.1, attackForce: 0.3 },
  dificil: { reactionDelay: 0.08, positionError: 0.22, aimError: 0.5, spikeChance: 0.7, serveDelay: 0.8, attackForce: 0.55 },
};

export const AI = {
  /** Distancia ate' o alvo em que a IA para de correr. */
  arriveThreshold: 0.2,
  /** Profundidade minima e maxima do ataque no campo adversario. */
  attackDepthMin: 0.35,
  attackDepthMax: 0.9,
  /** Intervalo entre recalculos do alvo de perseguicao. */
  decisionCooldown: 0.08,
} as const;

export const MATCH = {
  /** Pontos pra vencer o set. */
  pointsToWin: 15,
  /** Exigir 2 pontos de vantagem. */
  winByTwo: true,
  /** Teto absoluto de pontos. Evita partida infinita no winByTwo. */
  hardCap: 25,
  /** Toques permitidos por lado antes da bola cruzar a rede. */
  maxTouches: 3,
  /** Pausa entre o ponto e o proximo saque. */
  pointBreak: 1.7,
  /** Tempo que o aviso de ponto fica na tela. */
  announcement: 2.0,
} as const;

export const CAMERA = {
  /**
   * Lente. O prototipo usava 62, com a camera a 6 m — perto e aberta.
   *
   * Subir a camera pra 10,5 m (ver abaixo) afastou tudo: com 62 a quadra
   * ocupava 40% da altura do quadro e o resto era areia vazia. Fechar pra 45
   * devolve o enquadramento — a quadra inteira passa a ocupar 55%, e o atleta
   * volta a ter tamanho de leitura. Camera mais alta pede lente mais fechada;
   * as duas mudancas sao a mesma decisao.
   */
  fov: 45,
  /**
   * Near e far.
   *
   * O far era 400 e o domo do ceu esta' a 900: o ceu inteiro caia fora do
   * frustum e simplesmente nao desenhava — o que aparecia no topo do quadro
   * era o mar, nao o ceu. Erro que nao da' aviso nenhum, so' uma imagem errada.
   *
   * Com far em 1500 o near sobe junto pra 0.4, senao a razao far/near come a
   * precisao do buffer de profundidade. A bola tem 21 cm e a camera esta' a 13
   * metros: 0.4 nao corta nada que se veja.
   */
  near: 0.4,
  far: 1500,
  /**
   * Altura e distancia da camera.
   *
   * O prototipo usava 6 m e 9,5 m, e isso NAO funciona aqui. A conta: a linha
   * de visao que raspa o topo da rede (2,24 m) a partir de uma camera a altura
   * h e distancia D toca o chao do outro lado a 2,24*D/(h-2,24) metros da rede.
   * Com 6 e 9,5 isso da' 8,5 m — alem da linha de fundo adversaria, que tem 8.
   * Ou seja: o campo inteiro do adversario ficava escondido atras da rede.
   *
   * Num jogo em que se MIRA com o mouse num ponto do campo adversario, isso e'
   * fatal. Com 10,5 e 13 a conta da' 4,8 m, e sobram 3,2 m de campo adversario
   * visiveis por cima da fita — o resto se ve' pela malha, que e' vazada.
   */
  height: 10.5,
  distance: 13,
  /** Quanto a camera acompanha o jogador lateralmente (0 = trava no centro). */
  lateralFollow: 0.55,
  /** Quanto o foco puxa pra bola (0 = so' o jogador). */
  ballFocus: 0.35,
  /** Folga minima atras da linha de fundo: a camera nunca entra na quadra. */
  minDepthMargin: 2,
  positionSmoothing: 7,
  rotationSmoothing: 9,
} as const;

/**
 * O ambiente: ceu, sol e mar.
 *
 * O sol esta' BAIXO de proposito. Sombra longa e' o que faz um lugar parecer um
 * lugar; a pino, tudo achata — a licao e' do rpk.fps e vale igual numa praia.
 * E o azimute poe o sol a' frente e a' esquerda, sobre o mar: e' o que da' o
 * caminho de brilho na agua e contorna os atletas por tras.
 *
 * Quem le' esses dois numeros: a luz direcional, o disco no ceu e o brilho na
 * agua — todos por DIRECAO_DO_SOL, em world/ambiente.ts. Separados, o ceu
 * mostra o sol num canto enquanto a sombra cai pro outro.
 */
export const AMBIENTE = {
  /** Graus acima do horizonte. Baixo = sombra longa = fim de tarde. */
  elevacaoDoSol: 26,
  /** Graus a partir do eixo Z (pra onde a camera olha). Negativo = esquerda. */
  azimuteDoSol: -28,

  zenite: 0x1f66ae,
  /** Bruma quente do horizonte. A nevoa da cena usa esta MESMA cor. */
  horizonte: 0xf0dcbc,
  discoDoSol: 0xfff3d6,

  marRaso: 0x3f93a6,
  marFundo: 0x1d5f7d,
  areiaMolhada: 0xa8845c,

  /** Onde a areia acaba e o mar comeca, no Z do mundo. */
  zDaOrla: 46,
} as const;

/**
 * Cores. Vieram do VisualLibrary do Unity, que gerava tudo por codigo — mesma
 * ideia daqui, entao os valores passaram direto.
 */
export const COLORS = {
  sand: 0xe8cb98,
  line: 0xf7f7f2,
  post: 0x33383f,
  home: 0x2970d1,
  away: 0xd94d38,
  /** Luz do sol de fim de tarde: quente, nao branca. */
  sunLight: 0xffd9a8,
  /** Luz do ceu, de cima. */
  skyLight: 0x9fc4e8,
  /** Quique da areia, de baixo. Quente, porque a areia e' quente. */
  groundLight: 0xc9a273,
} as const;

export const STORAGE_KEY = 'volei3d.save.v1';
