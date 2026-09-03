# Fixtures

Páginas **reais** do vlr.gg, baixadas em 03/09/2026 com o User-Agent
identificável do projeto e requisições espaçadas em ~1,5s. São a entrada de
todo teste de scraper: nenhum teste faz rede.

| Arquivo                    | Origem                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| `match-detail-724899.html` | `/724899/…/?game=all&tab=overview` — Bo3, 3 mapas, série completa |
| `match-list-schedule.html` | `/matches` — partidas por vir                                     |
| `match-list-results.html`  | `/matches/results` — partidas encerradas com placar               |
| `event-list.html`          | `/events`                                                         |
| `team-roster-17037.html`   | `/team/17037/glacial-guardians` — tem jogadores **e** staff       |

Ao atualizar uma fixture, baixe a página inteira (sem editar à mão): o valor
dela é ser exatamente o que o servidor devolve. `pnpm vlr:doctor` roda os
mesmos parsers contra a rede e avisa quando as duas realidades divergirem.
