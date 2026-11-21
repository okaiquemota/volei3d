# Ficha da loja (Google Play)

O texto que vai no Play Console, e o que ainda falta fazer lá. As imagens desta
pasta saem de `scripts/gerar-icones.mjs`.

## Imagens

| Campo do Console | Arquivo |
|---|---|
| Ícone do app (512×512) | `icone-512.png` |
| Gráfico de recursos (1024×500) | `destaque-1024x500.png` |
| Capturas de tela do celular (2 a 8) | **faltam** — tirar do celular, com o jogo rodando |

As capturas precisam ser do app de verdade. As do navegador de teste daqui saem
sem antialiasing (ver "No harness não há antialiasing" no CLAUDE.md) e ficam piores
que o jogo.

## Nome

Volei 3D

## Descrição curta (até 80 caracteres)

Vôlei de praia 3D: circuito, 29 adversários, cortada, mergulho e câmera lenta.

## Descrição completa

Vôlei de praia em 3D, um contra um, direto no celular — sem internet, sem
anúncio e sem cadastro.

CIRCUITO: três etapas em escada, municipal, estadual e mundial. Ganhe a taça
para abrir a próxima e suba no ranking.

29 ADVERSÁRIOS, cada um com oito notas que mudam o jeito de jogar: tem quem
corre mais, quem pula mais, quem saca forte e quem não erra passe.

O TOQUE TEM TEMPO: a barra de TOQUE mostra a hora certa de bater, e a de FORÇA
tem uma zona perto do fim — solte ali e a cortada sai forte e reta.

MERGULHO para salvar a bola que os pés não alcançam, e CÂMERA LENTA para ler a
jogada no momento decisivo.

MEU JOGADOR: monte o seu atleta com cabeça, tronco, pernas, pés e cores.

Três cenários: a praia com várias quadras, o ginásio e o estádio com torcida.

Controles de toque: joystick para correr, toque na quadra para mirar e segure
para carregar o ataque.

Créditos: cenário QUADRA "Volleyball court" de Konstantin e cenário ESTÁDIO
"Low Poly Football Stadium" de ismeteren07, ambos sob CC BY 4.0. Personagens
de Quaternius (CC0). Fontes Barlow sob SIL Open Font License.

## Categoria e classificação

- Categoria: Jogos › Esportes
- Classificação indicativa (questionário IARC): sem violência, sem conteúdo
  sexual, sem compras, sem interação entre usuários — deve sair **Livre**.
- Anúncios: **não contém**.

## Segurança dos dados

Tudo **não**: o app não coleta e não compartilha dado nenhum. O que ele guarda
(ajustes, progresso, aparência do jogador) fica no armazenamento local e nunca
sai do aparelho. A política diz o mesmo:

- URL da política de privacidade: `https://okaiquemota.github.io/volei3d/privacidade.html`
  (vale depois que o GitHub Pages publicar esta versão — ver abaixo).

Se um dia entrar placar online, anúncio ou analytics, a política
(`public/privacidade.html`) e este formulário mudam juntos.

## Antes de enviar

1. **Personagens que são gente de verdade.** STEFANY HALLAL, KAIQUE MOTA,
   SUNLESS e KHASTWAY vieram pela Ficha da Galera, para um projeto pessoal.
   Numa loja pública, peça o ok de cada um. **ROSAMARIA** é também o nome de uma
   jogadora olímpica de vôlei — trocar o nome evita a política de falsificação
   de identidade.
2. **`appId`** (`io.github.okaiquemota.volei3d`, em `capacitor.config.ts`) não
   muda depois do primeiro envio. Se quiser outro, troque antes.
3. **GitHub Pages.** O workflow `pages.yml` publica a partir da branch padrão
   (`claude/friendly-einstein-m5n1tm`). A política só existe na URL acima depois
   que este trabalho for mesclado nela.
4. **Conta pessoal nova**: teste fechado com 12 testadores por 14 dias seguidos
   antes de liberar a produção.

## Gerar o pacote (.aab)

Precisa do Android Studio (traz o SDK e o Java):

```
npm run build:android      # build web sem sourcemap + cap sync
npx cap open android       # abre o projeto no Android Studio
```

No Android Studio: **Build › Generate Signed App Bundle**, crie a chave de
upload (guarde o `.jks` e a senha fora do repositório — perder a chave trava as
atualizações) e envie o `.aab` gerado no Play Console. A cada versão nova, suba
`versionCode` (e `versionName`) em `android/app/build.gradle`.
