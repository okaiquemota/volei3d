import * as THREE from 'three';
import { AMBIENTE } from '../config';

/**
 * Ceu, sol e mar — a "cara" do jogo.
 *
 * A licao vem do rpk.fps e vale ainda mais aqui: o CEU e' o que decide a
 * leitura. Ele ocupa a faixa toda acima da rede, e uma cor chapada ali faz a
 * quadra parecer um recorte, por melhor que esteja a areia. Antes era um
 * `scene.background` de uma cor so'; agora e' um domo com gradiente, bruma
 * quente no horizonte e o disco do sol.
 *
 * E o segundo problema era de identidade: um jogo de volei de PRAIA sem praia
 * nenhuma. Areia ate' o horizonte le' como deserto. O mar resolve isso com um
 * plano e uma faixa de areia molhada.
 *
 * DIRECAO_DO_SOL e' a unica fonte da direcao: a luz direcional, o disco no ceu
 * e o brilho na agua leem daqui. Separados, o ceu mostra o sol num canto
 * enquanto a sombra cai pro outro — ninguem estranha de imediato, so' fica com
 * cara de cenario falso.
 */

const elevacao = THREE.MathUtils.degToRad(AMBIENTE.elevacaoDoSol);
const azimute = THREE.MathUtils.degToRad(AMBIENTE.azimuteDoSol);

export const DIRECAO_DO_SOL = new THREE.Vector3(
  Math.cos(elevacao) * Math.sin(azimute),
  Math.sin(elevacao),
  Math.cos(elevacao) * Math.cos(azimute),
).normalize();

export interface Descartavel { dispose(): void }

/**
 * O domo do ceu.
 *
 * Esfera pelo lado de dentro, sem luz e sem nevoa: e' fundo, nao geometria.
 * O gradiente vai do azul no zenite a' bruma quente no horizonte, e a MESMA cor
 * da bruma alimenta a nevoa da cena — destoando, a linha do horizonte recorta
 * como adesivo.
 */
export function construirCeu(): { mesh: THREE.Mesh; descartaveis: Descartavel[] } {
  const geometria = new THREE.SphereGeometry(900, 32, 20);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      corDoZenite: { value: new THREE.Color(AMBIENTE.zenite) },
      corDoHorizonte: { value: new THREE.Color(AMBIENTE.horizonte) },
      corDoSol: { value: new THREE.Color(AMBIENTE.discoDoSol) },
      direcaoDoSol: { value: DIRECAO_DO_SOL },
      /**
       * Compensacao do tone mapping.
       *
       * O ACES comprime e DESSATURA as altas luzes — otimo pro sol na areia,
       * pessimo pro ceu, que saiu cinza-claro em vez de azul. As cores aqui
       * sao autoradas pra depois do ACES, entao precisam entrar acima de 1
       * pra sobreviver a ele.
       */
      ganho: { value: 1.5 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirecao;
      void main() {
        vDirecao = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 corDoZenite;
      uniform vec3 corDoHorizonte;
      uniform vec3 corDoSol;
      uniform vec3 direcaoDoSol;
      uniform float ganho;
      varying vec3 vDirecao;

      void main() {
        vec3 dir = normalize(vDirecao);

        /**
         * Bruma no HORIZONTE, azul no zenite.
         *
         * A primeira versao usava dir.y * 0.5 + 0.5, que poe o horizonte em
         * 0.5 — ou seja, ja' comecava 75% azul na linha do mar e o gradiente
         * inteiro acontecia acima da cabeca, onde ninguem olha. Com o clamp
         * de dir.y a faixa quente fica onde ela existe de verdade.
         *
         * (Sem crase nos comentarios daqui: isto vive dentro de um template
         * literal, e uma crase fecha o shader inteiro.)
         */
        // Expoente baixo = a bruma fica presa numa faixa estreita no horizonte
        // em vez de lavar metade do ceu.
        float altura = pow(clamp(dir.y, 0.0, 1.0), 0.32);
        vec3 cor = mix(corDoHorizonte, corDoZenite, altura) * ganho;

        float cosSol = max(dot(dir, direcaoDoSol), 0.0);

        /**
         * Tres camadas de sol, e os EXPOENTES sao o que decide tudo.
         *
         * A primeira versao usava expoente 6 no halo. Parece detalhe, mas
         * cos^6 so' cai pra metade a 24 graus do sol e ainda vale 10% a 45: o
         * halo cobria metade do ceu visivel e lavava o azul inteiro. O ceu
         * saia cinza e a culpa parecia ser do tone mapping.
         *
         * Disco apertado, brilho curto em volta, e uma bruma larga fraquissima
         * — que e' o que o ar de verdade faz.
         */
        cor += corDoSol * pow(cosSol, 1400.0) * 1.6;
        cor += corDoSol * pow(cosSol, 90.0) * 0.35;
        cor += corDoSol * pow(cosSol, 4.0) * 0.05;

        gl_FragColor = vec4(cor, 1.0);

        // Obrigatorios num ShaderMaterial cru, senao a cor sai escura demais.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geometria, material);
  // O ceu nunca e' ocluido nem oclui: desenha primeiro e some do resto.
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  return { mesh, descartaveis: [geometria, material] };
}

/**
 * O mar, alem da linha de fundo adversaria.
 *
 * Fica so' de um lado, e nao em volta: praia tem orla, nao ilha. E fica do
 * lado PARA ONDE A CAMERA OLHA — e' a metade de cima do quadro, entao e' onde
 * uma faixa de agua muda a leitura inteira.
 *
 * Sem reflexo e sem refracao: e' um plano com gradiente, ondas em seno e o
 * caminho de brilho do sol. Custa um desenho.
 */
export function construirMar(): { grupo: THREE.Group; material: THREE.ShaderMaterial; descartaveis: Descartavel[] } {
  const grupo = new THREE.Group();
  const descartaveis: Descartavel[] = [];

  const geometria = new THREE.PlaneGeometry(1200, 1200, 1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tempo: { value: 0 },
      corRasa: { value: new THREE.Color(AMBIENTE.marRaso) },
      corFunda: { value: new THREE.Color(AMBIENTE.marFundo) },
      corDaBruma: { value: new THREE.Color(AMBIENTE.horizonte) },
      direcaoDoSol: { value: DIRECAO_DO_SOL },
      zDaOrla: { value: AMBIENTE.zDaOrla },
    },
    vertexShader: /* glsl */ `
      varying vec3 vMundo;
      void main() {
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vMundo = mundo.xyz;
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float tempo;
      uniform vec3 corRasa;
      uniform vec3 corFunda;
      uniform vec3 corDaBruma;
      uniform vec3 direcaoDoSol;
      uniform float zDaOrla;
      varying vec3 vMundo;

      void main() {
        float distanciaDaOrla = max(vMundo.z - zDaOrla, 0.0);

        // Raso perto da areia, fundo longe. O expoente segura a transicao na
        // primeira dezena de metros, que e' onde o olho procura a arrebentacao.
        float profundidade = clamp(pow(distanciaDaOrla / 26.0, 0.7), 0.0, 1.0);
        vec3 cor = mix(corRasa, corFunda, profundidade);

        /**
         * O detalhe morre com a distancia, e isso NAO e' estetica.
         *
         * Um plano de agua visto quase de lado comprime metros em pixels: a
         * senoide das ondas vira listra dura, e o quadro inteiro cintila.
         * Apagar o detalhe alem de umas dezenas de metros e' o que troca a
         * listra por uma superficie lisa que some na bruma — que e' o que o
         * olho espera de mar distante.
         */
        float detalhe = 1.0 - clamp((distanciaDaOrla - 10.0) / 45.0, 0.0, 1.0);

        // Ondas: duas senoides de periodos diferentes pra nao virar listra.
        float onda = sin(vMundo.z * 0.55 - tempo * 1.6) * 0.5
                   + sin(vMundo.z * 0.21 + vMundo.x * 0.06 - tempo * 0.9) * 0.5;
        cor += vec3(0.035, 0.05, 0.05) * onda * detalhe;

        // Espuma na arrebentacao: uma faixa estreita colada na orla.
        float espuma = smoothstep(6.0, 0.0, distanciaDaOrla) * (0.55 + 0.45 * onda);
        cor = mix(cor, vec3(0.94, 0.96, 0.95), clamp(espuma, 0.0, 1.0) * 0.8);

        /**
         * Caminho de brilho do sol.
         *
         * Nao e' reflexo de verdade: e' uma faixa clara ao longo do eixo do sol,
         * picotada pelas ondas. De longe o olho aceita, e custa tres linhas em
         * vez de um render target.
         */
        float eixoDoSol = 1.0 - clamp(abs(vMundo.x - direcaoDoSol.x * vMundo.z * 2.0) / 26.0, 0.0, 1.0);
        float cintilar = pow(max(onda, 0.0), 2.0) * eixoDoSol * profundidade * detalhe;
        cor += vec3(1.0, 0.94, 0.82) * cintilar * 0.6;

        // O fim do mar dissolve na MESMA bruma do ceu; se destoar, aparece a
        // borda do plano cortando o horizonte.
        float bruma = clamp((distanciaDaOrla - 20.0) / 80.0, 0.0, 1.0);
        cor = mix(cor, corDaBruma, bruma);

        gl_FragColor = vec4(cor, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  descartaveis.push(geometria, material);

  const agua = new THREE.Mesh(geometria, material);
  agua.rotation.x = -Math.PI / 2;
  // Um dedo abaixo da areia: a praia entra na agua, nao encosta nela.
  agua.position.set(0, -0.06, AMBIENTE.zDaOrla + 600);
  agua.frustumCulled = false;
  grupo.add(agua);

  /**
   * Areia molhada na orla.
   *
   * E' o que faz a praia encontrar o mar em vez de os dois se encostarem. Sem
   * essa faixa, a linha de agua fica reta e dura como um corte de tesoura.
   */
  const geoMolhada = new THREE.PlaneGeometry(1200, 14, 1, 1);
  const matMolhada = new THREE.MeshStandardMaterial({
    color: AMBIENTE.areiaMolhada,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.75,
  });
  descartaveis.push(geoMolhada, matMolhada);

  const molhada = new THREE.Mesh(geoMolhada, matMolhada);
  molhada.rotation.x = -Math.PI / 2;
  molhada.position.set(0, 0.012, AMBIENTE.zDaOrla - 6);
  molhada.receiveShadow = true;
  grupo.add(molhada);

  return { grupo, material, descartaveis };
}
