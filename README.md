# VÔLEI 3D

Vôlei de praia em 3D, uma quadra, 15 pontos. Feito em **TypeScript + Three.js**,
sem framework de jogo e sem engine de física — tudo escrito à mão.

Abre e joga: não tem instalador, não tem plugin, não tem barra de carregamento.

### ▶ [Jogar agora](https://okaiquemota.github.io/volei3d/)

> Este jogo já foi um protótipo em Unity. A versão Unity está preservada em
> [RIP.volei3d-unity](https://github.com/okaiquemota/RIP.volei3d-unity) — ela
> funcionava, mas cada build levava de 20 a 30 minutos num runner de CI, exigia
> licença Unity e entregava dezenas de MB com tela de carregamento. Esta versão
> compila em **um segundo** e entrega **130 KB comprimidos**.

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
| Tocar na bola | Clique esquerdo ou `E` |
| Forçar ataque por cima da rede | Segurar clique direito ou `Shift` |
| Sacar | Clique esquerdo ou `E`, quando for seu saque |
| Reiniciar | `R`, na tela de fim de jogo |
| Pausar / desempenho | `Esc` / `F3` |

**Não existe tecla de manchete nem de cortada.** A ação sai do contexto: a
altura da bola em relação a você, e se você está no ar. Bola baixa vira
manchete, na altura da cabeça vira levantamento, alta com você no ar vira
cortada.

Os dois primeiros toques do seu lado armam a jogada no seu próprio campo; o
terceiro cruza a rede automaticamente — ou antes, se você segurar o botão de
ataque.

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

**Adversário.** Reage e devolve, e nada mais. Prevê onde a bola vai cair, corre
até lá com um erro, e devolve mirando um ponto aleatório. Usa exatamente a mesma
física de toque que você: erra por ter erro, não por ter regra própria.

---

## Arquitetura

```
src/
  config.ts             todos os números de tuning num lugar só, com o porquê
  main.ts               bootstrap: renderer e Game, nessa ordem
  core/
    Game.ts             laço principal; conecta todos os sistemas
    Input.ts            teclado e mouse (sem pointer lock — a mira é no chão)
    CameraRig.ts        câmera em 3ª pessoa, presa à quadra e não ao corpo
    ballistics.ts       solvers de arco e previsão de queda — lógica pura
    gpu.ts              detecta renderização por software e adapta
    math.ts             clamp, lerp, damp, AABB, aleatórios
  world/
    Court.ts            a única fonte de verdade sobre geometria de jogo
    buildCourt.ts       areia, linhas, rede, postes — e os colisores junto
    Physics.ts          o integrador da bola e as colisões
    textures.ts         areia, rede e bola desenhadas em canvas 2D
  ball/Ball.ts          estado, eventos e previsão de queda
  players/
    Athlete.ts          base comum do humano e da IA
    Motor.ts            corrida e pulo (cinemático: não empurra a bola)
    Hitter.ts           manchete, levantamento, cortada e saque
    Human.ts            lê o input, mira no chão
    AI.ts               prevê, persegue, devolve
    buildAthlete.ts     o corpo low-poly
  match/Match.ts        placar, saque, toques, fim de jogo — lógica pura
  ui/
    HUD.ts              placar, saque e avisos, em DOM
    Screens.ts          menu, pausa, fim de jogo, opções
    PerfMeter.ts        o painel do F3
    style.css
tests/                  balística e regras da partida
```

`ballistics`, `Match`, `Court` e `Hitter` **não importam Three.js**. É por isso
que existem testes: essa parte roda no Node.

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
  em nenhuma linha de bola, jogador ou IA — é o que vai permitir várias quadras
  espalhadas por um mundo aberto.
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
- Várias quadras numa praia — a arquitetura já está pronta para isso.
- Placas de patrocínio nas âncoras que a quadra já cria.
