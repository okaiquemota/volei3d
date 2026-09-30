import {
  DEFINICAO, ETAPAS, NOMES_DAS_RODADAS, VOCE_ID, adversarioAtual, podeJogar,
  type Carreira, type Confronto, type Etapa, type Torneio,
} from '../match/Circuito';
import { personagemPorId } from '../match/personagens';
import { chip, el, icone } from './dom';
import { APARENCIA_DE_VOCE, desenharBoneco, desenharFicha } from './TelaElenco';

/**
 * Desenha as telas do circuito a partir do estado. So' desenha: nao decide
 * nada, nao guarda nada, e nao sabe que existe jogo rodando.
 */

/** A carreira em numeros. */
export function desenharCarreira(alvo: HTMLElement, c: Carreira): void {
  const titulos = ETAPAS.reduce((n, e) => n + c.titulos[e], 0);
  const saldo = c.pontosFeitos - c.pontosSofridos;

  const itens: Array<[string, string, boolean]> = [
    ['RANKING', String(c.ranking), true],
    ['TITULOS', String(titulos), false],
    ['VITORIAS', `${c.vitorias}-${c.derrotas}`, false],
    ['MELHOR SEQUENCIA', String(c.melhorSequencia), false],
    // Saldo com sinal: "+34" diz mais que "34" num lugar onde pode ser negativo.
    ['SALDO DE PONTOS', saldo > 0 ? `+${saldo}` : String(saldo), false],
  ];

  alvo.replaceChildren(...itens.map(([rotulo, valor, destaque], i) => {
    const d = el('div', destaque ? 'destaque' : '');
    d.style.setProperty('--i', String(i));
    d.append(el('dt', '', rotulo), el('dd', '', valor));
    return d;
  }));
}

/**
 * As tres etapas, como cartoes de campeonato.
 *
 * Cada uma diz uma de quatro coisas: travada, aberta, em andamento, ou ja'
 * ganha (quantas vezes). E so' um torneio anda por vez: com um em curso, as
 * outras ficam paradas ate' ele acabar — quem entra num torneio joga ele ate'
 * o fim, ou abandona.
 */
export function desenharEtapas(
  alvo: HTMLElement,
  c: Carreira,
  torneio: Torneio | null,
  aoEscolher: (etapa: Etapa) => void,
  aoAbandonar: () => void,
): void {
  const andando = torneio && !torneio.eliminado && !torneio.campeao ? torneio : null;

  alvo.replaceChildren(...ETAPAS.map((etapa, i) => {
    const def = DEFINICAO[etapa];
    const aberta = podeJogar(c, etapa);
    const estaAqui = andando?.etapa === etapa;
    const outraAndando = andando !== null && !estaAqui;

    const cartao = el('article', `etapa ${etapa}`);
    cartao.style.setProperty('--i', String(i));
    if (!aberta || outraAndando) cartao.classList.add('travada');
    if (estaAqui) cartao.classList.add('em-andamento');

    cartao.append(
      el('span', 'etapa-num', String(i + 1).padStart(2, '0')),
      el('span', 'etapa-local', def.onde),
      el('span', 'etapa-nome', def.nome),
      el('span', 'etapa-premio', `+${def.porVitoria} de ranking por vitoria, +${def.porTitulo} pela taca`),
    );
    if (!aberta) cartao.append(icone('cadeado', 'etapa-cadeado'));

    /**
     * O botao que da' o clique ao cartao inteiro. E' ele quem recebe o foco, e
     * o rotulo dele e' o estado — "JOGAR", "CONTINUAR · SEMIFINAL" — que e'
     * exatamente o que o Enter vai fazer.
     */
    const botao = el('button', 'etapa-jogar');
    botao.type = 'button';
    botao.disabled = !aberta || outraAndando;
    if (!aberta) {
      const anterior = ETAPAS[ETAPAS.indexOf(etapa) - 1];
      botao.append(chip(`VENCA O ${DEFINICAO[anterior!].nome}`, 'escuro', 'cadeado'));
    } else if (estaAqui) {
      botao.append(chip(`CONTINUAR · ${NOMES_DAS_RODADAS[andando.rodada]}`, '', 'play'));
    } else if (outraAndando) {
      botao.append(chip('TERMINE O TORNEIO EM ANDAMENTO', 'escuro'));
    } else {
      botao.append(chip('JOGAR', '', 'play'));
    }
    botao.addEventListener('click', () => aoEscolher(etapa));

    const rodape = el('div', 'etapa-rodape');
    rodape.append(botao);
    if (c.titulos[etapa] > 0) {
      const tacas = el('span', 'etapa-tacas');
      tacas.append(icone('trofeu'), `${c.titulos[etapa]}x CAMPEAO`);
      rodape.append(tacas);
    }
    cartao.append(rodape);

    // Fora do botao grande, e por cima dele: abandonar nao e' continuar.
    if (estaAqui) {
      const sair = el('button', 'abandonar', 'ABANDONAR');
      sair.type = 'button';
      sair.addEventListener('click', aoAbandonar);
      cartao.append(sair);
    }

    return cartao;
  }));
}

/** Uma caixa de confronto, com os dois lados e o placar se houver. */
function caixa(c: Confronto | null): HTMLElement {
  const box = el('div', 'confronto');
  if (!c) {
    box.classList.add('vazio');
    box.append(el('div', 'lado', 'A DEFINIR'));
    return box;
  }

  for (const [j, pontos] of [[c.a, c.placar?.[c.vencedor === c.a.id ? 0 : 1]],
                             [c.b, c.placar?.[c.vencedor === c.b.id ? 0 : 1]]] as const) {
    const lado = el('div', 'lado');
    if (j.id === VOCE_ID) lado.classList.add('voce');
    if (c.vencedor) lado.classList.add(c.vencedor === j.id ? 'venceu' : 'perdeu');
    lado.append(el('span', 'n', j.nome), el('span', 'p', pontos === undefined ? '' : String(pontos)));
    box.append(lado);
  }
  return box;
}

/** Um jogo na sua vaga: a caixa centrada numa meia altura do par. */
function vaga(c: Confronto | null): HTMLElement {
  const v = el('div', 'vaga');
  v.append(caixa(c));
  return v;
}

/**
 * A chave e o proximo adversario.
 *
 * Rodada que ainda nao existe aparece como "A DEFINIR", e nao some: a chave
 * inteira na tela desde a estreia e' o que diz quanto falta.
 */
export function desenharChave(
  arvore: HTMLElement,
  proximo: HTMLElement,
  titulo: HTMLElement,
  subtitulo: HTMLElement,
  torneio: Torneio,
  carreira?: Carreira,
): void {
  const def = DEFINICAO[torneio.etapa];
  titulo.textContent = def.nome;

  const tamanhos = [4, 2, 1];
  arvore.replaceChildren(...NOMES_DAS_RODADAS.map((nome, r) => {
    const coluna = el('div', 'rodada');
    if (r === torneio.rodada && !torneio.eliminado && !torneio.campeao) coluna.classList.add('atual');

    // Os jogos em PARES: cada par desenha o colchete que leva os dois
    // vencedores pro jogo da rodada seguinte. A final nao tem par.
    const jogos = el('div', 'jogos');
    const daRodada = torneio.rodadas[r];
    const n = tamanhos[r]!;
    if (n === 1) {
      jogos.append(vaga(daRodada?.[0] ?? null));
    } else {
      for (let i = 0; i < n; i += 2) {
        const par = el('div', 'par');
        par.append(vaga(daRodada?.[i] ?? null), vaga(daRodada?.[i + 1] ?? null));
        jogos.append(par);
      }
    }
    coluna.append(el('h4', '', nome), jogos);
    return coluna;
  }));

  const ele = adversarioAtual(torneio);
  if (!ele) {
    subtitulo.textContent = torneio.campeao ? 'CAMPEAO' : 'ELIMINADO';
    proximo.replaceChildren(
      el('span', 'proximo-rotulo', 'FIM DO TORNEIO'),
      el('span', 'proximo-fim', torneio.campeao ? 'A TACA E SUA' : 'FIM DA LINHA PRA VOCE'),
    );
    return;
  }

  subtitulo.textContent = `${NOMES_DAS_RODADAS[torneio.rodada]} · ${def.onde}`;

  /**
   * O VS e a FICHA de quem vem, e nao so' o nome.
   *
   * E' a diferenca entre "proximo: DANI CAJU" e saber que ela saca de viagem e
   * corre como qualquer um — que muda o que se faz na recepcao. Sem ficha (um
   * id que o elenco perdeu), fica o nome, que ainda diz contra quem se joga.
   */
  const p = personagemPorId(ele.id);
  const versus = el('div', 'versus');
  const voce = el('div', 'versus-lado');
  voce.append(desenharBoneco(APARENCIA_DE_VOCE), el('span', 'versus-nome voce', 'VOCE'));
  const outro = el('div', 'versus-lado');
  if (p) outro.append(desenharBoneco(p.visual));
  outro.append(el('span', 'versus-nome', ele.nome));
  versus.append(voce, el('span', 'versus-vs', 'VS'), outro);

  proximo.replaceChildren(
    el('span', 'proximo-rotulo', 'PROXIMO ADVERSARIO'),
    versus,
    ...(p ? [desenharFicha(p, { retrospecto: carreira ? (carreira.confrontos[p.id] ?? null) : undefined })] : []),
  );
}
