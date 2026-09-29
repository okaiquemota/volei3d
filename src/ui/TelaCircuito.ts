import {
  DEFINICAO, ETAPAS, NOMES_DAS_RODADAS, VOCE_ID, adversarioAtual, podeJogar,
  type Carreira, type Confronto, type Etapa, type Torneio,
} from '../match/Circuito';
import { personagemPorId } from '../match/personagens';
import { el } from './dom';
import { desenharFicha } from './TelaElenco';

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

  alvo.replaceChildren(...itens.map(([rotulo, valor, destaque]) => {
    const d = el('div', destaque ? 'destaque' : '');
    d.append(el('dt', '', rotulo), el('dd', '', valor));
    return d;
  }));
}

/**
 * As tres etapas.
 *
 * Cada uma diz uma de quatro coisas: travada, aberta, em andamento, ou ja'
 * ganha (quantas vezes). E so' um torneio anda por vez: com um em curso, as
 * outras etapas ficam paradas ate' ele acabar — quem entra num torneio joga ele
 * ate' o fim, ou abandona.
 */
export function desenharEtapas(
  alvo: HTMLElement,
  c: Carreira,
  torneio: Torneio | null,
  aoEscolher: (etapa: Etapa) => void,
  aoAbandonar: () => void,
): void {
  const andando = torneio && !torneio.eliminado && !torneio.campeao ? torneio : null;

  alvo.replaceChildren(...ETAPAS.map((etapa) => {
    const def = DEFINICAO[etapa];
    const aberta = podeJogar(c, etapa);
    const estaAqui = andando?.etapa === etapa;
    const outraAndando = andando !== null && !estaAqui;

    const cartao = el('button', 'etapa');
    cartao.type = 'button';
    if (estaAqui) cartao.classList.add('em-andamento');
    cartao.disabled = !aberta || outraAndando;

    cartao.append(el('span', 'nome', def.nome), el('span', 'onde', def.onde));

    let estado: HTMLElement;
    if (!aberta) {
      const anterior = ETAPAS[ETAPAS.indexOf(etapa) - 1];
      estado = el('span', 'estado', `VENCA O ${DEFINICAO[anterior!].nome} PRA ABRIR`);
    } else if (estaAqui) {
      estado = el('span', 'estado andamento', `CONTINUAR · ${NOMES_DAS_RODADAS[andando.rodada]}`);
    } else if (outraAndando) {
      estado = el('span', 'estado', 'TERMINE O TORNEIO EM ANDAMENTO');
    } else {
      estado = el('span', 'estado aberta', 'JOGAR');
    }
    cartao.append(estado);

    if (c.titulos[etapa] > 0) {
      cartao.append(el('span', 'tacas', `${c.titulos[etapa]}x CAMPEAO`));
    }

    cartao.addEventListener('click', () => aoEscolher(etapa));

    if (estaAqui) {
      const sair = el('button', 'abandonar', 'ABANDONAR');
      sair.type = 'button';
      // O clique nao pode subir pro cartao: abandonar nao e' continuar.
      sair.addEventListener('click', (ev) => { ev.stopPropagation(); aoAbandonar(); });
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

    // Titulo e jogos em blocos SEPARADOS: o titulo fica no alto, alinhado
    // entre as tres colunas, e so' os jogos se distribuem na altura.
    const jogos = el('div', 'jogos');
    const daRodada = torneio.rodadas[r];
    for (let i = 0; i < tamanhos[r]!; i++) jogos.append(caixa(daRodada?.[i] ?? null));
    coluna.append(el('h4', '', nome), jogos);
    return coluna;
  }));

  const ele = adversarioAtual(torneio);
  if (!ele) {
    subtitulo.textContent = torneio.campeao ? 'CAMPEAO' : 'ELIMINADO';
    proximo.replaceChildren(el('span', 'rotulo', torneio.campeao
      ? 'A TACA E SUA'
      : 'FIM DO TORNEIO PRA VOCE'));
    return;
  }

  subtitulo.textContent = `${NOMES_DAS_RODADAS[torneio.rodada]} · ${def.onde}`;

  /**
   * A FICHA de quem vem, e nao so' o nome.
   *
   * E' a diferenca entre "proximo: DANI CAJU" e saber que ela saca de viagem e
   * corre como qualquer um — que muda o que se faz na recepcao. Sem ficha (um
   * id que o elenco perdeu), fica o nome, que ainda diz contra quem se joga.
   */
  const p = personagemPorId(ele.id);
  proximo.replaceChildren(
    el('span', 'rotulo', 'PROXIMO ADVERSARIO'),
    p ? desenharFicha(p, { retrospecto: carreira ? (carreira.confrontos[p.id] ?? null) : undefined })
      : el('span', 'quem', ele.nome),
  );
}
