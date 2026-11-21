import type { CapacitorConfig } from '@capacitor/cli';

/**
 * O app Android (Play Store) e' a mesma pagina, servida de dentro do APK.
 *
 * Por isso Capacitor e nao TWA: o jogo nao usa nada de fora (ver CLAUDE.md,
 * "Nenhum asset externo"), entao vai inteiro no pacote, funciona sem internet,
 * e nao precisa do `assetlinks.json` na raiz de um dominio — que o GitHub
 * Pages de projeto nao deixa publicar.
 *
 * `appId` e' PERMANENTE na Play Store: depois do primeiro envio ele nao muda
 * nunca mais. Troque antes de subir a primeira versao, se quiser outro.
 */
const config: CapacitorConfig = {
  appId: 'io.github.okaiquemota.volei3d',
  appName: 'Volei 3D',
  webDir: 'dist-android',
  android: {
    // O jogo nao abre nada de fora; sem isto um link perdido abriria dentro
    // do WebView em vez do navegador.
    allowMixedContent: false,
    // Fundo enquanto a pagina carrega: o mesmo escuro do menu, sem flash branco.
    backgroundColor: '#0b0d16',
  },
};

export default config;
