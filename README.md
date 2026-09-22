# VÔLEI 3D

Vôlei de praia em 3D numa praia com três quadras. Você joga numa, as outras
jogam sozinhas, e a qualquer momento dá pra sair da quadra, **andar pela areia**
e entrar em outra — ou só assistir.
Feito em **TypeScript + Three.js**, sem framework de jogo e sem engine de
física — tudo escrito à mão.

Abre e joga: não tem instalador, não tem plugin, não tem barra de carregamento.

### ▶ [Jogar agora](https://okaiquemota.github.io/volei3d/)

> Este jogo já foi um protótipo em Unity. A versão Unity está preservada em
> [RIP.volei3d-unity](https://github.com/okaiquemota/RIP.volei3d-unity) — ela
> funcionava, mas cada build levava de 20 a 30 minutos num runner de CI, exigia
> licença Unity e entregava dezenas de MB com tela de carregamento. Esta versão
> compila em **um segundo** e entrega **151 KB comprimidos**.

---

## Rodando

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm run typecheck    # tsc --noEmit, roda em segundos
npm test             # typecheck + os testes da lógica pura
npm run build        # typecheck + bundle em dist/
npm run build:single # dist/volei3d.html — joga com duplo clique, offline
```

---

## Controles

| Ação | Tecla |
|---|---|
| Correr | `W A S D` ou setas (relativo à câmera) |
| Pular | `Espaço` |
| Mirar | Mouse — a mira é um **ponto no chão**, não uma direção |
| Passar | Toque rápido no clique esquerdo (ou `E`) |
| Atacar por cima da rede | **Segurar** o clique esquerdo e soltar |
| Levantar no próprio campo | **Clique direito** ou `R` |
| Sacar | Segure e solte o clique esquerdo — a carga vale aqui também |
| Sair da quadra e andar pela areia | `Q` |
| Entrar na quadra em que você está encostado | `E` |
| Mergulhar | `C` |
| Câmera lenta | Segurar `Shift` |
| Forçar o ataque com carga baixa | Segurar `F` no contato |
| Trocar o enquadramento (ombro ↔ tática) | Roda do mouse |
| Girar a câmera (só fora da quadra) | Mover o mouse |
| Assistir outra quadra | `[` e `]` |
| Voltar a câmera pra você | `Tab` |
| Reiniciar | `R`, na tela de fim de jogo |
| Pausar / desempenho | `Esc` / `F3` |
| Esconder o manual de teclas | `H` |

As duas barras ficam no alto, logo abaixo do placar. `TOQUE` é o quanto *este*
contato sairia limpo se você batesse agora; `FORÇA` é um **QTE**: ela varre e tem
uma zona marcada perto do fim.

A legenda de teclas é uma **faixa deitada no rodapé**. Era um painel de pé na
lateral, e aquilo valia para a câmera antiga, alta e distante; com a câmera de
ombro a quadra ocupa o meio do quadro e é *larga*, então a lateral deixou de ser
vazia. O rodapé é o único pedaço do quadro onde nunca acontece nada — a areia
logo à frente do jogador, atrás do próprio corpo dele. Ela lista **só teclas**; o que cada barra significa e como
o rally funciona está no menu, em **COMO JOGAR**, que é texto pra ler uma vez.
`H` esconde a legenda, e a preferência fica guardada.

O menu, a pausa e o fim de jogo são cartões sobre a praia, e o HUD apaga atrás
deles: as telas são translúcidas de propósito, e sem isso o placar e a dica de
saque atravessavam o véu e apareciam por cima do "VOCÊ VENCEU".

**O teclado é do menu quando há menu.** Com o foco num controle, a tecla é do
controle — as setas andam pelo grupo de dificuldade e pelo slider, o espaço
aperta o botão. O `Tab` é do navegador enquanto uma tela está aberta (é o único
jeito de alcançar "CONTINUAR" sem mouse) e volta a ser "voltar pra minha quadra"
assim que ela fecha.

**No saque, a carga muda o arco.** Um toque manda um balão de 2 s de voo; a
carga cheia baixa o arco até o limite que a rede deixa passar e o voo cai para
1,1 s — 43% menos tempo de reação para o outro lado. A mira continua sendo sua:
os dois caem no mesmo ponto.

**A carga é a intenção.** O mesmo botão passa e ataca: quem só encosta arma a
jogada no próprio campo, quem segura manda por cima da rede. Não há decisão de
botão — a decisão é de mira e de tempo. O clique direito é a única ação pedida
contra o contexto: ele *levanta*, sobe a bola no seu campo venha ela na canela
ou na cabeça.

Dentro disso a ação ainda sai do contexto: bola baixa vira manchete, na altura
da cabeça vira levantamento, alta com você no ar vira cortada.

Os dois primeiros toques do seu lado armam a jogada no seu próprio campo; o
terceiro cruza a rede automaticamente — ou antes, se você segurar o botão de
ataque.

**As outras quadras não esperam por você.** As três partidas correm ao mesmo
tempo, cada uma com sua bola e seu placar; assistir não pausa a sua, e a sua
não pausa as delas. Quando uma quadra de bots chega a 15, ela descansa seis
segundos e começa outra — nenhuma quadra vira cenário.

**`Q` te tira da quadra.** Um bot assume seu lado na hora e a partida continua
sem interrupção — se a bola estava vindo pra você, agora é dele. Fora da quadra
você anda pela areia com o mesmo `W A S D`, o placar do HUD acompanha a quadra
mais perto, e `E` te põe no lugar do bot do lado em que você chegou. A rede e os
postes te barram: dá pra contornar uma quadra, não atravessar.

**E a câmera gira.** Fora da quadra o cursor é capturado e o mouse orbita em
torno de você sem clicar — de rente à areia até quase de cima — e a roda
aproxima ou afasta. `Esc` solta o cursor, um clique pega de volta, e enquanto
ele estiver solto ainda dá pra girar arrastando com o botão. O `W A S D`
continua sendo relativo à câmera, então girar a vista muda pra onde você anda,
como em qualquer jogo em terceira pessoa.

Dentro da quadra ela volta a ser fixa e o cursor volta a ser cursor, e isso é de
propósito nos dois sentidos: ler o campo é metade do jogo e o campo não se lê
com o mundo girando a cada bola lateral; e a mira é um **ponto no chão**, que só
existe com um cursor solto pra apontar.

---

## Como o jogo funciona

**Os atletas são um modelo.** *Ultimate Modular Men Pack*, de Quaternius (CC0),
com as 24 animações que vêm nele. É uma **pele**, como a quadra: o `Motor`
continua dizendo onde o corpo está e para onde ele olha, e o `Hitter` continua
medindo alcance a partir dos pés — nenhuma regra sabe que o desenho mudou.

A escala não precisou de encaixe nenhum: o modelo mede 1,86 m com os pés em
`y = 0`, que é exatamente o `ATHLETE.height`. Sem Z-up, sem escala 0,01, sem
transform na raiz — as três armadilhas que a quadra de modelo teve.

A locomoção usa as **quatro direções** (`Run`, `Run_Back`, `Run_Left`,
`Run_Right`), e isso não é enfeite: o atleta encara a bola enquanto anda relativo
à câmera, ou seja, anda de lado quase o tempo todo. Com um `Run` frontal só,
metade da partida seria o boneco deslizando de lado com as pernas correndo para
a frente.

Ainda faltam pulo e mergulho — o pack não tem. No ar e no mergulho o corpo vai
rígido, que é exatamente o que a cápsula fazia, e quem deita o corpo continua
sendo o `Motor`.

**Cor.** O renderer usa tone mapping filmico (ACES). Sem ele o que passa de 1 é
cortado seco, e a saturação morre justamente onde há mais luz — dois tons de
areia iluminada chegam à tela como a mesma cor. O sol é âmbar e a luz de céu é
azul: é a diferença entre as duas que desenha volume, não a quantidade de luz.
E o céu é uma cúpula com degradê, com a névoa começando a 22 m — sem isso a
areia rente aos pés e a vinte metros davam o mesmo pixel, e nada no quadro dizia
o que estava longe.

**Quadra.** 16 m × 8 m, medidas oficiais de vôlei de praia, rede a 2,24 m. Zona
livre de 4 m em volta, que também é o limite de corrida dos atletas.

**Bola.** Gravidade multiplicada por 1,35 e arrasto leve — trajetória realista o
bastante para ser lida, previsível o bastante para ser jogada. A areia quica
pouco, a rede praticamente mata a bola, o poste devolve.

**Partida.** Rally point: ponto quando a bola toca o chão dentro da quadra, sai
fora, ou um lado dá mais de três toques. Quem faz o ponto passa a sacar. 15
pontos com dois de vantagem e teto em 25.

**Saque.** Só de trás da linha de fundo — durante o saque a área de corrida
encolhe para a faixa atrás da linha, com a zona livre inteira na lateral, que é
a regra de verdade. E o sacador tem **8 segundos**, como no vôlei de verdade: passou disso é ponto do
adversário. Sem relógio, quem está perdendo simplesmente não saca, e não havia
nada no jogo que o obrigasse.

**Dois cenários, e a mesma quadra por baixo.** No menu dá pra escolher entre
**AREIA**, a quadra desenhada por código que o jogo sempre teve, e **QUADRA**, um
modelo low-poly por cima do mesmo campo. É uma *pele*: os colisores, os limites
de corrida, o julgamento de dentro e fora e o limite da mira saem todos do
`Court` e do config, e nenhum deles muda. Trocar de cenário troca o que se vê,
nunca o que vale.

O encaixe é uma sorte geométrica: o modelo é de quadra indoor (9 × 18 m) e o
campo é de praia (8 × 16 m), mas os dois são 1:2 — então uma escala única de 8/9
põe as linhas do desenho exatamente em cima das linhas que valem. A altura vai
por outra conta, porque a fita do modelo termina a 2,10 m e o colisor que para a
bola está a 2,24: escalando tudo junto, a bola passaria por cima do desenho e
bateria no nada.

**O cenário QUADRA é uma partida, não um lugar.** Fundo, névoa e chão usam o
**mesmo** branco, e o chão deixa de ser iluminado para chegar lá — a luz de céu é
azulada, então material branco sob ela sai cinza. A quadra fica sozinha num vazio
branco, sem horizonte.

E existe **uma** quadra. As outras duas somem da cena e param de ser atualizadas,
o que é o único jeito honesto de dizer "só existe esta": escondidas e ainda
jogando, elas continuariam gastando quadro e mudando placar pelas costas. Junto
somem as quatro teclas que pressupõem mais de um lugar — sair (`Q`), entrar
(`E`), assistir a vizinha (`[` `]`) e voltar para a sua (`Tab`) — e a linha
`NA PRAIA` da legenda sai com elas.

No cenário AREIA nada disso muda: três quadras, praia inteira, livre para andar.

Do modelo sai só o que compete com o jogo: a bola de enfeite, porque duas bolas
em campo não são decoração, são o jogador procurando qual das duas está em jogo.
A laje, os bancos e os cones ficam. A laje fica enterrada na areia, porque o chão
da física é `y = 0` e levantar o desenho faria o jogo inteiro acontecer dentro
dela.

**A câmera é presa à quadra, não ao atleta.** A quadra fica parada no quadro e
quem se mexe dentro dela é você — que é como se filma vôlei, e é o que a mira
precisa: o alvo é um ponto do chão resolvido pelo cursor, então uma câmera
estável significa que o mesmo pixel é sempre o mesmo metro de quadra.

A posição é fixa atrás da sua linha de fundo e a mira é um ponto fixo do chão. A
profundidade desse ponto é o que enquadra: aproximá-lo da câmera a inclina para
baixo, e a quadra sobe na tela.

Medido em 1366×683, 1280×720 e 1600×900: o centro da quadra cai a 49,9% da altura
do quadro no ombro e 49,8% na tática — e **idêntico** com o atleta deslocado 3 m
para o lado e 5 m para a frente. O número não muda com a largura da janela porque
a lente do three é **vertical**.

**Dois enquadramentos, e a roda anda entre eles.** O padrão é a câmera de
**ombro**: baixa, 6,5 m atrás de você, com o seu corpo ocupando um quarto do
quadro e o horizonte visível por cima da rede. A roda leva até a **tática**, alta
e 13 m atrás, que é a única que mostra o campo adversário *por cima* da fita.

Não é a mesma câmera de perto e de longe — o ângulo muda junto, e é ele que faz a
diferença. A conta: a linha de visão que raspa o topo da rede (2,24 m) a partir
de uma câmera a altura `h` e distância `D` da rede toca o chão do outro lado a
`2,24·D/(h−2,24)` metros dela. Na tática isso dá 5,7 m e sobram 2,3 m de campo
adversário acima da fita; no ombro dá 32 m, e todo o campo de lá se lê **através
da malha**, que é vazada. O que se perde em leitura de campo se ganha em leitura
de bola — e é uma roda de distância.

Medido em 1280×720, com você na linha de fundo: o campo adversário ocupa 78 px de
altura no ombro e 101 px na tática. A mira é um ponto no chão resolvido pelo
cursor, então essa altura **é** a precisão de mira: o ombro custa um quarto dela.

**O mergulho é uma troca.** `C` joga o corpo na direção em que você está andando
(ou pra frente, parado): o alcance cresce 1,1 m na horizontal e 45 cm pra baixo,
e o corpo deitado amortece a bola rápida, sem o que todo mergulho contra uma
cortada queimaria. Em troca, no voo o teclado não manda — o arranco *substitui* a
corrida, então quem já estava a toda não mergulha mais longe — e depois você fica
caído 0,85 s sem correr nem pular.

O toque sai sozinho assim que o corpo alcança: mergulhar **é** decidir tocar, e
pedir um segundo clique de três quadros no meio do voo seria teste de reflexo, não
leitura de jogo. O que sai é sempre manchete, e a carga guardada morre no
arranco — chegar deitado com um ataque carregado mandaria a bola a 20 m/s de um
corpo no chão.

E a zona limpa do contato continua medindo pelo alcance **de pé**: o metro a mais
é todo na faixa cara. Se ela crescesse junto, mergulhar deixaria o toque perto do
corpo mais limpo do que ficar em pé, e o gesto de último recurso viraria o jeito
certo de tocar em tudo.

**A câmera lenta é o poder.** Segurar `Shift` põe o mundo a 35% da velocidade — a
bola, os atletas, as outras quadras da praia e, principalmente, **a barra de
força**. É esse o ponto: a barra é um QTE de 180 ms, e o poder compra tempo pra
acertar a zona ou pra alcançar uma bola que já tinha passado. Se ele não mexesse
na barra, seria enfeite.

É com o mergulho que ela rende mais, e foi pra isso que os dois foram feitos
juntos: o voo dura 0,42 s — tempo de ver que deu certo, não de escolher o lado.
Em câmera lenta ele passa de um segundo vivido, e aí a decisão existe.

Fica no `Shift` porque é um poder de **percurso**: você segura enquanto corre
atrás da bola. O modificador que força o ataque com carga baixa, que morava ali,
foi para o `F` — esse é de **instante**, segurado junto com o clique no momento
do contato, já posicionado, e por isso não custa o passo que tirar o indicador
do `D` custaria.

O gasto é em segundos de **relógio**, não de jogo: a barra cheia dá 2,5 segundos
vividos, que viram menos de um segundo de jogo, e demora 9 para voltar. É para
**um** toque decisivo, não para um rally. Esvaziou, só volta depois de soltar —
senão o poder piscaria sozinho ao cruzar o mínimo de recarga.

**A barra de força é um QTE.** Ela varre e tem uma **zona** marcada perto do
fim. Soltar ali dá a batida mais forte e a mira limpa. Antes dela a batida sai
fraca e já desviada — quem bate de qualquer jeito não mira. Depois, **passou**: a
força despenca e a bola sai torta, tanto mais quanto mais passou; e no fim da
barra o golpe escapa sozinho, porque segurar pra sempre não pode ser estratégia.

Medido, mesma posição e mesmo contato, só mudando quando o dedo solta:

| | de pé | no ar |
|---|---|---|
| na zona | 16,6 m/s, erra 0,85 m, 16/16 dentro | 20,1 m/s, erra 0,69 m |
| passou | 15,9 m/s, erra 3,24 m, **11/16 dentro** | 18,0 m/s, erra 2,58 m |

Antes disso ela era um acumulador que saturava no topo: segurar mais não mudava
uma linha.

**Força vem de altura.** Acertar a zona não é tudo: com os pés no chão a bola
precisa *subir* para passar da fita, e a rede trava a batida em ~16 m/s por mais
perfeito que seja o tempo. Carregue correndo, **pule**, e solte na zona em cima
da bola — dali a mesma carga sai a 20. Não é uma regra, é a geometria da rede
cobrando.

**O toque tem qualidade.** Não basta alcançar a bola: conta *onde* ela está em
relação ao seu corpo e *quão rápido* ela vem. Contato no corpo sai inteiro; na
ponta do braço a mira espalha, o ataque perde força, e no fundo da escala a bola
**queima** — sobe fraca e pra qualquer lado, e aí é correr atrás. A barra
`TOQUE` sobe enquanto a bola chega, e o aviso depois diz como saiu.

A ideia é do [Volleyball Unbound](https://store.steampowered.com/app/518040/Volleyball_Unbound__Pro_Beach_Volleyball/),
onde o miolo é acertar o tempo do contato e bola alta ou rápida é mais difícil
de acertar. Aqui o tempo vira **geometria**, que é o que este jogo já sabe medir.
É a mesma função pro humano e pra CPU, com os mesmos números.

Uma consequência: **cortada forte agora machuca de verdade**. Antes, bola a
24 m/s e balão a 8 se defendiam com a mesma limpeza, e atacar era só uma forma
mais arriscada de passar a bola.

**A mira alcança fora da quadra.** Ela era grampeada 40 cm dentro das linhas —
mirar na linha não era arriscado, era *impossível*, e nenhuma bola saía por
escolha. Agora o anel azul vai até a zona livre inteira: dá pra mirar em cima da
linha, e dá pra mirar fora. E toda batida espalha um pouco, mesmo a perfeita,
porque ninguém acerta o mesmo centímetro duas vezes.

O risco, medido em 20 ataques por caso:

| mirando | com o tempo certo | tendo passado da zona |
|---|---|---|
| no meio do fundo | 0/20 fora | 2/20 |
| perto da linha | 2/20 | 8/20 |
| **em cima da linha** | **3/20** | **8/20** |
| um passo além | 20/20 | 20/20 |

**Marcadores no chão.** O anel branco mostra onde a bola **vai cair** — e
aperta conforme ela chega, então diz também *quando*. O anel azul mostra para
onde o **seu ataque** vai. A previsão do branco é a mesma que a IA usa: não há
duas contas de onde a bola cai, então o que você vê é o que o adversário está
lendo.

**Adversário.** Prevê onde a bola vai cair, corre até lá com um erro de leitura,
e joga como se joga vôlei: o primeiro toque **arma** perto da rede, o segundo é
ataque. Usa exatamente a mesma física de toque que você — erra por ter erro, não
por ter regra própria, e a dificuldade é um punhado de números em `config.ts`.

**E ele julga bola fora.** Antes salvava tudo: corria atrás de bola que ia morrer
um metro depois da linha e devolvia, dando de presente um ponto que já era dele.
Agora lê a queda prevista *com o mesmo erro de leitura que usa pra correr* e
deixa passar o que cai além de uma margem — 85 cm no fácil, 15 no difícil. Julgar
bola fora é das coisas mais difíceis do vôlei, então é atributo e não regra: errar
pro lado errado custa o ponto, como na quadra de verdade.

Ele devolvia tudo de primeira, num balão alto, até se medir o que acontece
quando dois deles jogam um contra o outro: **0 a 0 depois de dois minutos**. O
balão sempre chega, sempre é alcançado e sempre volta. Contra um humano isso
nunca aparece, porque quem termina o ponto é o humano.

---

## Arquitetura

```
src/
  config.ts             todos os números de tuning num lugar só, com o porquê
  main.ts               bootstrap: renderer e Game, nessa ordem
  core/
    Game.ts             laço principal; roda todas as arenas, aponta a câmera
    Input.ts            teclado e mouse (sem pointer lock — a mira é no chão)
    CameraRig.ts        câmera em 3ª pessoa, presa à quadra e não ao corpo
    ballistics.ts       solvers de arco e previsão de queda — lógica pura
    gpu.ts              detecta renderização por software e adapta
    math.ts             clamp, lerp, damp, AABB, aleatórios
  world/
    Arena.ts            uma partida, numa quadra, num lugar do mundo
    praia.ts            onde ficam as quadras — só dado, sem código
    buildBeach.ts       o chão: um só, pro mundo inteiro
    Court.ts            a única fonte de verdade sobre geometria de jogo
    buildCourt.ts       linhas, rede e postes — e os colisores junto
    Physics.ts          o integrador da bola e as colisões
    Markers.ts          os anéis de queda e de mira, no chão
    textures.ts         areia, rede e bola desenhadas em canvas 2D
    buildQuadraModelo.ts a pele do cenário QUADRA
    buildEstadio.ts     a arquibancada do cenário ESTÁDIO
  ball/Ball.ts          estado, eventos e previsão de queda
  players/
    Athlete.ts          base comum do humano e da IA
    Motor.ts            corrida e pulo (cinemático: não empurra a bola)
    Hitter.ts           manchete, levantamento, cortada e saque
    Human.ts            lê o input, mira no chão
    Banhista.ts         você fora da quadra, andando pela areia
    controle.ts         a direção que o teclado pede, relativa à câmera
    AI.ts               prevê, persegue, arma e ataca
    buildAthlete.ts     o corpo low-poly
    buildAtletaModelo.ts carrega o modelo e monta as animações
    animacoes.ts        qual clipe tocar, dado o estado do corpo
    Animador.ts         o AnimationMixer e as transições
    poses.ts            pulo, mergulho e os toques, escritos à mão
  match/Match.ts        placar, saque, toques, fim de jogo — lógica pura
  ui/
    HUD.ts              placar, saque e avisos, em DOM
    Screens.ts          menu, pausa, fim de jogo, opções
    PerfMeter.ts        o painel do F3
    style.css
scripts/
  preparar-estadio.mjs  a receita que transforma o estádio cru em asset
  asset-report.mjs      quanto pesa cada asset, nos dois builds
tests/                  balística, regras da partida, as poses e os assets
```

`ballistics`, `Match`, `Court` e `Hitter` **não tocam em nada de render** — nem
`Mesh`, nem `Material`, nem `Scene`, nem geometria. Eles usam o Three só como
biblioteca de vetores (`Vector3`, `Matrix4`), que roda no Node como qualquer
outra. É por isso que essa parte tem teste e o resto não.

---

## Decisões que valem explicar

- **A física é própria, e não por preguiça de instalar uma engine.** A IA prevê
  onde a bola vai cair *simulando a integração*. Se a previsão e a simulação não
  forem literalmente a mesma função com o mesmo passo, a IA corre para o lugar
  errado — e isso não aparece como erro, só como jogo ruim. `passoDaBola` é a
  única verdade sobre o movimento da bola, e `preverQueda` chama exatamente ela.
- **A bola roda em passo fixo (1/100 s); o resto do jogo, em `dt` variável.** Só
  a bola precisa ser prevista.
- **Tudo em espaço local da quadra.** Limites, lados, rede e spawns são
  calculados em local e convertidos para mundo. Mover ou girar a quadra não toca
  em nenhuma linha de bola, jogador ou IA — foi essa decisão que fez as três
  quadras da praia custarem uma classe (`Arena`) e uma lista de posições, e não
  uma reescrita.
- **A geometria visual e os colisores saem dos mesmos números.** Não há duas
  listas, então o que se vê não tem como divergir do que colide.
- **O corpo do atleta não colide com a bola.** Todo contato é intencional e passa
  pelo `Hitter`. Sem isso, correr encostado na bola vira caos.
- **A câmera fica atrás do jogador em relação à QUADRA**, não à rotação do corpo.
  Presa ao corpo, virar para pegar uma bola lateral giraria o mundo inteiro e a
  leitura do campo se perderia a cada toque.
- **A altura da câmera é uma conta, não um gosto.** A linha de visão que raspa o
  topo da rede a partir de uma câmera a altura `h` e distância `D` toca o chão do
  outro lado a `2,24·D/(h−2,24)` metros da rede. Com os 6 m do protótipo isso dá
  8,5 m — passa da linha de fundo adversária. O campo inteiro do adversário
  ficava escondido atrás da rede, num jogo em que se mira nele.
- **O solver sobe o arco até passar da rede**, até oito tentativas. É o que
  impede o jogador de enterrar a bola na própria rede toda jogada.
- **O marcador de queda prevê até o centro da bola no contato, não até o chão.**
  A bola toca a areia com o centro a um raio de altura; mirar em `y = 0` erra
  uns dez centímetros sempre para o mesmo lado. Medido: 0,9 cm de erro médio.
- **A folga exigida sobre a fita é menor num ataque** (0,15 m) do que num passe
  (0,35 m). Com a folga do passe, *nenhuma* velocidade cruzava a rede num tiro
  reto, o solver transformava tudo em balão e a carga não existia na prática.
  O preço é do jogador: bola mais rasteira acerta a fita com mais facilidade.
- **A carga é a intenção, e por isso passar e atacar são o mesmo botão.**
  O esquema passou por três versões. O ataque nasceu como *modificador* — era
  preciso segurar o direito e clicar o esquerdo ao mesmo tempo, um acorde de
  dois botões para a ação mais comum do jogo, e ninguém descobria. Virou ação
  no direito. Hoje está no esquerdo, junto com o passe: decidir entre passar e
  atacar é decisão de **mira e de tempo**, não de qual dedo usar. O direito
  ficou com o que faltava — *levantar* de propósito, venha a bola na canela ou
  na cabeça.
- **No saque, a carga muda o arco e não a velocidade direto.** De 1,35 m de
  contato, cruzando a rede a 8,8 m de distância, um arco mais raso que 2,8 m de
  ápice bate na fita — o solver só o levantaria de volta. Na faixa que cabe a
  diferença é grande mesmo assim: o voo cai de 2,0 s para 1,1 s entre o toque e
  a carga cheia.
- **Um buffer de 0,18 s guarda o clique adiantado.** Sem ele o jogo parece
  travado justamente quando o jogador acertou o tempo.
- **Nenhum arquivo binário no repositório.** Textura é canvas 2D, geometria é
  primitiva do Three. É por isso que o build de arquivo único funciona inteiro.
- **A quantidade de luzes nunca muda depois que o jogo carrega**, e os shaders
  são compilados antes da partida. No Three, qualquer um dos dois fora de hora
  trava o quadro.

Durante o jogo, `window.__VOLEI` expõe a instância do `Game`. Dá para avançar o
tempo sem esperar o relógio:

```js
for (let t = 0; t < 10; t += 1 / 60) __VOLEI.update(1 / 60);
```

---

### As animações que o pack não tinha são escritas à mão

O pack de personagens traz `Idle`, `Walk`, `Run` nas quatro direções — e nada de
vôlei. Faltavam pulo, mergulho, manchete, levantamento, ataque e saque.

Elas estão em **`poses.ts`**, como número e comentário, do mesmo jeito que o
resto do projeto é escrito. O que torna isso viável é o formato: a pose **não**
diz "gire o ombro 40 graus em X", diz **para onde o osso aponta**, e o
quaternion sai de uma conta contra o esqueleto de verdade.

```ts
UpperArmR: mix([C, 3], [F, 1.4]),   // braço direito no alto, puxando à frente
LowerArmR: mix([C, 3], [F, 1.5]),   // e ESTICADO: é o que separa cortada de tapa
```

O motivo é que o rig é feito à mão e os eixos locais do braço esquerdo e do
direito **não são espelhados**. Escrever ângulo por eixo exigiria decorar cada
osso, e erraria calado na hora de espelhar uma pose.

Três fatos do rig que a conta esconde, e que o teste protege:

- **Todo osso guarda o filho em +Y local.** É o que dá eixo para os ossos folha —
  o joelho é folha, porque `FootL`/`FootR` são alvos de IK pendurados na raiz e
  não fazem parte da perna.
- **As pernas penduram no `Body`.** Dobrar o joelho *levanta o pé*, não abaixa o
  quadril. Quem agacha é o `Body` descendo, e o joelho dobra o tanto exato para a
  sola continuar na areia — os dois juntos, ou o atleta joga flutuando.
- **O `Body` vem com 27° de giro que o `Torso` desfaz com -27,7°.** Mexer em um
  sem o outro torce o tronco inteiro, e o sintoma é uma mão 12 cm mais funda que
  a outra numa pose simétrica.

Todo gesto começa na pose **do contato**, e não numa armada. O atleta só sabe que
tocou a bola depois de tocar — o `Hitter` resolve e a bola sai no mesmo quadro,
sem aviso prévio. Quem faz o papel da armada é a própria mistura entre clipes,
curta de propósito: uma armada de 0,2 s faria a bola sair antes da mão chegar.

E os seis são desenhados por **silhueta**, não por anatomia. A primeira versão
tinha cada pose certa isolada e mesmo assim quatro delas liam como "levantou os
dois braços" à distância da câmera — o erro não estava em nenhuma pose, estava na
falta de contraste entre elas. Hoje o braço livre da cortada vai para o quadril e
a mão do levantamento para na testa, e há teste medindo que os gestos fiquem
longe uns dos outros:

| gesto | mão mais alta | desnível entre as mãos |
|---|---|---|
| `Manchete` | 0,88 | 0,00 — plataforma |
| `Levantamento` | 1,53 — na testa | 0,00 — dois braços |
| `Pulo` | 1,81 — acima da cabeça | 0,00 — dois braços |
| `Saque` | 1,80 | 0,31 — um braço |
| `Ataque` | 1,81 | 0,78 — um braço |

### Um estádio de futebol vira arena de vôlei cortando 73% dele

O cenário **ESTÁDIO** sai de um modelo de estádio de futebol do Sketchfab que
baixa com **45 MB**. Ele entrou no jogo com **1,5 MB**, e o caminho não foi
"comprimir": foi *descobrir onde estava o peso*.

O palpite óbvio era textura — "low poly" quer dizer malha barata. Estava errado:
o `scene.bin` sozinho tinha 36,8 MB contra 8,5 MB de imagem. Medindo peça a
peça, de 472.208 triângulos:

| peça | triângulos | |
|---|---|---|
| 8 gols, com a **rede modelada em geometria** | 262.000 | 55% |
| 4 alambrados do perímetro, tela em geometria | 83.000 | 18% |
| escadas de canto | 73.300 | 16% |
| 4 torres de refletor | 48.800 | 10% |
| arquibancadas, laje, casca, placa de LED | ~5.000 | 1% |

**As arquibancadas — a única coisa que o jogo queria — custavam 500 triângulos
cada.** Tudo que pesava era futebol. Jogando fora gol e alambrado, o modelo cai
para 124 mil triângulos; quantização e meshopt fazem o resto (4,2 MB → 1,5 MB, e
o decoder já vem com o three, em 29 kB).

Dentro da arquibancada vai a **mesma quadra do cenário QUADRA** — o estádio é a
vizinhança dela, não um substituto. Dá para **sair da quadra com `Q`** e andar
pelo piso da arena, até o anel de placas.

A laje azul do modelo **some** neste cenário: com o chão já daquele azul ela não
desenha mais nada, e o topo dela — praticamente na altura do chão do mundo —
deixava um retângulo tracejado de z-fighting em volta da quadra. No QUADRA ela
continua, porque ali o chão é branco e a borda é o que separa a quadra do vazio.

O piso passou por dois erros antes de acertar, e os dois eram sobre **contexto**:
primeiro o cinza da laje do modelo (um buraco quase preto ao lado de uma quadra
turquesa), depois um cinza claro — que resolvia o buraco e continuava sendo uma
ilha, com a quadra lendo como tapete largado num galpão. Num ginásio de verdade
**não existe piso "em volta da quadra"**: a quadra e o salão são a mesma
superfície, e a borda azul só continua até a arquibancada. Hoje o piso é o
próprio azul da quadra, vindo da mesma constante que pinta o modelo — com a cor
escrita em dois lugares, a primeira mexida num deles abriria uma emenda bem no
meio do quadro.

**O quanto o estádio encolhe tem um piso medido, não escolhido** — e quem define
esse piso mudou de dono no meio do caminho. Era o anel de placas do próprio
modelo, a 13,37 m do centro, e por isso o estádio não descia de `0,60`. Com o
anel **refeito em código** (`buildPlacas.ts`, medido a partir da quadra e não do
estádio), quem chega primeiro na área de jogo passou a ser a arquibancada, cuja
borda interna está a 16,25 m: `16,25 × escala > 8`, ou seja `escala > 0,49`. O
teste de vértices confirma — 0,55 passa, 0,50 reprova. Hoje está em **0,55**.

**As placas de propaganda são desenhadas em canvas**, como a areia, a rede e a
bola. As do modelo não davam: as UVs do anel são inconsistentes na volta — num
trecho a textura sai espelhada (o texto lê de trás pra frente) e noutro sai
esticada até virar cor chapada. Não há textura que conserte um mapeamento. Os
anunciantes são inventados e são o vocabulário do próprio jogo: `PEIXINHO` e
`MANCHETE` são os nomes que o código usa pro mergulho e pro passe.

E há uma **ordem** entre os quatro raios em volta da quadra, cada um morando num
arquivo diferente, que tem teste porque nada no código obriga os quatro a
concordarem:

```
zona livre  <  passeio  <  placas  <  arquibancada
   8 x 12      8,3 x 12,3   8,5 x 12,5      8,94
```

E a paleta é do jogo, não do modelo. Duas coisas deixavam o estádio morto ao
lado de personagens e quadra de cor viva:

- **`metalness: 1` em quase todo refletor.** Material metálico sem mapa de
  ambiente o three resolve como **preto** — não há o que refletir. Eram 40 mil
  triângulos de torre saindo como silhueta morta.
- **A luz do jogo é de praia**: sol direcional forte, pouco preenchimento. Face
  virada para o lado contrário do sol cai quase a zero. Numa praia aberta isso
  não aparece; uma arquibancada é feita só de superfície vertical.

Duas outras medidas resolveram o encaixe, e as duas foram surpresas boas:

- **O gramado tem 20,3 × 33,4 m**, e não os 105 × 68 de um campo oficial. A
  quadra com zona livre é 16 × 24 m. Cabe em **1:1** — não foi preciso escalar
  nada, e por isso o degrau da arquibancada mantém o tamanho certo.
- **As três texturas de 2048²** (8,2 MB em disco, 67 MB de VRAM) eram todas do
  mastro dos refletores. Relevo e brilho numa treliça a 40 m não viram pixel.

A adaptação é um **script versionado**, `scripts/preparar-estadio.mjs`, e não um
"abri no Blender e exportei": o que sai dali é um binário que ninguém revisa, e
o arquivo cru de 45 MB não cabe no repositório. O script também **mede o gramado
antes de apagá-lo** para alinhar o modelo — assim a correção de altura fica
assada no asset, em vez de virar um número mágico dentro do jogo.

## Publicando

O repositório traz um workflow de GitHub Pages: `npm ci`, `npm run build`,
publica `dist/`. Em **Settings → Pages → Source**, escolha **"GitHub Actions"**.

O build leva menos de um minuto. Sem licença, sem cache de 7 GB, sem limpeza de
disco no runner.

---

## Desempenho

A cena é leve: cerca de 34 desenhos por quadro. Se o fps estiver ruim, **a
primeira pergunta não é sobre o jogo: é quem está desenhando.** O `F3` mostra o
renderizador e acende em vermelho quando o navegador caiu para software
(SwiftShader, llvmpipe, WARP). Nesse estado cada pixel sai da CPU e nenhuma
otimização de shader muda a ordem de grandeza.

O menu tem um controle de resolução (50% a 100%). O custo do quadro cresce com a
**área**: 70% de resolução são 49% dos pixels.

---

## Ideias pro próximo fim de semana

- Som: toque, quique na areia, apito. O `Audio.ts` do rpk.fps é a fundação.
- Duplas, em vez de um contra um.
- Mais quadras, e com gente diferente em cada uma.
- Multiplayer de verdade: hoje as outras quadras são bots. As partes puras
  (`Match`, `Court`, `ballistics`, `Physics`) já rodariam num servidor Node sem
  mudança; o que falta é `Athlete` e `Ball` pararem de importar render.
- Placas de patrocínio nas âncoras que a quadra já cria.

## Créditos

O cenário **QUADRA** usa o modelo *[Volleyball court](https://sketchfab.com/3d-models/volleyball-court-1d42899e76374926869d370a222be1c3)*,
de **Konstantin**, sob [CC Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

O cenário **ESTÁDIO** usa *[Low Poly Football Stadium](https://sketchfab.com/3d-models/low-poly-football-stadium-c5b5277cebf647fd863f3b37da118c9b)*,
de **ismeteren07**, sob [CC Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) —
adaptado: gol, alambrado e gramado removidos, e o resto realinhado sobre a
quadra. A receita da adaptação está em `scripts/preparar-estadio.mjs`.
O crédito também aparece no rodapé do menu, que é onde a licença exige que ele
esteja: visível para quem joga, não só para quem lê o repositório.

Todo o resto — quadra, atletas, bola, areia, rede — é gerado por código.

O corpo dos atletas é o *[Ultimate Modular Men Pack](https://quaternius.com/packs/ultimatemodularcharacters.html)*,
de **Quaternius**, sob **CC0** — domínio público, sem exigência de crédito. Está
aqui porque é justo, não porque é obrigatório.
