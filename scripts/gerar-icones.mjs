/**
 * Ícone, splash e as imagens da loja, desenhados aqui e nao em editor nenhum.
 *
 *   npm install --no-save playwright   (se nao estiver instalado)
 *   node scripts/gerar-icones.mjs
 *
 * Mesma regra do jogo: nenhum asset de fora. Tudo e' SVG com as cores do
 * `style.css` (o degrade `--sol`, o escuro `--escuro`) e o desenho da bola do
 * `index.html` (`#i-bola`), fotografado pelo Chromium nas medidas que o
 * Android e a Play Store pedem.
 *
 * Escreve em:
 *   android/app/src/main/res/mipmap-*      icone (adaptativo e o antigo)
 *   android/app/src/main/res/drawable*     splash
 *   loja/                                  icone 512 e imagem de destaque
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(raiz, 'android/app/src/main/res');
const loja = join(raiz, 'loja');

const fonte = (arquivo) =>
  readFileSync(join(raiz, 'node_modules/@fontsource/barlow-condensed/files', arquivo)).toString('base64');
const FONTES = `
  @font-face { font-family: T; font-weight: 900; font-style: italic;
    src: url(data:font/woff2;base64,${fonte('barlow-condensed-latin-900-italic.woff2')}) format('woff2'); }
  @font-face { font-family: T; font-weight: 700; font-style: normal;
    src: url(data:font/woff2;base64,${fonte('barlow-condensed-latin-700-normal.woff2')}) format('woff2'); }
`;

/** O degrade `--sol` do style.css. */
const SOL = `<linearGradient id="sol" x1="0" y1="0.4" x2="1" y2="0.6">
  <stop offset="0" stop-color="#ff2e88"/><stop offset="0.5" stop-color="#ff5a4e"/><stop offset="1" stop-color="#ff9e1f"/>
</linearGradient>`;

/**
 * Uma bola de volei desenhada pra ser ICONE: o "Y" das costuras e uma faixa
 * paralela em cada gomo, girados de 120 graus e cortados pelo contorno.
 *
 * Nao e' o `#i-bola` do menu. Aquele e' traco fino pra 24 px de texto; ampliado,
 * as pontas das costuras escapam do contorno e a bola le' como uma letra.
 */
let idDaBola = 0;
function bola(lado, escala) {
  const k = (lado * escala) / 24;
  const d = (lado - 24 * k) / 2;
  const id = `corte${idDaBola++}`;
  // A costura que sai do centro e a paralela a ela, no gomo vizinho. As tres
  // copias giradas formam o "Y" com as faixas — o desenho classico da bola.
  const gomo = 'M12 12C12.4 8 11 4.6 8.4 2.7M13.2 2.1C16.2 5.4 16.4 9.6 14.2 13.2';
  const costuras = [0, 120, 240]
    .map((a) => `<path d="${gomo}" transform="rotate(${a} 12 12)"/>`).join('');
  return `<g transform="translate(${d} ${d}) scale(${k})">
    <clipPath id="${id}"><circle cx="12" cy="12" r="10"/></clipPath>
    <circle cx="12" cy="12" r="10" fill="#fff"/>
    <g clip-path="url(#${id})" fill="none" stroke="#ff4d63" stroke-width="1.1" stroke-linecap="round">${costuras}</g>
    <circle cx="12" cy="12" r="10" fill="none" stroke="#ff4d63" stroke-width="1.3"/>
  </g>`;
}

const svg = (w, h, corpo, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${SOL}${defs}</defs>${corpo}</svg>`;

// --- os desenhos -----------------------------------------------------------

/** Icone quadrado inteiro (loja e o icone antigo, pre-Android 8). */
const icone = (l) => svg(l, l, `<rect width="${l}" height="${l}" fill="url(#sol)"/>${bola(l, 0.72)}`);
const iconeRedondo = (l) => svg(l, l, `<circle cx="${l / 2}" cy="${l / 2}" r="${l / 2}" fill="url(#sol)"/>${bola(l, 0.68)}`);

/**
 * Adaptativo: frente e fundo separados. O sistema corta com a mascara dele, e
 * so' o miolo de 66/108 e' garantido — a bola fica dentro dele.
 */
const frente = (l) => svg(l, l, bola(l, 0.5));
const fundo = (l) => svg(l, l, `<rect width="${l}" height="${l}" fill="url(#sol)"/>`);

/** Splash: o escuro do menu, a bola e o nome. Serve deitado e em pe'. */
function splash(w, h) {
  const m = Math.min(w, h);
  const b = m * 0.26;
  const cy = h / 2 - m * 0.08;
  return svg(w, h, `
    <rect width="${w}" height="${h}" fill="#0b0d16"/>
    <g transform="translate(${w / 2 - b / 2} ${cy - b / 2})">${bola(b, 1)}</g>
    <text x="${w / 2}" y="${cy + b * 0.5 + m * 0.16}" text-anchor="middle"
      font-family="T" font-weight="900" font-style="italic" font-size="${m * 0.13}" fill="#fff">VOLEI <tspan fill="url(#sol)">3D</tspan></text>`);
}

/** Imagem de destaque da loja: 1024 x 500, nada importante nas bordas. */
const destaque = () => svg(1024, 500, `
  <rect width="1024" height="500" fill="#0b0d16"/>
  <path d="M640 0H1024V500H540Z" fill="url(#sol)"/>
  <g transform="translate(680 110)">${bola(280, 1)}</g>
  <text x="80" y="250" font-family="T" font-weight="900" font-style="italic" font-size="150" fill="#fff">VOLEI <tspan fill="#ff7a1a">3D</tspan></text>
  <text x="86" y="310" font-family="T" font-weight="700" font-size="34" letter-spacing="12" fill="rgba(255,255,255,0.74)">CIRCUITO DE PRAIA</text>`);

// --- fotografar ------------------------------------------------------------

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

async function salvar(caminho, desenho, w, h) {
  mkdirSync(dirname(caminho), { recursive: true });
  await pagina.setViewportSize({ width: w, height: h });
  await pagina.setContent(
    `<!doctype html><style>${FONTES} html,body{margin:0;background:transparent}</style>${desenho}`,
  );
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: caminho, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(caminho.replace(raiz + '/', ''), `${w}x${h}`);
}

// Densidades do Android: icone antigo de 48 dp, adaptativo de 108 dp.
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [nome, k] of Object.entries(DENSIDADES)) {
  const pasta = join(res, `mipmap-${nome}`);
  await salvar(join(pasta, 'ic_launcher.png'), icone(48 * k), 48 * k, 48 * k);
  await salvar(join(pasta, 'ic_launcher_round.png'), iconeRedondo(48 * k), 48 * k, 48 * k);
  await salvar(join(pasta, 'ic_launcher_foreground.png'), frente(108 * k), 108 * k, 108 * k);
  await salvar(join(pasta, 'ic_launcher_background.png'), fundo(108 * k), 108 * k, 108 * k);
}

// O splash mantem as medidas que o Capacitor gerou em cada pasta.
for (const pasta of readdirSync(res).filter((p) => p.startsWith('drawable'))) {
  const arquivo = join(res, pasta, 'splash.png');
  let medida;
  try { medida = readFileSync(arquivo); } catch { continue; }
  // Largura e altura ficam nos bytes 16..23 do cabecalho IHDR do PNG.
  const w = medida.readUInt32BE(16);
  const h = medida.readUInt32BE(20);
  await salvar(arquivo, splash(w, h), w, h);
}

await salvar(join(loja, 'icone-512.png'), icone(512), 512, 512);
await salvar(join(loja, 'destaque-1024x500.png'), destaque(), 1024, 500);

await navegador.close();
