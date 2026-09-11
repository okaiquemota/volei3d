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
- HUD: markup em `index.html`, setters em `ui/HUD.ts`, estilo em `ui/style.css`.

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

## A cara do jogo: céu, sol, mar e areia

A ordem de impacto é a mesma que o rpk.fps documenta, e por aqui ela se
confirmou inteira.

**O céu decide a leitura.** Ele ocupa a faixa toda acima da rede; uma cor
chapada ali faz a quadra parecer um recorte, por melhor que esteja a areia.
Hoje é um domo com gradiente, bruma quente no horizonte e o disco do sol.

**`DIRECAO_DO_SOL` é a única fonte da direção.** A luz direcional, o disco no
céu e o caminho de brilho na água leem dali. Separados, o céu mostra o sol num
canto enquanto a sombra cai pro outro — ninguém estranha de imediato, só fica
com cara de cenário falso.

**Sol baixo (26°).** Sombra longa é o que faz um lugar parecer um lugar. O
frustum da sombra precisa da sobra que isso exige: a 26° a sombra de um atleta
de 1,86 m tem quase 4 metros, e sombra cortada lê pior que sombra nenhuma.

### Três erros de céu que não dão aviso nenhum

1. **O expoente do halo do sol.** Estava em 6. `cos^6` só cai pra metade a 24°
   do sol e ainda vale 10% a 45°: o halo cobria metade do céu visível e lavava
   o azul inteiro. O céu saía cinza e a culpa parecia ser do tone mapping. Hoje
   são três camadas — disco (1400), brilho curto (90) e bruma larga fraquíssima
   (4).
2. **O `far` da câmera cortava o domo.** O céu está a 900 m e o `far` era 400:
   o domo inteiro caía fora do frustum e simplesmente não desenhava. O que
   aparecia no topo do quadro era o mar, não o céu.
3. **A areia cobria o mar.** A laje era um quadrado de 400 m centrado na origem
   e passava por cima da água inteira. O mar existia, estava na cena, e não
   aparecia em quadro nenhum. Hoje a areia termina em `AMBIENTE.zDaOrla`.

**Cor autorada depois do ACES.** O tone mapping comprime e *dessatura* as altas
luzes. As cores do céu entram multiplicadas por `ganho` (1,5) justamente para
sobreviver a ele — mexer numa sem a outra muda o céu inteiro.

### Areia: duas frequências, e duas ESCALAS

O grão (alta frequência) vira relevo; a ondulação larga fica só na cor. Se a
mancha entrasse no mapa de normal, cada marca viraria um calombo de meio metro.

Mas há um segundo eixo, que é só daqui: o grão repete a cada **2 m**, e mancha
grande na mesma textura repetiria junto — e mancha repetida é o que mais
denuncia um tile. A saída foi amostrar o **mesmo** mapa uma segunda vez, numa
escala 28× maior, no `onBeforeCompile` do material da areia. Custa zero textura
nova. A mistura fica em 0,45: acima disso a mancha vira nódoa e chama mais
atenção que a quadra.

### O atleta

Não tem modelo nem esqueleto, e continua low-poly — mas tem **pernas**, e é
isso que faz a silhueta ler como pessoa. Ombro (0,235) mais largo que o tronco
(0,155 de raio) de propósito: sem o vão entre braço e tronco os dois viram uma
massa só.

Ombro e quadril são **pivôs**, e a animação gira os pivôs. Com o mesh centrado
no pivô, girar faria o membro atravessar o tronco.

A fase da passada anda com a **velocidade do motor**, não com o relógio — bater
no limite da área para o atleta, e a perna tem que parar junto em vez de pedalar
contra a parede invisível.

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

## O que NÃO foi verificado

O equilíbrio da IA contra um humano de verdade. O que se mediu foi um piloto
automático dos dois lados — e ele é mais preciso que qualquer pessoa: não tem
tempo de reação e prevê a queda perfeitamente. Os números provam que o laço da
partida **funciona**, não que a dificuldade está calibrada. Isso só se sente
jogando.
