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
> compila em **um segundo** e entrega **149 KB comprimidos**.

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
| Levantar no próprio campo | **Clique direito** |
| Sacar | Segure e solte o clique esquerdo — a carga vale aqui também |
| Sair da quadra e andar pela areia | `Q` |
| Entrar na quadra em que você está encostado | `E` |
| Girar a câmera (só fora da quadra) | Arrastar com o mouse |
| Aproximar ou afastar (só fora da quadra) | Roda do mouse |
| Assistir outra quadra | `[` e `]` |
| Voltar a câmera pra você | `Tab` |
| Reiniciar | `R`, na tela de fim de jogo |
| Pausar / desempenho | `Esc` / `F3` |
| Esconder o manual de teclas | `H` |

O manual fica na lateral esquerda da tela — a maior área de areia vazia que a
câmera enquadra, então ele não cobre nada que se precise ver. `H` esconde, e a
preferência fica guardada.

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

**E a câmera gira.** Fora da quadra, arrastar com o mouse orbita em torno de
você — de rente à areia até quase de cima — e a roda aproxima ou afasta. O
`W A S D` continua sendo relativo à câmera, então girar a vista muda pra onde
você anda, como em qualquer jogo em terceira pessoa. Dentro da quadra ela volta
a ser fixa, e isso é de propósito: ler o campo é metade do jogo, e o campo não
se lê com o mundo girando a cada bola lateral.

---

## Como o jogo funciona

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
a regra de verdade. E o sacador tem **5 segundos**: passou disso é ponto do
adversário. Sem relógio, quem está perdendo simplesmente não saca, e não havia
nada no jogo que o obrigasse.

**Força vem de altura.** Segurar o botão de ataque carrega a batida. Mas com os
pés no chão a bola precisa *subir* para passar da fita, e a carga se perde: de
pé, qualquer carga sai a ~10 m/s. Carregue correndo, **pule**, e solte em cima
da bola — ali a mesma carga vira 24 m/s, e a bola cruza a quadra em 0,27 s em
vez de 1 s. Não é uma regra, é a geometria da rede cobrando.

**Marcadores no chão.** O anel branco mostra onde a bola **vai cair** — e
aperta conforme ela chega, então diz também *quando*. O anel azul mostra para
onde o **seu ataque** vai. A previsão do branco é a mesma que a IA usa: não há
duas contas de onde a bola cai, então o que você vê é o que o adversário está
lendo.

**Adversário.** Prevê onde a bola vai cair, corre até lá com um erro de leitura,
e joga como se joga vôlei: o primeiro toque **arma** perto da rede, o segundo é
ataque. Usa exatamente a mesma física de toque que você — erra por ter erro, não
por ter regra própria, e a dificuldade é um punhado de números em `config.ts`.

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
  match/Match.ts        placar, saque, toques, fim de jogo — lógica pura
  ui/
    HUD.ts              placar, saque e avisos, em DOM
    Screens.ts          menu, pausa, fim de jogo, opções
    PerfMeter.ts        o painel do F3
    style.css
tests/                  balística e regras da partida
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
