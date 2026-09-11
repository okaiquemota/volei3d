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

Dois cuidados que não são óbvios:

- O arrasto exige **botão segurado**. Sem pointer lock, o cursor tem uma posição
  na tela que importa (é por ela que a mira do jogo se resolve), e uma câmera que
  gira com o cursor solto giraria também quando a mão só atravessa a tela.
- `wheel` chega em unidades diferentes por navegador (`deltaMode` 0 = pixels,
  1 = linhas, 2 = páginas). Sem converter, o mesmo gesto zooma 16× menos no
  Firefox. E contar `Math.sign` por evento trata igual o clique seco de um mouse
  e o deslize contínuo de um trackpad — o trackpad dispara dezenas de eventos por
  segundo e atravessaria a faixa inteira num gesto.

A suavização também muda de constante: as outras câmeras amaciam o movimento de
OUTRA coisa (o atleta, a bola), e 7 é o que impede o tranco. Esta amacia a mão do
jogador, e o mesmo 7 vira atraso — a câmera chega um terço de segundo depois do
mouse e o arrasto parece solto.

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

## O que NÃO foi verificado

O equilíbrio da IA contra um humano de verdade. O que se mediu foi um piloto
automático dos dois lados — e ele é mais preciso que qualquer pessoa: não tem
tempo de reação e prevê a queda perfeitamente. Os números provam que o laço da
partida **funciona**, não que a dificuldade está calibrada. Isso só se sente
jogando.
