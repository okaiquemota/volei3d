# Notas para o Claude Code

Vôlei de praia 3D em TypeScript + Three.js + Vite. Projeto pessoal, sem
framework de jogo — tudo escrito à mão. Irmão do `rpk.fps`, e a fundação veio
de lá.

## Comandos

- `npm run dev` — servidor de desenvolvimento
- `npm run typecheck` — `tsc --noEmit`, roda em segundos
- `npm test` — typecheck + os testes da lógica pura
- `npm run build` — typecheck + bundle

**Sempre rode `npm test` antes de considerar uma mudança pronta.** O `strict`
está ligado, junto com `noUnusedLocals` e `noUnusedParameters`.

## Convenções

- Comentários e textos de UI em **português, sem acento no código-fonte**. O HUD
  diz `VOCE VENCEU`, `PLACAR FINAL`, `BOLA NO CHAO`. Entidade HTML só para
  símbolo. Este arquivo tem acento porque é markdown; o código não tem.
- Números de balanceamento vão em `src/config.ts`, com um comentário dizendo
  **por que** o valor é aquele. Não espalhe constante mágica no meio da lógica.
- Nenhum asset externo. Textura é canvas 2D, geometria é primitiva do Three.
  É por isso que `build:single` funciona inteiro aqui, diferente do rpk.fps.
- Nada de alocar no laço: vetores temporários ficam no escopo do módulo
  (`_pos`, `_vel`, `_alvo`), geometrias são compartilhadas entre os atletas.
- Vindo do rpk.fps sem mudança: `gpu.ts`, `PerfMeter.ts`, `vite.config.ts`,
  `tsconfig.json`, os scripts de build e o workflow. `math.ts` veio podado e
  `Input.ts` veio sem o pointer lock.

## Onde mexer em cada coisa

- Medidas da quadra, física da bola, força dos toques, dificuldade da IA,
  regras da partida: **tudo** em `src/config.ts`.
- Geometria e colisores da quadra: `world/buildCourt.ts` — os dois saem dos
  mesmos números, de propósito.
- Como a bola se move: `world/Physics.ts`. Leia o aviso antes de mexer.
- Como um toque é resolvido: `players/Hitter.ts`.
- Regras: `match/Match.ts`. É lógica pura, tem teste, mexa com teste.
- "Lógica pura" aqui quer dizer **sem nada de render** — sem `Mesh`,
  `Material`, `Scene` ou geometria. O `Vector3` do Three entra à vontade: é
  biblioteca de vetores e roda no Node. Confundir os dois leva a reimplementar
  matemática de vetor à mão por nada.
- HUD: markup em `index.html`, setters em `ui/HUD.ts`, estilo em `ui/style.css`.
- Menu, pausa e fim de jogo: `ui/Screens.ts`. Ele é o único dono da classe
  `body.tela-aberta` — é ela que apaga o HUD atrás das telas e que decide
  quando soltar o foco do botão clicado.
- Uma partida numa quadra num lugar do mundo: `world/Arena.ts`. Onde ficam as
  quadras da praia: `world/praia.ts` — é só dado, mexer ali não mexe em código.
- O chão da praia: `world/buildBeach.ts`. Um só, pro mundo inteiro.
- Quem anda pela areia: `players/Banhista.ts`. **Não** é um `Athlete`, e não
  deve virar um: `Athlete` nasce preso a um `Court` e a um `Side`, e quem passeia
  não tem nenhum dos dois. Entrar numa quadra cria um `Human`; sair descarta ele
  e devolve o bot (`Arena.ocupar` / `Arena.liberar`).
- Quem olha pra qual quadra: `core/Game.ts` (`assistir`, `arenaEmFoco`).

## A regra que sustenta o projeto inteiro

**`passoDaBola` e `preverQueda` são a mesma integração.**

A IA prevê onde a bola vai cair simulando o voo. Se a previsão divergir da
simulação, nada quebra de forma visível — a IA só passa a jogar mal, e leva
horas para descobrir por quê.

Por isso a bola roda em passo FIXO (1/100 s) enquanto o resto do jogo roda em
`dt` variável, e por isso `preverQueda` chama `passoDaBola` em vez de reimplementar
a conta. No protótipo em Unity as duas usavam passos diferentes (0,02 contra
0,01) e a IA mirava um ponto que a bola não visitava.

Se você mexer numa, mexa na outra. O teste `a previsao de queda bate com a
simulacao real` existe exatamente para pegar isso.

## Espaço local da quadra

Limites, lados, rede, spawns e mira são calculados em espaço LOCAL e convertidos
para mundo. Nenhum módulo de bola, jogador ou IA conhece coordenada absoluta.

Isso não é preciosismo: é o que vai permitir várias quadras numa praia sem
refatorar. E tem uma armadilha concreta:

**Velocidade se converte entre espaços por ROTAÇÃO (`applyQuaternion`), nunca
por `transformDirection`.** Aquele normaliza o resultado — uma bola a 20 m/s
viraria uma bola a 1 m/s, sem nenhum erro de tipo para avisar. Por isso o
`Court` expõe `quaternion` e `quaternionInv` separados da matriz.

## Câmera: a altura é uma conta

A linha de visão que raspa o topo da rede (2,24 m), a partir de uma câmera a
altura `h` e distância `D` da rede, toca o chão do outro lado a:

```
x = 2.24 * D / (h - 2.24)
```

O campo adversário tem 8 m. Se `x >= 8`, **o campo inteiro do adversário fica
escondido atrás da rede** — e este é um jogo em que se mira nele com o mouse.

O protótipo usava `h = 6`, `D = 9,5`, o que dá `x = 8,5`. Estava quebrado, e só
deu para ver isso com o jogo na tela. Hoje são `h = 10,5` e `D = 13`, que dão
`x = 4,8` — sobram 3,2 m de campo adversário visíveis por cima da fita.

Subir a câmera afasta tudo, então a lente fechou junto: FOV 62 → 45. **As duas
mudanças são a mesma decisão**; mexer numa sem a outra desenquadra.

## Movimento é relativo à CÂMERA, e o sinal já mordeu

`cross(frente, cima)` **já é a direita da tela** — não inverta.

Com a câmera olhando para −Z (o caso canônico) a conta devolve +X, que é a
direita. Com a nossa câmera, que fica atrás do jogador Home e olha para +Z, ela
devolve −X — e −X é mesmo a direita de quem olha naquela direção.

Um `negate()` ali troca o `A` com o `D`. E como o `D` passa a andar para a
esquerda, o sintoma parece "o controle está espelhado" em vez de "a conta está
errada" — o que manda você procurar no lugar errado.

**Conferir isso no olho não funciona**, porque as duas leituras parecem
plausíveis. O jeito é projetar o atleta na TELA e ver para que lado o pixel foi:

```js
const v = __VOLEI.player.objeto.position.clone();
v.project(__VOLEI.rig.camera);   // v.x > 0 e' a metade direita da tela
```

Lembre que o deslocamento na tela é menor que no mundo: a câmera acompanha 55%
do movimento lateral (`CAMERA.lateralFollow`), então o que importa é o SINAL,
não a magnitude.

## Armadilhas do Three (herdadas do rpk.fps, valem igual aqui)

- **NUNCA mude a quantidade de luzes durante o jogo.** Entrar ou sair uma luz —
  inclusive `visible = false`, ou esconder o pai dela — invalida os programas de
  shader de TODOS os materiais, e a recompilação trava o quadro por centenas de
  milissegundos. As duas luzes daqui nascem na inicialização. Para apagar, use
  `intensity = 0`.
- **`Game.aquecerShaders()` compila tudo antes da partida.** Ele renderiza um
  quadro de verdade: `renderer.compile` sozinho não cobre shader de sombra nem o
  envio das geometrias para a GPU. Material ou geometria novos precisam estar na
  cena nesse ponto.
- **`setMaxAnisotropy` antes de criar as texturas** — elas nascem no construtor
  da quadra, que roda no construtor do `Game`.
- **`PCFSoftShadowMap` é deprecado no r185** e cai em `PCFShadowMap` sozinho,
  poluindo o log. Não troque achando que amacia.
- **Textura é medida em METROS, não em repetições por peça** (`escalarUVsDaCaixa`).
  Sem isso, a areia de 400 m e a linha de 0,06 m mostram uma repetição cada, e o
  grão sai milhares de vezes maior numa que na outra.
- **A névoa usa a MESMA cor do céu.** Destoando, a borda da areia recorta do céu
  como adesivo.

## A areia é maior que a quadra, de propósito

A laje do protótipo era quadra + zona livre + 2 m: 18 por 26 metros. Da câmera em
terceira pessoa a areia acabava a treze metros e virava céu — a quadra lia como
um tapete voador, não como uma praia.

**A medida certa para o jogo não é a medida certa para a imagem.** A areia
desenhada vai a 400 m e a névoa come o fim dela. Os limites de corrida e de bola
dentro/fora continuam saindo do `Court`, com a zona livre de 4 m intacta.

## Ataque: a geometria da rede é quem manda, não o número

A carga do ataque escala a velocidade pedida (`ATAQUE`), mas quem decide o que
sai é o laço de folga da rede: se a trajetória não cruza a fita com folga, ele
alonga o tempo de voo até cruzar — e isso **desfaz** a força.

A conta que explica tudo: um ataque com contato a `h`, a `D` metros da rede,
mirando `z`, cruza a fita a

```
altura = h + vy*t_rede - g*t_rede²/2,   t_rede = D / vz
```

Com contato a 2,5 m (de pé, braço esticado) e a folga de 0,35 m do passe,
**nenhuma velocidade passa** — nem 10, nem 24 m/s. Toda carga convergia para o
mesmo balão, e a queixa "o ataque parece toque normal" era literalmente isso.

Duas coisas resolveram, e as duas são geometria, não balanceamento:

- a folga exigida de um ATAQUE caiu para 0,15 m (`ATAQUE.folgaDaRede`); passe,
  levantamento e saque seguem com 0,35;
- o ataque forçado passou a usar o solver de TEMPO. Antes, com os pés no chão,
  `escolherAcao` devolvia "levantamento" — solver de ápice, arco de 6 m.

O resultado medido, e é a forma que o jogo deve ter:

| de onde | carga leve | carga cheia |
|---|---|---|
| de pé, fundo | 10,3 m/s | 10,2 m/s |
| de pé, na rede | 10,6 m/s | 10,3 m/s |
| **pulando, na rede** | **14,5 m/s** | **24,2 m/s** |

De pé a carga não faz nada, e isso é **correto**: não se crava uma bola com os
pés no chão. Se alguém "consertar" isso um dia, vai estar lutando contra a
altura da rede, não contra um número.

## Marcadores: medir isso é mais escorregadio do que parece

O anel branco sai de `preverPouso`, a mesma previsão da IA. Ele mira
`floorY + BALL.radius`, não `floorY`: a bola toca a areia com o CENTRO a um raio
de altura, e prever até o chão erra uns dez centímetros sempre para o mesmo
lado. Se mexer nisso, mexa nos dois — marcador e IA — ou eles passam a discordar
sobre onde a bola cai.

Três maneiras de medir errado que já me pegaram, todas acusando metros de erro
num marcador que estava certo:

- **a CPU intercepta.** Mandando o lance para o campo adversário, ela devolve no
  meio do voo e o ponto de queda muda. O marcador acertou a trajetória que
  existia. Meça com o lance ficando no próprio campo.
- **a partida teleporta a bola.** Entre lances, o `Match` cobra o ponto e,
  passado o intervalo, `iniciarSaque` PRENDE a bola na mão do sacador — no meio
  do voo seguinte. Congele com `g.match.update = () => {}`.
- **ler o marcador depois do `update` no quadro do toque.** A bola já quicou, e
  o marcador passou a mostrar a queda SEGUINTE. Leia antes.

Com as três corrigidas: 0,9 cm de erro médio, 1,8 cm no pior caso.

## Medir o input é onde eu mais me enganei

Uma queixa de "o clique direito não ataca" custou QUATRO medições erradas antes
de virar diagnóstico, e nenhuma delas apontava para o lugar certo. A ordem em
que elas mentiram, porque o padrão se repete:

1. **a bola continua presa.** `Ball.teleportar` não solta a âncora, e a partida
   prende a bola na mão do sacador no início. `alcanca()` recusa bola presa,
   então nenhum clique fazia nada — nem o esquerdo.
2. **a partida cobra o ponto.** Deixando o `Match` ver a queda do primeiro
   caso, ele entra em "intervalo", `rallyVivo` vira falso, e todos os casos
   seguintes falham em silêncio.
3. **a CPU devolve.** O espião registrava QUALQUER `ball.bater`, então o que se
   media era a devolução da IA — uma velocidade apontando para trás, que parecia
   bug de balística.
4. **`ultimaAcao` vaza entre casos.** Um lance que não aconteceu aparece como se
   tivesse acontecido, porque o campo guarda o anterior.

5. **congelar a partida quebra a contagem de toques.** `match.update` é quem
   zera os toques no cruzamento da rede; com ele parado, o quarto lance seguido
   dispara "QUATRO TOQUES", a partida sai do rally e todos os casos seguintes
   falham calados. Chame `match.comecar()` + `registrarToque(quemSaca)` a cada
   caso.
6. **a bola cai enquanto se carrega.** Medindo carga de 800 ms com a bola solta,
   ela já está na areia na hora da soltada. Congele a bola durante a carga.
7. **a câmera volta sozinha.** Com a partida em `playing`, `rig.update` a
   reposiciona todo quadro e qualquer câmera de depuração é desfeita. Solte o
   alvo (`g.rig.alvo = null`) antes de enquadrar à mão.
8. **espiar dentro do `bater` não diz por que ele não foi chamado.** Se um
   portão anterior (`alcanca`, `rallyVivo`, buffer) barrou, o espião nem roda —
   e a ausência de dado parece "não bateu" em vez de "nem tentou".

O padrão: **o jogo é um sistema vivo, e uma bancada que não o congela mede
outra coisa — mas congelar demais cria problemas novos.** Antes de medir input,
desligue o que se move (`g.match.update`, `g.opponent.update`, `g.ball.soltar()`),
zere o que guarda estado entre casos, e instrumente o portão que barra, não o
que está depois dele.

E registre só o PRIMEIRO evento de cada tipo. Foi o que separou "a balística
manda a bola para trás" de "a CPU devolveu".

## Como testar de verdade

**Não dá para medir fps neste ambiente.** Sob renderização por software o jogo
roda a uns 2 fps por melhor que esteja, e qualquer conclusão tirada dali mede o
SwiftShader. O que vale medir aqui: `renderer.info.render.calls`, `.triangles`,
`info.programs.length` e `memory.geometries` — todos independentes de GPU.

**Não espere o relógio.** O `dt` é limitado a 1/20 por quadro, então a 2 fps um
minuto real vira um segundo de jogo. Avance o tempo de JOGO chamando o `update`:

```js
for (let t = 0; t < segundos; t += 1 / 60) __VOLEI.update(1 / 60);
```

Uma partida inteira de 15 pontos roda em segundos assim. Foi como se verificou a
rotação de saque e o fim de jogo.

**Duas armadilhas que já custaram medição errada aqui:**

- `g.player.motor.moverPara(...)` não funciona num teste: o `Human.update`
  sobrescreve a direção com o input a cada quadro. Ou aperte as teclas de
  verdade (`page.keyboard.down('d')`), ou zere `g.player.input` para o
  `atualizarMovimento` sair cedo e deixar o comando externo valer.
- `page.keyboard.press('Space')` não vira pulo num laço de `update` manual: o
  `wasPressed` é consumido pelo `endFrame` do laço de render antes do seu laço
  rodar. Chame `motor.pular()` direto.

## Erro que se repete não é erro: é ruído

A IA sorteava o erro de posição (`positionError`) dentro de
`atualizarAlvoDeCorrida`, que roda a cada `AI.decisionCooldown` — 0,08 s, doze
vezes por segundo. O comentário dizia "uma vez por decisão, senão vira tremor",
e a intenção estava certa; o efeito era o contrário do escrito. Doze desvios
aleatórios em torno do ponto certo **se cancelam**: a IA convergia pra queda
exata por mais alto que fosse o número, e `positionError` não defendia nada.

Foi o que deixou dois bots no `dificil` rebatendo por 87 segundos de média sem
ninguém errar. Sorteado uma vez **por bola lida** (`erroDeLeitura`), o mesmo
número vira leitura errada de verdade, que se paga.

Vale como regra: todo erro aleatório que a IA comete tem que durar o tempo da
decisão que ele estraga. Sorteado por quadro, ele não existe.

## Dois bots não jogam vôlei sozinhos por acidente

A IA devolvia toda bola de primeira, num balão alto mirado no fundo do campo
adversário. Contra um humano isso passa despercebido — quem termina o ponto é o
humano, que ataca. Entre dois bots, não: o balão sempre chega, sempre é
alcançado e sempre volta. Medido, dava **0 a 0 depois de dois minutos**, e uma
praia inteira de quadras congeladas.

O conserto não foi deixar a IA errar mais, foi fazer ela **armar**: primeiro
toque fica em casa, perto da rede (`chanceDeArmar`), segundo é ataque de
verdade. Com isso o `normal` faz um set de 15 em ~5,5 minutos e o `facil` em
~5,6. O `dificil` ainda estica (dois bots quase perfeitos), mas pontua — e a
quadra reinicia sozinha quando alguém chega a 15 (`Arena.recomecarSeAcabou`),
que é o que impede uma quadra de virar cenário depois do primeiro set.

Se for mexer nisso de novo: o sintoma "placar parado" tem três causas
diferentes e elas se parecem no relatório. Instrumente `match.estadoAtual` ao
longo do tempo antes de supor. `rallies: 0` com toques acontecendo é rally
eterno; `rallies: 0` sem toque nenhum é partida que nunca saiu de `parada`.

## `Matrix4.lookAt` é convenção de CÂMERA, e mordeu

`Matrix4.lookAt(olho, alvo, cima)` coloca o **+Z apontando do alvo pro olho** —
pra trás do que se olha. É certo pra câmera e errado pra corpo. O `Motor`
chamava `lookAt(origem, frente, ...)`, então o +Z do atleta apontava pro lado
oposto ao que ele encarava.

Nada quebra visivelmente: a cápsula é simétrica. O que quebra é **tudo que mora
no +Z do corpo**, e moram duas coisas:

- O marcador branco de frente, cujo único trabalho é dizer pra onde o atleta
  está virado. Virou marcador de costas.
- A **âncora do saque**, que segura a bola. O sacador segurava a bola atrás do
  próprio corpo, meio metro atrás da linha de fundo em vez de meio metro à
  frente dela — e era dali que o solver do saque partia.

Invertidos os dois argumentos, o +Z vira a frente de verdade. E aí aparece o
segundo efeito: com a bola de fato à frente, ela some atrás do tronco na linha
de visão da câmera. A âncora saiu do eixo (`-0.42, altura, 0.42`), que também é
como se segura uma bola pra sacar.

Pra conferir isto não olhe a tela: leia `objeto.getWorldDirection()` e compare
com a direção do movimento. A cápsula parece igual dos dois lados.

## Encarar a bola presa é perseguir o próprio braço

O `Human` encarava a bola sempre que ela estava do lado dele — inclusive quando
ela estava **na mão dele**. A bola presa fica na âncora, a âncora é filha do
corpo, o corpo gira pra encarar a bola, a âncora gira junto: o sacador rodava em
torno de si mesmo o saque inteiro, e a direção do corpo nunca assentava.

Com o +Z invertido o laço oscilava; com ele certo, assentaria em qualquer
direção — inclusive de costas pra rede. Os dois casos são errados pelo mesmo
motivo. `ball.presa` sai da conta: bola na própria mão não é alvo.

## Ida e volta pra espaço local não devolve o mesmo número

`Court.desviarDaRede` empurra quem anda pra fora da rede. A primeira versão
convertia pra local, empurrava (ou não) e convertia de volta — sempre. Numa
quadra transladada em 26 m, a volta `x + 26 - 26` **não devolve x**: com x na
casa dos milésimos, 26 come os bits de baixo.

Isso seria ruído inofensivo se alguém não comparasse por igualdade exata. O
`Motor` compara: `if (_limitado.x !== this.posicao.x) velocidade.x = 0` é como
ele sabe que bateu numa parede. Com o erro da volta, ele achava que batia na
parede **todo quadro** — quem andava pelo eixo X fazia dois metros e parava.

A regra que fica: função de limite que não mexeu em nada devolve o vetor
**intocado**, sem passar por transformação nenhuma. Vale pra qualquer `LimitarArea`
que venha depois.

## O chão é do mundo, não da quadra

`construirQuadra` desenhava a laje de areia junto com as linhas. Com uma quadra
estava certo; com três virou **três lajes de 400 m coplanares**, empilhadas no
mesmo y. A contagem de desenhos não acusa — são três meshes como sempre — mas a
GPU pinta a tela inteira de areia três vezes por quadro, com textura e normal
map, e guarda três cópias das texturas.

O sintoma é medível só em `renderer.info.memory.textures` (13 caiu pra 9) e em
triângulos. Se for acrescentar cenário, pergunte antes de que ele é: do mundo ou
da quadra.

## A câmera gira fora da quadra, e só lá

Dentro da quadra ela é presa à quadra de propósito: a leitura do campo — onde
está a rede, onde está a linha de fundo — se perde se o mundo girar a cada bola
lateral. Fora não há campo pra ler, há um lugar pra olhar, e travar o ângulo só
esconde metade dele.

Isso **não** reintroduz a realimentação que a câmera presa ao corpo tinha. O
perigo lá era: corpo gira → câmera gira → movimento é relativo à câmera → o
corpo gira mais. Aqui o ângulo é **input do jogador**, não consequência da
rotação do corpo — e o corpo é que segue a câmera. Sem ciclo.

**O pointer lock vale fora da quadra, e só lá.** Foi a divisão que o `Input`
não tinha: dentro da quadra a mira é um ponto no CHÃO, resolvido pela posição
**absoluta** do cursor, e capturar ali só atrapalharia. Fora não há mira, a
câmera gira pelo movimento **relativo**, e sem captura o cursor para de andar na
borda da tela — o giro morre no meio. Por isso `pointerX/Y` e `arrasteX/Y`
convivem: são duas perguntas, não duas versões da mesma.

Com o cursor travado, `clientX/Y` **congelam** e só `movementX/Y` reporta. Sair
cedo do `mousemove` nesse caso também preserva `pointerX/Y` onde o cursor
estava, que é pra onde ele reaparece ao destravar — e é de lá que a mira parte
ao entrar numa quadra.

A captura falha o tempo todo, e falhar é normal: o navegador só concede depois
de um gesto do usuário, recusa por ~1 s depois de um `Esc`, e o `Esc` a desfaz
sem avisar a página. Então **tem que funcionar sem ela**: com o cursor solto, o
arrasto com botão segurado ainda gira. Exigir botão nesse caso não é teimosia —
sem captura o cursor tem uma posição que importa, e uma câmera que girasse com
o cursor solto giraria também quando a mão só atravessa a tela.

Outros dois cuidados:

- `wheel` chega em unidades diferentes por navegador (`deltaMode` 0 = pixels,
  1 = linhas, 2 = páginas). Sem converter, o mesmo gesto zooma 16× menos no
  Firefox. E contar `Math.sign` por evento trata igual o clique seco de um mouse
  e o deslize contínuo de um trackpad — o trackpad dispara dezenas de eventos por
  segundo e atravessaria a faixa inteira num gesto.

**Órbita não se suaviza como câmera de perseguição.** Esta foi a que custou: a
de passeio nasceu reusando o `update` das outras, que amacia posição e rotação
**em separado**. Numa câmera que persegue um atleta isso é certo — o alvo
escorregar um pouco do centro é o que dá peso a ela. Numa órbita é defeito: a
posição era calculada em volta da posição **crua** do alvo enquanto a câmera
olhava pro foco **suavizado** (dois pontos diferentes), e a rotação ainda
chegava atrasada em relação à posição. Girando rápido, a câmera já tinha dado a
volta e a mira ainda vinha vindo — o personagem escorregava pro canto e voltava
sozinho.

O conserto é um ponto só: o foco amacia o ANDAR, a órbita é montada em volta
desse mesmo ponto, e o `lookAt` é **exato**. Medido: girando rápido, o desvio do
personagem em relação ao centro da tela é **zero**; andando a 6,5 m/s é 0,025 em
NDC (uns 16 px), que é o atraso de seguir — velocidade dividida pela constante.

Pra medir isto, projete o alvo com `.project(camera)` e veja o quanto ele sai de
(0,0). A olho, "escorregou e voltou" some no meio do movimento.

A constante de suavização também é outra, e pelo mesmo motivo: nas câmeras de
jogo ela amacia o movimento de OUTRA coisa, e 7 é o que impede o tranco. Esta
amacia só o andar do personagem, e ali 7 viraria meio metro de atraso.

## A câmera de quem assiste não é a de quem joga

Apontar a câmera pra bola de verdade inclina ela pro céu toda vez que a bola
sobe, e a quadra escorrega pro pé da tela. Quem assiste segue a bola **de lado**
(um quarto do deslocamento) e mira sempre na rede, na altura de um jogador.

A altura e a distância também mudam, e por conta, não por gosto: da posição de
jogo (10,5 m / 13 m) a linha de fundo mais perto cai a 79° abaixo do horizonte e
a mais longe a 30° — 49° de campo pra uma lente de 45°. Quem joga está no fundo,
então não sente falta; quem assiste quer as duas metades. A 13 m / 11 m a conta
dá 50° e 26°: cabe.

## No harness não há antialiasing — não conserte o que é do SwiftShader

Os screenshots do Playwright rodam com `--use-gl=swiftshader`, e `gpu.ts`
desliga o antialiasing quando detecta renderização por software. Medido:
`gl.getParameter(gl.SAMPLES)` devolve **0** ali, e `antialias: true` numa GPU de
verdade.

Consequência prática: com a câmera de passeio num ângulo rasante, as linhas da
quadra aparecem **tracejadas** nos screenshots. Parece z-fighting entre a fita
da linha e a laje de areia, e leva direto a mexer em `polygonOffset`, na altura
da linha ou em `camera.near`. Não é: é uma fita de 6 cm ocupando meio pixel a
40 m, sem amostra nenhuma pra resolver.

Antes de consertar artefato visual visto em screenshot, leia `SAMPLES` e o
`UNMASKED_RENDERER_WEBGL`.

## O toque tem qualidade, e o primeiro quadro é o pior

A dificuldade do jogo vem daqui, e a ideia é do Volleyball Unbound: lá o miolo é
acertar o **tempo** do contato, e bola alta ou rápida é mais difícil de acertar.
Aqui o tempo vira **geometria** — o quanto o contato foi centrado, e o quanto a
bola vinha rápido — que é o que este jogo já sabe medir. Mesma função e mesmos
números pro humano e pra IA (`Hitter.qualidadeDoContato`).

A armadilha está em `alcanca`. Ela responde "dá pra tocar", e o **primeiro
quadro em que ela diz sim é o pior de todos**: a bola acabou de entrar no
cilindro de 1,3 m, na ponta do braço. Quem bate ali bate mal, sempre.

Isso queimou as duas pontas de uma vez:

- A IA batia no primeiro quadro. Medido: **metade dos toques queimava**, e o
  motivo campeão de ponto virou "quatro toques" — porque bola queimada fica em
  casa e consome os toques do lado.
- O humano tem o buffer de toque, que existe pra não perder um clique
  adiantado. Um buffer que dispara no pior quadro da janela não está perdoando
  nada: está escolhendo o pior momento por você.

Os dois esperam a bola chegar (`Athlete.esperarPelaBola`), e no ar ninguém
espera — quem pulou pra cortar bate no alto e na frente do corpo.

**Meça a janela antes de escolher o tamanho da zona limpa.** A bola fica ao
alcance por **0,18 s no total**. Com a zona limpa em 45% do raio sobravam 0,05 s
— três quadros — e 14% das bolas não tinham quadro limpo nenhum. Isso não é
habilidade, é sorteio. Em 0,7 a parte limpa vai a 0,07 s e o "sem janela nenhuma"
cai pra 4%; com o buffer esperando, o jogador clica na janela inteira e o toque
sai no momento bom.

Onde a ladeira de dificuldade parou, medido em 10 min de bots:

  fácil    45 pontos, rally 10 s, 14% queimados, qualidade mediana 0,77
  normal   36 pontos, rally 13 s,  4% queimados, mediana 0,84
  difícil  14 pontos, rally 36 s,  2% queimados, mediana 0,89

O `defesa` da IA desconta a dificuldade da bola que chega, e o teto é baixo de
propósito: em 0,6 a cortada de 24 m/s custava só 0,22 de qualidade, dois bots
difíceis defendiam tudo e o rally médio voltou pra 58 s com nove pontos em dez
minutos — a quadra congelada de novo, por outro caminho.

## A barra de força é um QTE, e o solver precisou ser consertado pra ela valer

A barra era um **acumulador que saturava**: enchia em 0,6 s e parava. Segurar
mais não mudava uma linha, e a queixa ("sinto que ela não muda nada") estava
certa. Agora ela varre até `cargaMaxima`, tem uma zona perto do topo, e passar
dela custa força e mira. No teto o golpe **sai sozinho** — sem isso, segurar
para sempre viraria estratégia e o castigo de ter passado nunca chegaria.

A leitura é pura e tem teste (`players/carga.ts`): a zona é a única coisa no
jogo que o jogador controla com o tempo do dedo, e se ela escorregar meio quadro
ninguém percebe olhando.

**O solver da cortada quebrava a promessa da zona.** `resolverCortada` subia o
tempo de voo em passos fixos de 0,07 s e parava no primeiro que passava da fita
— e esse múltiplo pode cair bem acima do mínimo. Medido: carga cheia saía a
**18,8 m/s** e carga 0,7 saía a **19,9**. Carga maior chegando mais devagar, numa
barra que promete "aqui é o ponto mais forte". Com bissecção depois do passo
fixo, a força voltou a ser monótona (16,6 de pé, 20,1 no ar, teto em ambos).

Isso também deixou os ataques da IA mais rasos, e a ladeira melhorou junto:
`difícil` foi de 14 pra 20 pontos em 10 min, com o rally médio caindo de 36 s
pra 27.

**Ao medir um golpe, faça só a BOLA avançar.** `g.update(dt)` também move os
atletas, e o bot devolve o ataque antes de ele cair: a primeira medição deu
desvio de 8,5 m em todos os casos porque estava medindo onde a devolução caiu,
não o ataque. `a.ball.update(dt)` num laço mede o que se quis medir. É a mesma
armadilha do espião que capturava qualquer `ball.bater`, de outra roupa.

**Screenshot de barra que anda sai errado.** O laço de render continua rodando
entre o `evaluate` que confirma o estado e o `screenshot` que o fotografa — e
com uma barra que varre em 0,75 s, 150 ms já mudam o que está na tela. Confie na
asserção do DOM pra provar o estado; a foto serve pra ver o desenho, não pra
provar o valor.

**E a `cortada` só é cortada se o ATLETA estiver no alto.** Pôr a bola a 2,6 m
com o atleta no chão mede um ataque de pé com nome errado — a altura do contato
vem do pulo. Com `motor.posicao.y = 0.85` a faixa de velocidade aparece.

## `preverPouso` diz ONDE a bola cai, não se aquilo é dentro

A IA salvava tudo. Corria atrás de bola que ia morrer um metro depois da linha
de fundo, devolvia, e dava de presente um ponto que já era dela — porque
ninguém nunca perguntou se a queda prevista estava **dentro das linhas**.

O conserto tem duas partes, e a segunda é a que não é óbvia:

- `Court.distanciaParaFora` responde em METROS, e não sim/não. Quem julga
  precisa saber por quanto, porque a margem de erro de quem julga é uma
  distância. O julgamento usa a queda prevista **mais o mesmo `erroDeLeitura`**
  que a IA já usa pra correr — julgar pela previsão exata daria um juiz de linha
  perfeito, que é pior que um que salva tudo.
- **A decisão precisava de outro gatilho.** `decidirAJogada` disparava quando a
  contagem de toques do lado mudava — e essa contagem vale 0 durante a posse
  inteira do adversário E no começo da minha. A jogada era resolvida com a bola
  ainda do outro lado, onde a queda prevista aponta pra quadra ADVERSÁRIA: a
  resposta era sempre "está dentro", e `julgouFora` ficava em **zero** em dez
  minutos de jogo. O gatilho certo é o toque (`ball.ultimoTocador`), que é o
  instante em que a bola passa a ser legível.

Medido depois: mirando 1,12 do meio-campo (0,82 m fora) o bot julga e não toca;
mirando dentro, joga normal. Em jogo de bots o julgamento é raro (3 a 7 vezes em
dez minutos) porque bot mira dentro — quem faz a bola sair é o humano, e é pra
ele que a regra existe.

## A mira do jogador estava grampeada dentro da quadra

`Court.limitarMira` prende o alvo DENTRO das linhas com um recuo, e o `Human`
usava ela com 40 cm. O efeito era o oposto de dificuldade: mirar na linha não
era arriscado, era **impossível**. Nenhuma bola saía por escolha — só por erro
aleatório, e partindo de 40 cm dentro. Sem risco na mira, atacar no canto custa
o mesmo que atacar no meio, e o jogo inteiro fica morno.

`limitarMiraDoJogador` alcança a zona livre inteira (recuo negativo). A que
prende dentro continua existindo e continua certa **pra IA**: um bot que mira em
cima da linha erra pra fora metade das vezes e vira um adversário burro.

E um detalhe que parece pedante e não é: com tempo perfeito e contato perfeito,
o erro somava **zero** e a bola caía no centímetro mirado. Mirar na linha virava
tiro certo. `ATAQUE.espalhamentoDaBatida` (35 cm) é o piso que nenhuma batida
escapa — pequeno demais pra atrapalhar quem mira no meio, grande o bastante pra
que a linha seja cara-ou-coroa.

**Onde a mira alcança, na tela:** a linha de fundo adversária cai perto de
y≈118 num quadro de 720, e o além-da-linha vive entre y≈60 e 118. É a mesma
faixa onde as barras de FORÇA e TOQUE moram agora. Elas não bloqueiam o clique
(`#hud` é `pointer-events: none`), mas cobrem o anel de mira no tiro mais
arriscado que existe. Se isso incomodar, é a posição das barras que cede.

## O HUD é reescrito a cada quadro: forçar estado nele não sobrevive à foto

`Game.loop` chama `hud.carga(...)` e `hud.janelaDeToque(...)` **todo quadro**,
com o estado real do jogador. Acender uma barra num `page.evaluate` e fotografar
no `evaluate` seguinte devolve retângulo zero: entre os dois, o rAF rodou e
escondeu a barra de novo. Dá na mesma armadilha da bola — o laço não para entre
uma chamada e outra.

Dois jeitos que funcionam:

- **Medir no MESMO `evaluate`** que acende. A geometria sai certa e é síncrona.
- **Fotografar com o jogo acendendo**: `page.mouse.down()` e esperar. Aí quem
  mantém a barra viva é o próprio laço, que é o que se queria testar.

## O jogo engolia o teclado do menu inteiro

`Input.onKeyDown` fazia `preventDefault` em `Space`, setas e `Tab` **em qualquer
estado**. O custo não aparecia enquanto as opções eram um `<select>` (que também
abre no clique), mas era real: nunca deu pra navegar o menu sem mouse, e na
pausa não havia como chegar em "CONTINUAR".

A regra agora tem duas metades, e as duas são necessárias:

1. **Foco num controle → a tecla é do controle.** `focoEmControle()` em
   `Input.ts`, mesmo critério do `onMouseDown` ("só conta clique no canvas").
2. **Fechou a última tela → solta o foco.** `Screens.sincronizarVeu` dá `blur()`
   no que estiver focado. Sem isto a primeira metade quebraria o jogo: o botão
   JOGAR continua focado depois do clique, e todo `Space` de salto viraria um
   clique nele.

O `Tab` é o único que depende do estado (`input.menuAberto`, escrito uma vez por
quadro pelo `Game`): do navegador com tela aberta, do jogo em quadra.

## Centralizar corta o topo, e `margin: auto` não

`place-content: center` num container com `overflow` centra pelo container: se o
conteúdo é mais alto que a tela, ele transborda **pros dois lados** e a rolagem
só alcança o de baixo. O topo do cartão fica inalcançável.

`display: flex` no `.tela` + `margin: auto` no `.cartao` centra enquanto cabe e
encosta no topo quando não cabe. A medida que prova: o topo do cartão dá 32px
(a padding) em 1280×720, 1280×560 e 430×860 — nunca negativo.

E o cartão do menu tem `max-height: 100%` com `grid-template-rows: auto
minmax(0, 1fr) auto auto`: quem encolhe é o miolo (COMO JOGAR, que rola por
dentro), nunca o botão JOGAR. Sem isso, numa janela de 1366×768 — metade dos
notebooks — a ação principal do jogo cai abaixo da dobra. O `minmax(0, 1fr)` é
obrigatório: um item de grid não encolhe abaixo do próprio conteúdo sem
`min-height: 0`, e aí o `1fr` não serve pra nada.

## A câmera de jogo tem DOIS enquadramentos, e não um zoom

A roda mexia num multiplicador que escalava altura e distância **juntas**, de
propósito: assim o ângulo não mudava. Isso mantinha a conta da fita válida em
todo o alcance, e mantinha também a única coisa que a câmera sabia fazer.

Agora `CAMERA.jogoPerto` e `CAMERA.jogoLonge` são dois enquadramentos inteiros e
a roda interpola entre eles (`CameraRig.enquadramento`, 0 a 1) — altura,
distância, quanto o foco puxa pra bola e quanto ela acompanha de lado. O ângulo
muda junto, que é o que separa uma câmera de ombro de uma tática: a de ombro não
é a tática de perto, é outra coisa.

Medido em 1280×720, o jogador na linha de fundo, com `camera.project`:

| | corpo do atleta | campo adversário |
|---|---|---|
| ombro (3,8 m / 6,5 m) | 27% da altura do quadro | 78 px |
| tática (10,5 m / 13 m) | 12% | 101 px |

O número que importa é o segundo: a mira é um ponto no chão resolvido por
raycast do cursor, então a altura em pixels do campo adversário **é** a
resolução da mira. O ombro custa um quarto dela — não é de graça, e não é
proibitivo.

Ao medir isto: o `home` fica em **z negativo** no espaço local da quadra. Projetar
`(0, 0, -8)` achando que é a linha de fundo adversária devolve a sua própria, e o
resultado parece dizer que o campo de lá está *abaixo* da rede na tela. O sinal
sai de `sinalDe(side)`.

## O tempo do jogo e o tempo do relógio se separam num lugar só

`Game.update` calcula `dtJogo = dt * tempo.passo(dt, ...)` e passa `dtJogo` pra
tudo que é mundo: arenas, banhista, `rig.update`. O que continua no relógio é o
que é leitura do jogador — o aviso do ponto (`hud.update`, lá no laço) e a
própria barra do poder, que senão demoraria a recarregar dentro da sua própria
câmera lenta.

`Tempo` gasta em segundos de **relógio**, e isso é a decisão inteira: em tempo
de jogo, 2,5 segundos a 35% seriam sete segundos vividos — três vezes o que a
barra promete, e ninguém descobre isso olhando. Tem teste justamente por isso.

Duas armadilhas que o teste protege e a tela não mostra:

- **O mínimo vale pra LIGAR, não pra manter.** Os dois no mesmo teste fazem o
  poder desligar sozinho a um quinto da barra, no meio de um toque.
- **Esvaziou, só volta depois de soltar.** Sem essa trava, segurar o botão
  depois do fim faz a barra recarregar, cruzar o mínimo e religar sozinha por
  meio segundo, em ciclos.

**Poder de percurso não mora em tecla de letra.** O poder nasceu no `F` e durou
um teste de jogo: ele se segura enquanto se corre atrás da bola, e chegar no `F`
pede tirar o indicador do `D`, que é o passo que o poder existe pra dar. Foi pro
`Shift`. O modificador que força o ataque com carga baixa, que morava lá, foi pro
`F` — esse é de **instante**, segurado junto com o clique no momento do contato,
com o atleta já posicionado, e ali a troca não custa nada. A pergunta que separa
os dois não é "qual tecla sobrou", é **se a mão precisa continuar andando**.

## Um `top: Nvmin` por elemento é uma bomba-relógio no HUD

Placar, barras e avisos tinham cada um o seu `top` em vmin. No dia em que a
barra do poder entrou **entre** o placar e as barras, todas as de baixo ficaram
erradas de uma vez — em 1024×640 a barra de FORÇA nascia 17 px *dentro* da
barra do poder. O número mágico não sabia que o bloco acima tinha crescido.

Agora tudo que mora no alto está dentro de `#hud-top`, empilhado em **fluxo**:
cada um começa onde o anterior acaba e some sem deixar buraco (`.hidden` é
`display: none`). O cluster das barras é o último filho, com `height: 0` — ele
marca onde começa, e os três filhos continuam pendurados nele em posições fixas,
porque esconder a FORÇA não pode puxar o TOQUE pra cima.

Efeito colateral do enquadramento novo: as barras agora caem na altura da REDE
na tela. Os trilhos passaram a ser quase opacos (0,92) — com 0,72 a malha preta
aparecia por dentro da barra.

## O mergulho é uma troca, e metade dele é o custo

`C` joga o corpo. O que se ganha está no `Hitter` (`estendido`): +1,1 m de
alcance horizontal, +45 cm pra baixo, e um bônus de `defesa`. O que se paga está
no `Motor`: no voo o teclado não manda, e depois vêm 0,85 s caído sem correr nem
pular.

As duas metades são a mesma decisão. Um mergulho corrigível no meio do voo é só
uma corrida mais rápida; um mergulho sem tempo de levantar é uma corrida mais
rápida que também alcança mais. Qualquer vazamento no custo transforma o gesto
de último recurso no jeito normal de andar — e nada na tela denuncia isso, por
isso tem teste.

Três decisões que parecem detalhe e não são:

- **O arranco SUBSTITUI a velocidade, não soma.** Somando, quem já corria a toda
  mergulharia mais longe, e o alcance do gesto viraria função da corrida
  anterior em vez de um número que dá pra aprender.
- **A zona limpa do contato continua medindo pelo alcance BASE.** Se ela
  crescesse junto com o alcance estendido, deitar deixaria o toque perto do corpo
  *mais limpo* do que ficar em pé. O que o mergulho estica é só o denominador: o
  metro a mais é todo na faixa cara.
- **Deitado amortece velocidade (`defesaExtra`).** Sem isso o mergulho seria
  inútil contra o que existe pra salvar: numa cortada a 22 m/s o custo de
  velocidade sozinho já derruba a qualidade, e somado ao estica de uma bola na
  ponta do alcance *todo* mergulho queimaria.

**O voo tem gravidade própria** (`MERGULHO.gravidade`, 45% da do pulo). Com a
gravidade do pulo, 0,42 s de voo pediriam subir 40 cm e o peixinho sairia
parecendo um pulinho; com ela baixa, o mesmo tempo cabe em 19 cm. Tempo de voo e
altura são a mesma conta — não dá pra pedir um longo e raso sem mexer no `g`.

**E o voo é a janela que a câmera lenta estica.** 0,42 s é tempo de ver que deu
certo, não de escolher o lado; a 35% viram mais de um segundo vivido, e aí a
decisão existe. Os dois foram desenhados juntos, e é por isso que o tempo de voo
tem teste: se ele encolher, o poder para de servir pro que foi feito.

**O pivô do corpo está nos pés**, então o tombo (`aplicarRotacao`) varre a cabeça
pra frente e pra baixo e a 1,35 rad o corpo fica deitado rente ao chão — a pose
sai de graça, sem osso nenhum. O tombo multiplica *à direita* do olhar, pra girar
em torno do X do próprio corpo: à esquerda, o peixinho tombaria sempre pro mesmo
lado do mundo.

**Ao testar isto no navegador:** mergulhar durante o saque é proibido de
propósito (`!this.sacando`). Um teste que entra no jogo e aperta `C` sem sacar
antes mede o guarda, não o mergulho, e o sintoma é `mergulhando` nunca virar
`true` — sem erro nenhum no console.

**A IA não mergulha.** O gesto está no `Human`, e o `Hitter.estendido` da IA
nunca sai de `false`. É uma vantagem do jogador, de propósito, e o dia em que a
dificuldade pedir isso o caminho é o mesmo: `AI` chama `motor.mergulhar` quando a
queda prevista cai fora do alcance mas dentro do alcance estendido.

## O cenário QUADRA é uma PELE, e essa palavra é o desenho inteiro

`Arena.usarModelo` esconde o `desenhoDaQuadra` e põe um clone do modelo no lugar.
Os **colisores não são tocados** — eles saem de `construirQuadra` uma vez, no
construtor, e continuam sendo os mesmos objetos nos dois cenários (medido:
`JSON.stringify(colisores)` idêntico antes e depois da troca). Se algum dia essa
linha se romper, o jogo não quebra: ele passa a *mentir*, e é muito pior.

Três coisas que o encaixe (`encaixarQuadra.ts`) resolve, e que custaram um
sintoma cada:

- **Duas escalas, não uma.** XZ por `8/9` (o modelo é indoor 9 × 18, o campo é
  praia 8 × 16, e os dois são 1:2, então as linhas caem em cima das certas). Y
  por `netHeight / topoDaRede`, porque a fita do modelo está a 2,10 e o colisor
  a 2,24 — com escala única ela cairia pra 1,87, e a bola passaria por cima do
  desenho pra bater no nada.
- **Recentrar.** O modelo nasce a 136 m da origem no X. Sem isso ele sai do
  tamanho certo e no lugar errado — e "no lugar errado" a 136 m é fácil de ler
  como "o modelo não carregou".
- **`POUSO_NA_AREIA`.** Vive em `chao.ts` porque as linhas desenhadas e a pele de
  modelo têm que pousar no MESMO milímetro. Na primeira tentativa o piso foi pro
  `y = 0` exato e sumiu inteiro: a areia ganhou a briga de z e a quadra apareceu
  sem chão, só rede, postes e bancos.

## Quem desenha no chão disputa a mesma altura, e a ordem mora em `chao.ts`

Quatro coisas são praticamente coplanares: a areia do mundo, as linhas
desenhadas por código, a pele de modelo e os marcadores de queda e de mira. O
z-buffer não tem precisão pra decidir entre elas, e quem ganha muda com a
câmera, com o enquadramento e com a distância.

Isso já custou **dois** sintomas, e os dois pareciam "não carregou":

1. O piso do modelo brigou com a areia e sumiu — a quadra apareceu só com rede,
   postes e bancos.
2. Resolvido o primeiro com `polygonOffset`, os **marcadores** passaram a brigar
   com o piso do modelo e sumiram. Os anéis estão a 2 cm e a placa do modelo
   ocupa de 0,1 a 2,1 cm: eles caem *dentro* da espessura dela, e o empurrão que
   eu tinha escolhido só pra pele terminou de decidir a briga do lado errado.

A lição é que **um `polygonOffset` escolhido sozinho não existe** — ele é uma
posição numa ordem, e a ordem precisa de um lugar. `chao.ts` diz qual é
(marcadores > pele > linhas e areia), e os três módulos importam de lá. Marcador
é decalque: se ele perde, o jogo fica injogável na hora, então vem antes de
qualquer decoração.

**E o z-fighting voltou pela distância.** Com o piso a 1 mm, a laje azul aparecia
de perto e sumia de longe — não é posição, é a precisão do z-buffer, que cai com
a distância. Subir a geometria resolveria a briga e criaria outra (o chão da
física é `y = 0`, então levantar o desenho afunda a bola nele ao quicar).
`polygonOffset` nos materiais do modelo empurra tudo na direção da câmera só no
teste de profundidade, sem mover um milímetro, e a ordem interna do modelo não
muda porque o empurrão é o mesmo pra todas as peças.

**O encaixe tem teste, e o carregador não pode ter.** `buildQuadraModelo.ts`
importa o `.glb` por `?url`, que o Vite resolve e o Node não — um `import` desses
no topo fecha a porta do teste pro arquivo inteiro (`ERR_UNKNOWN_FILE_EXTENSION`).
Por isso a geometria pura mora em `encaixarQuadra.ts`, sem asset nenhum, e é ela
que os quatro testes cobrem.

**O `.glb` mora em `src/assets/`, não em `public/`.** Em `public/` o arquivo não
passa pelo pipeline do Vite — e o build de arquivo único depende exatamente disso
pra embutir o modelo em base64. Precisou de `assetsInclude: ['**/*.glb']` no
`vite.config.ts` (o Vite não reconhece `.glb` sozinho) e de uma declaração de
módulo pro TypeScript aceitar `import ... from '*.glb?url'`.

**Bug de borda que apareceu junto:** `scripts/build-single.mjs` escrevia em
`dist/` sem criar o diretório. Num clone novo, rodar `build:single` antes de
`build` morria num ENOENT no fim de tudo, depois do build inteiro. Um `mkdir`.

**Do modelo sai só o que COMPETE com o jogo.** `ENFEITES_FORA` tem um nome: a
bola de enfeite. Duas bolas em campo, uma parada na areia, não é decoração — é o
jogador procurando qual das duas está em jogo. Os cones, os bancos e a laje
ficam, porque não disputam leitura com nada.

**O que fica pendente no cenário QUADRA**, e é de propósito: os bancos ficam
dentro da zona livre e os atletas atravessam eles; as linhas de ataque do indoor
aparecem e o vôlei de praia não as tem; e a laje está enterrada. As três são
decisões de arte, pra quando o modo tiver dono.

## Enquadrar é mexer em ONDE a câmera olha, não em onde ela está

A quadra ficava alta no quadro (centro a 43% da altura no ombro, 32% na tática)
com um terço de areia vazia embaixo. O que conserta isso não é mover a câmera —
é subir o ponto que ela MIRA, o que a inclina para cima e faz a imagem descer.

`CAMERA.jogoPerto.mira` e `jogoLonge.mira` são valores diferentes de propósito, e
a diferença não é gosto: a conta é `metros = giro × distância até o ponto
mirado`, e essa distância é ~7 m no ombro contra ~15,8 m na tática. O mesmo
centímetro de mira vale o dobro lá, então 1,57 contra 4,2. Um número só deixaria
um dos dois errado, e foi exatamente o que acontecia com o `1.2` que estava
cravado no `calcularFoco`.

Medido em três proporções de tela: 48,6% e 48,5%. **O número não muda com a
largura da janela** — a lente do `PerspectiveCamera` é vertical, então mudar a
largura não mexe no enquadramento vertical. Se uma medida de enquadramento variar
com a largura, o erro está na medição, não na câmera.

## Projetar com a matriz velha mede outro quadro

`camera.lookAt()` mexe no quaternion e **não** em `matrixWorld`. `Vector3.project`
usa `matrixWorldInverse`, que só é recalculada em `updateMatrixWorld`. Medir logo
depois de um `rig.encaixar()` — sem render entre os dois — projeta com a matriz
do quadro anterior.

Isso custou uma conclusão inteira aqui: a primeira medição disse que a tática
punha a quadra a 70% da altura, a captura de tela mostrava 40%, e eu quase fui
"consertar" na direção errada. A regra: **`cam.updateMatrixWorld(true)` antes de
qualquer `project` em teste**, ou medir depois de um quadro renderizado.

## O painel de teclas seguiu a câmera

A legenda morava de pé na lateral esquerda, com a justificativa — escrita no
próprio CSS — de que ali ficava a maior área de areia vazia que a câmera
enquadrava. Isso era verdade para a câmera antiga, alta e distante. Com a câmera
de ombro a quadra passou a ocupar o meio do quadro e a ser larga, e a
justificativa morreu sem que o código soubesse.

Virou faixa deitada no rodapé: 46 px em 1366×683 (6,8% da altura), duas linhas,
rótulo de grupo alinhado à esquerda. Detalhes que custaram uma iteração cada:
`width: max-content` com `max-width`, senão o flex escolhe uma largura de
encolhimento qualquer e quebra em quatro linhas com meia tela sobrando ao lado; e
`white-space: nowrap` no rótulo, senão "EM QUADRA" quebra em duas e desalinha a
própria linha.

## A página é um jogo: nada aqui é texto para copiar

O `SHIFT` tinha dois donos. No jogo ele é a câmera lenta; no navegador ele
estende seleção de texto. Segurar SHIFT e clicar pintava o HUD inteiro de azul —
placar, aviso do ponto, a faixa de teclas — e a partir dali o teclado estava
dividido entre uma partida e um bloco de texto selecionado.

`user-select: none` no `html, body` resolve a classe toda, e não custa nada:
seleção numa página de jogo não serve para nada e cobra um atalho. Os controles
do menu continuam funcionando (seleção é uma coisa, interação é outra) — isso foi
conferido, porque é o risco óbvio da mudança.

## Evento de soltar não chega, e o estado fica preso

É a mesma família de defeito, duas vezes:

- **`keyup` engolido.** Basta o atalho pertencer ao navegador ou ao sistema. O
  jogo viu o keydown, nunca vê o keyup, e segue achando que o dedo está lá — com
  o SHIFT isso é câmera lenta que não desliga.
- **`mouseup` fora da janela.** Soltar sobre a barra de abas ou sobre a moldura
  do navegador não manda evento nenhum para a página, e o ataque fica carregando
  para sempre. O `blur` não cobre: soltar sobre a moldura não tira o foco.

A cura é a mesma nos dois: **todo evento carrega a verdade do momento**.
`KeyboardEvent.shiftKey/ctrlKey/altKey` e `MouseEvent.buttons` dizem o que está
pressionado *agora*, então reconciliar a cada evento faz a próxima tecla ou o
próximo movimento de mouse consertar o estado — sem precisar adivinhar qual
atalho comeu o evento.

Uma armadilha dentro da cura: os bits de `MouseEvent.buttons` **não** seguem a
numeração de `MouseEvent.button`. Primário é bit 1, secundário é 2, do meio é 4;
`button` numera 0, 2 e 1. Trocar os dois faz o botão direito "soltar" o esquerdo.

## O `SHIFT + botão direito` do Firefox não tem como ser bloqueado

O botão direito é uma ação do jogo (levantar), e o `contextmenu` é bloqueado —
agora na **janela**, em captura, e não só no canvas: a faixa de teclas e o placar
também são alvos válidos.

Mas o Firefox trata `SHIFT + botão direito` como **escotilha do usuário** e
ignora o `preventDefault` da página de propósito. Não há API para desligar isso,
e não deveria haver. O problema aqui é que o SHIFT é a câmera lenta: a combinação
acontece sozinha no meio de um lance, sem o jogador pedir nada.

A saída não foi lutar com o navegador, foi **dar um segundo caminho**: `R`
também levanta. Nada foi removido, e a combinação que o Firefox sequestra deixou
de ser a única forma de fazer aquela jogada.

## Trocar o `map` de um material exige `needsUpdate`

O chão troca entre areia e piso claro (`praia.usarPisoClaro`). Duas coisas que
custam um sintoma cada:

- **A cor da areia está na TEXTURA, não no `color`.** Tintar de branco por cima
  do mapa devolve areia lavada, não um piso claro. O mapa tem que sair para a
  cor do material valer.
- **Tirar ou pôr um mapa muda o PROGRAMA do shader.** Sem `material.needsUpdate
  = true` o three reaproveita o programa anterior e a troca simplesmente não
  aparece — nada quebra, nada avisa, o chão só não muda.

O relevo (`normalMap`) fica, com força reduzida: sem ele a laje de 400 m vira um
plano sem nenhuma informação de superfície e o olho perde a referência de onde o
chão está.

E o branco não é `0xffffff`: puro, sob sol mais luz de céu, estoura e leva
junto a sombra dos atletas — justamente o que diz ao olho onde o plano está.

## O que NÃO foi verificado

O equilíbrio da IA contra um humano de verdade. O que se mediu foi um piloto
automático dos dois lados — e ele é mais preciso que qualquer pessoa: não tem
tempo de reação e prevê a queda perfeitamente. Os números provam que o laço da
partida **funciona**, não que a dificuldade está calibrada. Isso só se sente
jogando.
