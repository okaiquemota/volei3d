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
  postRadius: 0.06,

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

/**
 * O mergulho: jogar o corpo no chao pra alcancar o que os pes nao alcancam.
 *
 * E' uma TROCA, e o desenho inteiro sai disso: alcance extra agora, em troca de
 * nao poder corrigir no meio do voo e de ficar caido depois. Sem o custo seria
 * so' uma corrida mais rapida, e todo mundo mergulharia o tempo todo.
 *
 * Ele nasceu pra andar junto com a camera lenta, e por isso o VOO e' a janela
 * que importa: e' durante ele que o corpo esta' estendido, e e' ele que a
 * camera lenta estica de 0,42 s pra mais de um segundo vivido. Sem o poder o
 * mergulho e' uma leitura; com ele, uma decisao.
 */
/**
 * O ESTADIO, em cima da quadra.
 *
 * `escala` e' o unico numero que muda o enquadramento, e ele tem um PISO
 * medido, nao escolhido: a peca do modelo mais proxima da quadra e' o anel de
 * placas de LED, a 13,37 m do centro. Os atletas correm ate' 8 m (meia largura
 * mais a zona livre). Logo o anel so' fica fora da area de jogo enquanto
 *
 *   13,37 * escala > 8   ou seja   escala > 0,60
 *
 * e 0,65 deixa 69 cm de folga entre o atleta no limite e a propaganda — que e'
 * mais ou menos a folga de uma quadra central de verdade. Abaixo disso o
 * jogador passa a correr por DENTRO do painel, e o teste de vertices reprova.
 *
 * Encolher mais exigiria tirar o anel de LED ou as escadas de canto, e nao
 * mexer neste numero.
 */
export const ESTADIO = {
  /** Quanto o estadio encolhe em volta da quadra. 1 e' o tamanho do modelo. */
  escala: 0.65,
  /**
   * Ate' onde da' pra andar depois de sair da quadra, dentro do estadio.
   *
   * Fica ENTRE a zona livre (8 x 12) e o anel de LED (8,69 x 14,4 nesta
   * escala): sair da quadra tem que levar a algum lugar, e atravessar a
   * propaganda nao e' esse lugar. A faixa atras da linha de fundo e' onde
   * sobra espaco de verdade.
   */
  passeio: { x: 8.5, z: 14 },
} as const;

export const MERGULHO = {
  /** Velocidade do arranco, em m/s. */
  impulso: 7.5,
  /** Quanto o corpo sobe ao sair. */
  impulsoVertical: 1.85,

  /**
   * Gravidade do mergulho: menos da metade da do pulo.
   *
   * Com a gravidade do pulo, um voo de 0,42 s pediria subir 40 cm, e o
   * "peixinho" sairia parecendo um pulinho. Baixando a gravidade, o mesmo tempo
   * de voo cabe em 19 cm de altura — rasante e longo, que e' o gesto. Voo de
   * 2*1,85/8,8 = 0,42 s, e uns 3 m de chao.
   */
  gravidade: GRAVITY * 2 * 0.45,

  /** Metros a mais de alcance com o corpo estendido. */
  alcanceExtra: 1.1,
  /** E quanto abaixo dos pes, pra bola rasteira que so' o mergulho pega. */
  alcanceBaixoExtra: 0.45,
  /**
   * Quanto a defesa melhora deitado.
   *
   * O corpo inteiro amortece, e sem isto o mergulho seria inutil justamente
   * contra o que ele existe pra salvar: cortada, onde o custo de velocidade
   * sozinho ja' derruba a qualidade a zero.
   */
  defesaExtra: 0.3,

  /** Segundos caido antes de voltar a correr. E' o preco. */
  levantar: 0.85,
  /** Desaceleracao no ar: quase nenhuma, o corpo esta' voando. */
  arrastoNoAr: 2,
  /** Desaceleracao deslizando: a areia freia. */
  arrastoNoChao: 26,

  /** Quanto o corpo deita, em radianos. 1,35 e' quase no chao. */
  inclinacao: 1.35,
  /** Quao rapido ele deita e levanta (usado com damp). */
  velocidadeDaInclinacao: 16,
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

  /**
   * Apice do saque, da carga zero a' carga cheia.
   *
   * O saque ignorava a forca: apice fixo em 6,5 e pronto. Segurar o botao nao
   * mudava nada, e a unica decisao do saque era a mira.
   *
   * O que a carga PODE mudar aqui e' a ALTURA do arco, nao a velocidade
   * direto — quem manda e' a geometria. De 1,35 m de contato, cruzando a rede
   * a 8,8 m de distancia, um arco mais raso que 2,8 m de apice bate na fita: o
   * solver so' o levantaria de volta, e a carga nao existiria na pratica.
   *
   * Na faixa que cabe, a diferenca e' grande mesmo assim:
   *
   *   apice 8.0   voo de 2,10 s    7,0 m/s   balao, tempo de sobra pro outro
   *   apice 6.5   voo de 1,87 s    7,9 m/s   o saque de antes
   *   apice 3.0   voo de 1,17 s   12,6 m/s   quase metade do tempo de reacao
   *
   * A IA saca com a forca da dificuldade, e "normal" em 0,3 cai exatamente em
   * 6,5 — o saque que ela ja' tinha. O jogador ganhou a alavanca, ela nao.
   */
  serveApexFraco: 8.0,
  serveApexForte: 3.0,

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
  /** Segundos segurando ate' o TOPO da barra. */
  tempoDeCarga: 0.6,

  /**
   * A barra de forca e' um QTE, e nao um acumulador.
   *
   * Como acumulador ela nao decidia nada: enchia em 0,6 s e SATURAVA. Segurar
   * mais nao mudava uma linha, e como ataque de pe' e' travado pela geometria
   * da rede (ver `folgaDaRede`), a barra parecia enfeite mesmo quando nao era.
   *
   * Agora ela varre, tem uma ZONA e passa dela:
   *
   *   antes da zona   forca proporcional, e um erro de mira que cresce quanto
   *                   mais apressada foi a batida
   *   na zona         forca cheia e mira limpa. E' o ponto.
   *   depois          passou: a forca despenca e a bola sai torta — quanto mais
   *                   passou, mais torta
   *
   * `zonaIdeal` e' onde a zona comeca, em fracao de `tempoDeCarga`; a zona vai
   * dali ate' o topo. Com 0,7 e 0,6 s isso da' uma janela de 180 ms, que e' a
   * faixa em que QTE costuma viver.
   */
  zonaIdeal: 0.7,

  /**
   * Ate' onde a barra vai antes do golpe sair SOZINHO.
   *
   * Segurar pra sempre nao pode ser estrategia: sem um teto, quem passou da
   * zona ficaria segurando o botao esperando a proxima bola. Em 1,25 sobra um
   * quinto da barra depois do topo — o bastante pra ver que passou, pouco pra
   * dar tempo de consertar.
   */
  cargaMaxima: 1.25,

  /** Quanto da forca sobra no maximo do excesso. */
  perdaAoPassar: 0.45,
  /** Metros de erro de mira no maximo do excesso. */
  erroAoPassar: 3.4,
  /** Metros de erro de mira numa batida sem carga nenhuma. */
  erroApressado: 1.3,

  /**
   * Espalhamento que TODA batida carrega, mesmo a perfeita.
   *
   * Sem ele, tempo perfeito e contato perfeito punham a bola no centimetro
   * mirado, sempre — e mirar em cima da linha virava tiro certo em vez de
   * aposta. Ninguem acerta o mesmo centimetro duas vezes.
   *
   * 35 cm e' pequeno o bastante pra nao atrapalhar quem mira no meio da quadra,
   * e grande o bastante pra que a linha seja cara-ou-coroa. E' o que transforma
   * "onde eu miro" numa decisao em vez de uma formalidade.
   *
   * Vale so' pra ATAQUE e SAQUE. Passe e levantamento miram no proprio campo,
   * e tremer ali so' estragaria a armacao — que ja' e' cobrada pela qualidade
   * do contato.
   */
  espalhamentoDaBatida: 0.35,

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
 * A qualidade do toque.
 *
 * Ate' aqui, tocar na bola era binario: se ela estava dentro do volume de
 * alcance, o toque saia PERFEITO — mira exata, forca cheia — estivesse a bola
 * colada no peito ou na ponta do braco, viesse ela boiando ou a 24 m/s. Era a
 * razao de o jogo nao ter dificuldade nenhuma: nao havia o que fazer melhor
 * alem de chegar embaixo da bola.
 *
 * A ideia vem do Volleyball Unbound, cujo miolo e' exatamente isto — acertar o
 * tempo do contato, com bola alta ou rapida sendo mais dificil de acertar. Aqui
 * o tempo vira GEOMETRIA, que e' o que este jogo ja' sabe medir: o quanto o
 * contato foi centrado, e o quanto a bola vinha rapido.
 *
 * Vale pro humano e pra IA, pela mesma funcao e com os mesmos numeros.
 */
export const TOQUE = {
  /**
   * Fracao do alcance em que o contato ainda e' limpo.
   *
   * Comecou em 0,45 e foi medido: a bola fica ao alcance por 0,18 s no total, e
   * dentro de 45% do raio sobravam 0,05 s — TRES QUADROS. Isso nao e'
   * habilidade, e' sorteio, e 14% das bolas nao tinham quadro limpo nenhum.
   *
   * Com 0,7 (91 cm dos 1,3 m) a ponta do braco continua custando caro e o resto
   * do alcance e' jogavel. A dificuldade que sobra e' a que se pediu e a que se
   * treina: estar no lugar certo, e a velocidade da bola que vem.
   */
  zonaLimpa: 0.7,

  /**
   * De que velocidade em diante a bola comeca a ser dificil, e onde e' o pior.
   *
   * Um passe ou levantamento chega a 7-9 m/s: nao cobra nada. Uma cortada chega
   * a 17-24. E' o que finalmente da' sentido a atacar forte — antes, uma bola a
   * 24 m/s era defendida com a mesma limpeza de um balao.
   */
  velocidadeFacil: 9,
  velocidadeDificil: 22,
  /** Quanto de qualidade a bola mais dificil do jogo custa, no contato perfeito. */
  pesoDaVelocidade: 0.55,

  /** Erro de mira, em metros, que um toque de qualidade ZERO carrega. */
  erroMaximo: 2.6,

  /**
   * Quanto da forca do ataque sobrevive a um contato ruim.
   *
   * Contato zero sai com 55% da velocidade. Nao e' castigo arbitrario: bola na
   * ponta do braco nao se crava, e e' o que separa o ataque armado do ataque
   * apressado.
   */
  forcaMinima: 0.55,

  /**
   * Abaixo disto o toque QUEIMA: a bola sobe fraca e pra qualquer lado.
   *
   * Nao e' perder o ponto na hora — da' pra correr atras e salvar. E' perder a
   * JOGADA, que e' o que acontece de verdade quando se pega mal na bola.
   */
  qualidadeMinima: 0.12,
  /** Altura e espalhamento da bola queimada. */
  apiceDoQueimado: 3.2,
  espalhamentoDoQueimado: 3.0,
} as const;

export const PASSEIO = {
  /**
   * A que distancia da area de jogo da' pra entrar numa quadra.
   *
   * Medido a partir da borda da zona livre, nao do centro: quem chega pela
   * lateral esta' tao perto de entrar quanto quem chega pelo fundo. Quatro
   * metros e' perto o bastante pra ser claro de qual quadra se fala, e longe o
   * bastante pra nao exigir pontaria.
   */
  alcanceDeEntrada: 4,
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
  /**
   * Quanto a dificuldade da bola que chega e' descontada, de 0 a 1.
   *
   * E' o atributo de DEFESA: quem defende bem sente menos a cortada.
   *
   * O teto e' baixo de proposito, e foi medido. Com 0,6 no `dificil` a cortada
   * de 24 m/s custava so' 0,22 de qualidade: dois bots assim defendiam tudo e
   * o rally medio voltou pra 58 segundos, com 283 cortadas e nove pontos em dez
   * minutos — a quadra congelada de novo, so' que por outro caminho. Em 0,4 a
   * cortada ainda machuca quem a recebe, que e' o ponto de existir cortada.
   */
  defesa: number;
  /**
   * Chance de ARMAR no primeiro toque em vez de devolver de primeira.
   *
   * E' o que separa um jogo de volei de uma partida de frescobol. Sem isto a
   * IA devolve toda bola de primeira, num balao alto que o outro lado sempre
   * alcanca — dois bots assim rebatem pra sempre e o placar nunca sai do zero.
   * Armando, o primeiro toque fica em casa, perto da rede, e o segundo e' um
   * ataque de verdade: rapido, baixo, dificil de defender. E' dai' que vem o
   * ponto.
   */
  chanceDeArmar: number;
  /** Tempo parado antes de sacar. */
  serveDelay: number;
  /**
   * Quantos metros FORA das linhas a bola precisa cair pra ela deixar passar.
   *
   * A IA salvava tudo. Corria atras de bola que ia morrer um metro depois da
   * linha de fundo, devolvia, e dava de presente um ponto que ja' era dela —
   * porque `preverPouso` diz ONDE a bola cai e ninguem perguntava se aquilo era
   * dentro.
   *
   * Julgar bola fora e' das coisas mais dificeis do volei, entao isto e' um
   * atributo e nao uma regra: o `facil` so' larga o que e' escandalosamente
   * fora, o `dificil` chama a linha de perto. Errar pro lado errado custa o
   * ponto — que e' o risco de quem deixa passar na quadra de verdade.
   */
  margemDeFora: number;
}

export const AI_SKILL: Record<'facil' | 'normal' | 'dificil', AiSkill> = {
  facil: { reactionDelay: 0.34, positionError: 1.15, aimError: 2.0, spikeChance: 0.2, serveDelay: 1.4, attackForce: 0.15, chanceDeArmar: 0.35, defesa: 0, margemDeFora: 0.85 },
  normal: { reactionDelay: 0.18, positionError: 0.55, aimError: 1.1, spikeChance: 0.45, serveDelay: 1.1, attackForce: 0.3, chanceDeArmar: 0.7, defesa: 0.2, margemDeFora: 0.4 },
  dificil: { reactionDelay: 0.08, positionError: 0.22, aimError: 0.5, spikeChance: 0.7, serveDelay: 0.8, attackForce: 0.55, chanceDeArmar: 0.9, defesa: 0.4, margemDeFora: 0.15 },
};

export const AI = {
  /** Distancia ate' o alvo em que a IA para de correr. */
  arriveThreshold: 0.2,
  /** Profundidade minima e maxima do ataque no campo adversario. */
  attackDepthMin: 0.35,
  attackDepthMax: 0.9,
  /** Intervalo entre recalculos do alvo de perseguicao. */
  decisionCooldown: 0.08,

  /**
   * Qualidade de contato que vale a pena esperar, pra IA e pro humano.
   *
   * Sem isto ela batia no primeiro quadro em que a bola entra no alcance — e
   * esse quadro e' o PIOR de todos, com a bola a 1,3 m do corpo, na ponta do
   * braco. Medido: metade dos toques dela queimava, e o motivo campeao de ponto
   * virou "quatro toques", porque bola queimada fica em casa.
   *
   * Quem joga volei nao estoura o braco na primeira bola que passa perto: deixa
   * ela chegar. Abaixo disto a IA espera, e so' bate mesmo se for a ultima
   * chance.
   */
  qualidadeParaBater: 0.7,

  /**
   * Altura (a partir dos pes) em que esperar deixa de ser opcao.
   *
   * Abaixo disto a bola esta' saindo da faixa alcancavel: ou bate agora, mal,
   * ou nao bate. Bater mal e' melhor que ver a bola cair.
   */
  alturaDaUltimaChance: 0.5,
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

  /**
   * Segundos pra sacar depois que a bola vai pra mao.
   *
   * Os mesmos 8 do volei de verdade, onde o arbitro apita e o sacador tem 8
   * segundos pra bater. Aqui nao ha' arbitro nem cerimonia antes do apito, so'
   * a bola indo pra mao — entao os 8 sao 8 inteiros de jogador, e sobra tempo
   * pra armar o saque com calma.
   *
   * A regra existe pelo mesmo motivo que existe no jogo real: sem ela, quem
   * esta' perdendo simplesmente nao saca.
   */
  tempoLimiteDeSaque: 8,
  /** Tempo que o aviso de ponto fica na tela. */
  announcement: 2.0,
  /** Pausa de uma quadra de bots entre uma partida e a proxima. */
  descansoEntrePartidas: 6,
} as const;

/**
 * O poder de camera lenta.
 *
 * O mundo inteiro desacelera, inclusive a barra de FORCA — e' esse o ponto: a
 * barra e' um QTE de 180 ms, e o poder compra tempo pra acertar a zona e pra
 * ler uma bola que ja' estava em cima. Se ele nao mexesse na barra, seria
 * enfeite.
 *
 * Por isso o gasto e' em segundos de RELOGIO, nao de jogo: a barra cheia da'
 * `duracao` segundos vividos, que a `escala` transforma em
 * duracao*escala segundos de jogo — menos de um segundo. E' pra UM toque
 * decisivo, nao pra um rally inteiro, e a recarga lenta garante que seja uma
 * escolha e nao um modo de jogo.
 */
export const TEMPO = {
  /** A que velocidade o mundo anda com o poder ligado. */
  escala: 0.35,
  /** Segundos de RELOGIO que a barra cheia dura. */
  duracao: 2.5,
  /** Segundos de relogio pra encher do zero. */
  recarga: 9,
  /**
   * Carga minima pra LIGAR. Manter ligado nao pede minimo.
   *
   * Sem esse degrau a barra tremeria no fim: esvazia, desliga, recarrega um
   * fio, liga de novo por um quadro. Com ele, quem gastou tem que esperar
   * chegar a um quinto pra valer a pena de novo.
   */
  minimoParaLigar: 0.2,
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
  near: 0.1,
  far: 400,
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
  /**
   * Os DOIS enquadramentos de quem joga, e a roda anda entre eles.
   *
   * `perto` e' a camera de ombro: baixa, colada atras do atleta, com o corpo
   * dele ocupando um pedaco do quadro. E' o enquadramento de jogo de volei que
   * se ve' por ai', e e' o padrao.
   *
   * `longe` e' o enquadramento tatico que este jogo sempre teve — o unico que
   * mostra o campo adversario POR CIMA da fita, e por isso ele nao sumiu: uma
   * roda de mouse traz ele de volta.
   *
   * A conta que separa os dois: a linha de visao que raspa o topo da rede
   * (2,24 m) a partir de uma camera a altura h e distancia D da rede toca o
   * chao do outro lado a 2,24*D/(h-2,24) metros dela. Em `longe`, com a camera
   * ~21 m da rede a 10,5 m de altura, isso da' 5,7 m — sobram 2,3 m de campo
   * adversario visiveis por cima da fita. Em `perto`, a 14 m e 3,2 m de altura,
   * da' 32 m: TODO o campo adversario fica atras da rede, e so' se ve' ele
   * pela malha, que e' vazada. E' o preco do enquadramento, e e' por isso que
   * ele nao e' o unico.
   *
   * `distancia` e' medida da LINHA DE FUNDO: a camera de jogo e' presa a'
   * quadra, nao ao atleta. Nao ha' mais acompanhamento lateral nem puxao pra
   * bola — os dois existiam pra perseguir, e perseguir era o defeito.
   *
   * `mira` e' a que altura do atleta a camera OLHA, e ela e' enquadramento, nao
   * direcao: subir esse ponto inclina a camera pra cima, e o que ela ve' desce
   * na tela. Era 1,2 nos dois, e com ele a quadra ficava alta — 43% da altura
   * do quadro no ombro, 40% na tatica — com um terco de areia vazia embaixo.
   *
   * Os dois valores nao podiam ser o mesmo, e nao por gosto: a conta e' `metros
   * = giro x distancia ate' o ponto mirado`, e essa distancia muda com o
   * enquadramento — o mesmo centimetro de mira vale mais na tatica, que olha de
   * mais longe.
   *
   * Com a camera presa a' quadra esta medida virou ESTAVEL: ela nao depende
   * mais de onde o atleta esta', entao o numero abaixo vale o jogo inteiro e
   * nao so' no instante do saque. O numero tambem nao muda com a largura da
   * janela, porque a lente do three e' VERTICAL.
   */
  jogoPerto: { altura: 3.8, distancia: 6.5, mira: 4.06 },
  jogoLonge: { altura: 10.5, distancia: 13, mira: 2.44 },
  /** Altura do ponto de mira de quem assiste: a cabeca de um jogador. */
  alturaDoOlhar: 1.6,


  /**
   * Onde fica a camera de quem assiste: mais alta e mais longe que a de quem joga.
   *
   * Nao e' gosto, e' o angulo. Da posicao de jogo (10,5 m de altura, 13 m atras)
   * a linha de fundo mais PERTO cai a 79 graus abaixo do horizonte e a mais
   * longe a 30 — 49 graus de campo pra uma lente de 45. O fundo da quadra fica
   * de fora, o que nao atrapalha quem joga, porque quem joga esta' justamente
   * ali no fundo. Quem assiste quer as duas metades. A 13 m de altura e 11 m da
   * linha, o mesmo calculo da' 50 e 26 graus: 24 graus de campo, e a quadra
   * inteira cabe com folga sem ficar pequena na tela.
   */
  assistirAltura: 13,
  assistirDistancia: 11,
  /** Quanto a camera de quem assiste anda de lado atras da bola. */
  assistirLateral: 0.25,

  /**
   * Onde fica a camera de quem PASSEIA pela praia.
   *
   * Mais baixa e mais perto que as outras duas, e pelo mesmo tipo de conta: a
   * 4,5 m de altura e 10 m atras, a mira desce 16 graus abaixo do horizonte, e
   * com meia lente de 22,5 sobra ceu no alto do quadro. Na altura da camera de
   * jogo a inclinacao passa de 40 graus e a praia inteira vira areia sem
   * horizonte — o enquadramento que serve pra ler uma quadra nao serve pra
   * atravessar um lugar.
   */
  passeioAltura: 4.5,
  passeioDistancia: 10,

  /**
   * A camera de quem anda GIRA, e as outras duas nao.
   *
   * Dentro da quadra ela e' presa a' quadra de proposito: a leitura do campo —
   * onde esta' a rede, onde esta' a linha de fundo — se perde se o mundo girar
   * a cada bola lateral. Fora da quadra nao ha' campo pra ler, ha' um lugar pra
   * olhar, e travar o angulo so' esconde metade dele.
   *
   * Girar aqui nao reintroduz a realimentacao que a camera presa ao corpo tinha:
   * o angulo passa a ser INPUT do jogador, nao consequencia da rotacao do
   * corpo. O corpo e' que segue a camera, e nao o contrario.
   *
   * Os valores acima viram o angulo INICIAL: 10 m atras e 4,5 m de altura sao o
   * mesmo que um raio de 10,4 m com 16 graus de elevacao.
   */
  /**
   * Radianos por pixel de mouse.
   *
   * Com 0,005 uma meia-volta saia em 630 px — meia tela — e o mundo girava mais
   * rapido do que a mao conseguia mandar parar. Com 0,0025 a volta INTEIRA pede
   * 2500 px, uns dois deslizes de mouse, que e' a faixa em que jogo de terceira
   * pessoa costuma viver.
   */
  passeioGiroPorPixel: 0.0025,
  /** Limites da elevacao: nem enterrada na areia, nem em cima da cabeca. */
  passeioElevacaoMin: 0.10,
  passeioElevacaoMax: 1.25,
  /**
   * Metros por pixel de roda, e ate' onde.
   *
   * Um entalhe de mouse manda ~100 px, entao um entalhe vale 1,4 m — e um
   * deslize de trackpad, que manda muito menos por evento, vale
   * proporcionalmente menos.
   */
  passeioZoomPorPixel: 0.014,
  passeioRaioMin: 3.5,
  passeioRaioMax: 30,
  /**
   * O quanto a camera de passeio amacia o ANDAR do personagem.
   *
   * So' o andar: o giro e' 1 pra 1 com o mouse, e a mira e' exata — quem a
   * camera segue nao sai do meio da tela. E' a diferenca entre esta camera e as
   * de jogo, que amaciam posicao e rotacao separadamente e podem deixar o alvo
   * escorregar um pouco do centro.
   *
   * O atraso que sobra e' velocidade dividida pela constante: 6,5 m/s por 20 da'
   * 33 cm, uns 2% da largura do quadro. O bastante pra tirar o tremor de quadro
   * a quadro, pouco pra se notar.
   */
  passeioSuavidade: 20,

  /**
   * A roda de quem JOGA anda entre `jogoPerto` (0) e `jogoLonge` (1).
   *
   * Antes ela multiplicava altura e distancia JUNTAS, e por isso o angulo nunca
   * mudava: era o mesmo enquadramento mais perto ou mais longe. Interpolando os
   * dois extremos o angulo muda junto, que e' o que separa uma camera de ombro
   * de uma camera tatica — a de ombro nao e' a tatica de perto, e' outra coisa.
   *
   * Comeca em 0. Sobrevive a sair e voltar pra quadra: quem escolheu de onde
   * quer ver nao quer o padrao de volta a cada ponto.
   */
  jogoEnquadramentoPadrao: 0,
  /** Quanto a roda anda por pixel. Um entalhe de mouse (~100 px) da' 0,22. */
  jogoZoomPorPixel: 0.0022,
  positionSmoothing: 7,
  rotationSmoothing: 9,
} as const;

/**
 * Cores. Vieram do VisualLibrary do Unity, que gerava tudo por codigo — mesma
 * ideia daqui, entao os valores passaram direto.
 */
export const COLORS = {
  /**
   * O ceu, em tres paradas: horizonte, meio e zenite.
   *
   * Uma cor so' era o que havia, e uma cor so' nao e' ceu. O olho le' distancia
   * pelo degrade — e' por ele que a areia longe parece longe. `horizonte` e'
   * tambem a cor da NEVOA: e' nele que o chao tem que se dissolver, e nevoa que
   * destoa do que esta' atras recorta a borda do chao como adesivo.
   */
  horizonte: 0xc3dff2,
  sky: 0x4a9ede,
  zenite: 0x1d64b8,
  sand: 0xe8bf82,
  /**
   * O branco do cenario QUADRA. UM so' numero, de proposito.
   *
   * Fundo, nevoa e chao usam este mesmo valor, e nao tres tons parecidos: a
   * primeira tentativa deu ao chao um branco de material ILUMINADO (0xf2f2ef) e
   * ao ceu um branco puro, e o resultado foi um chao cinza contra um ceu branco
   * — um horizonte sujo, que e' exatamente o que o cenario esta' tentando nao
   * ter.
   *
   * A luz do ceu aqui e' azulada (`skyLight`), entao QUALQUER cor de material
   * sai puxando pro cinza-azulado. Branco de verdade num chao so' sai desligando
   * a iluminacao dele — ver `usarPiso`.
   */
  brancoDaQuadra: 0xffffff,
  /**
   * O chao em volta da quadra dentro do ESTADIO.
   *
   * Nao pode ser areia (a quadra de modelo em cima de areia le' como quadra
   * largada na praia) nem o branco do estudio (chapado, sem sombra, some
   * debaixo da arquibancada).
   *
   * A primeira tentativa foi o cinza da laje do modelo, 0x3c3f45 — e era um
   * BURACO: metade da tela num tom quase preto, ao lado de uma quadra turquesa
   * e de arquibancada azul e laranja. Cinza de concreto lido na foto de um
   * estadio nao e' cinza de concreto lido ao lado de cor saturada. Este e'
   * claro o bastante pra ser piso, e frio o bastante pra nao competir com a
   * quadra.
   */
  pisoDaArena: 0x7d8494,

  /**
   * As cores do ESTADIO, e por que ele precisava de paleta propria.
   *
   * O modelo vem com arquibancada azul-marinho, casca cinza e — o problema de
   * verdade — metalness 1,0 em quase tudo que e' refletor. Metal sem mapa de
   * ambiente o three pinta de PRETO: eram 40 mil triangulos de torre saindo
   * como silhueta morta, ao lado de personagens e quadra de cor viva.
   *
   * Os tons abaixo sao os mesmos do resto do jogo, nao tons "de estadio": a
   * arquibancada puxa pro azul do time da casa e pro laranja do visitante.
   */
  arquibancadaAzul: 0x2f6fd0,
  arquibancadaLaranja: 0xe08a3c,
  /** O que era preto puro: degrau, viga, estrutura de refletor. */
  estruturaDoEstadio: 0x566079,
  /** Mastro e carcaca de refletor, antes metal preto. */
  metalDoEstadio: 0x8892a6,
  /** A casca externa do bowl. */
  cascaDoEstadio: 0x6e7789,
  /** As escadas de trelica, que eram branco puro e gritavam na tela. */
  escadaDoEstadio: 0x7f8798,
  line: 0xf7f7f2,
  post: 0x33383f,
  home: 0x2970d1,
  away: 0xd94d38,
  /**
   * O par QUENTE/FRIO, que e' o que da' volume a uma cena.
   *
   * O sol era quase branco (0xfff7e6) e a luz de ceu um cinza-azulado morno:
   * com os dois quase da mesma cor, a face iluminada e a face na sombra saiam
   * do mesmo tom e o corpo ficava CHAPADO. Nao e' falta de luz, e' falta de
   * diferenca entre as duas.
   *
   * Agora o sol e' ambar de fim de tarde e a luz de ceu e' azul de verdade. A
   * mesma superficie ganha lado quente e lado frio, e e' dai que vem o relevo —
   * a sombra deixa de ser "o mesmo, mais escuro" e passa a ser outra cor.
   *
   * `groundLight` e' o que a areia devolve por baixo: dourado, nao marrom, pra
   * a sombra na areia nao virar um buraco cinza.
   */
  sunLight: 0xffe7b8,
  skyLight: 0x6ba4de,
  groundLight: 0xc49a63,
} as const;

export const STORAGE_KEY = 'volei3d.save.v1';
