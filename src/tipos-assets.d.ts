/**
 * O Vite resolve `?url` pra uma string, mas o TypeScript nao sabe disso
 * sozinho: sem esta declaracao, importar um `.glb` e' erro de compilacao.
 *
 * `vite/client` tambem declararia isso, mas ele arrasta junto os tipos de
 * `import.meta.env` e de um punhado de sufixos que este projeto nao usa. Uma
 * linha e' mais barata que uma dependencia de tipos inteira.
 */
declare module '*.glb?url' {
  const url: string;
  export default url;
}
