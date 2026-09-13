# Horário dos jogos e do fechamento do mercado no fuso de quem está lendo

## Contexto

Pedido do Rodrigo (`prompts/22_timezone_games.md`, item 2 do `prompts/TODO.md`): *"O usuário deve ser
capaz de verificar os jogos e o horário que o mercado fecha com base em seu timezone"*, porque *"o
website trouxe os jogos com base no timezone de Montreal"*.

**A premissa está parcialmente errada, e isso muda o plano.** O banco guarda instantes corretos, e a
tela **não** renderiza no fuso de Montreal por escolha: renderiza em `America/Sao_Paulo`, fixo no
código (`lib/round/day.ts:23`). A percepção de "Montreal" vem de outro lugar — de dois pontos que
**não** passam fuso nenhum e por isso usam o relógio do runtime, que é `America/Toronto` no `pnpm
dev` do Rodrigo (confirmado: `dayjs.tz.guess()` nesta máquina devolve `America/Toronto`) e **UTC** nas
functions da Vercel. Um deles é regra de negócio, não cosmética, e é um bug de verdade.

Então o trabalho é de **apresentação** (nenhuma migration, nenhum reprocessamento do scrap) mais **um
bug de fronteira de dia** que o pedido não previu.

**Resultado esperado:** quem abre a Home em Lisboa, Tóquio ou São Paulo vê o horário de cada jogo e o
"Mercado fecha HH:mm" no relógio da própria cidade, com um rótulo discreto dizendo em que fuso os
horários estão — enquanto o **instante** em que o mercado fecha continua sendo o mesmo para todo
mundo no planeta.

## Fatos verificados

1. **Nada a fazer no banco.** Toda coluna de data relevante é `timestamptz`: `db/schema/matches.ts:48`
   (`scheduledAt`), `:60`, `:70`, `:75`, `:82`, `:83`, `:86`; `db/schema/rounds.ts:30`
   (`marketOpensAt`), `:33` (`marketClosesAt`), `:40`, `:43`. O Postgres devolve instante absoluto e o
   driver entrega `Date` — o fuso nunca chega ao banco como informação, e não precisa chegar.
2. **O scrap já está certo.** `lib/vlr/normalize/kickoff.ts:19-34`: `parseVlrTimestamp` lê o
   `data-utc-ts` do vlr.gg — que **mente**, é `America/New_York` e não UTC (o comentário em `:8-18`
   documenta a partida 724899 como prova) — e converte para instante real com
   `dayjs.tz(ts, VLR_SOURCE_TZ).utc().toDate()`. **Esse fuso não é o fuso de exibição e não muda neste
   plano.** O teste que trava `VLR_SOURCE_TZ === "America/New_York"`
   (`lib/vlr/normalize/kickoff.test.ts:29`) continua valendo como está.
3. **A exibição é `America/Sao_Paulo`, fixa.** `lib/round/day.ts:23` (`APP_TZ`), usado como default em
   `dayKey` (`:26`) e `isSameDay` (`:31`); e `.tz(APP_TZ)` em `lib/round/format.ts:20`
   (`formatMatchKickoff`), `:25` (`formatKickoffTime`), `:42-43` (`formatMatchDay`) e
   `lib/market/window.ts:145` (`formatClosesAt`).
4. **Bug 1 — `lib/market/lock.ts:28,34` calcula a fronteira do dia no fuso do runtime.**
   `const today = dayjs(now)` e `dayjs(match.scheduledAt).isSame(today, "day")`, sem `.tz()`. Isso é
   **regra de negócio** (`lockedOrganizations` decide se o jogador ainda pode ser negociado), e ela
   discorda de propósito da sua própria irmã: `marketGroupKey` (`lib/market/window.ts:39-44`) recorta o
   grupo de fechamento por `dayKey` (fuso explícito), enquanto a trava recorta pelo relógio de quem
   executa. Caso concreto, com o runtime em UTC (produção):
   - jogo de VCT Americas às `2026-09-04T23:00:00Z` → 04/09 20:00 em Brasília;
   - fechamento = 1h antes = `2026-09-04T22:00:00Z`;
   - `now = 2026-09-05T01:00:00Z` → 04/09 **22:00** em Brasília, ainda o mesmo dia de jogo;
   - o dia UTC já virou (05/09 ≠ 04/09), então `continue` pula a partida e **a trava reabre** — dá para
     reescalar depois de ver o primeiro mapa, que é exatamente a jogada que a regra inviolável nº 8
     existe para impedir (`lib/market/window.ts:14-22`).
   Pior: o horário em que a trava reabre é **diferente em dev e em produção**, porque depende do fuso
   do processo. Os testes atuais não pegam isso porque `vitest.config.ts:12` fixa `TZ: "UTC"` e todos os
   instantes de `lib/market/lock.test.ts` são de meio-dia UTC.
5. **Bug 2 — `lib/championship/format.ts:10` formata sem fuso.**
   `dayjs(invitedAt).format("DD/MM [às] HH:mm")`, sem `.tz()`. É cosmético, mas é o único formatador da
   base que foge do padrão, e em produção (UTC) mostra convites 3h adiantados para um brasileiro.
   Aparece em `components/championship/pending-invites.tsx:75` e
   `components/profile/friend-requests.tsx:61`.
6. **O servidor não sabe o fuso do navegador, e todas as telas já são dinâmicas.**
   `app/(app)/layout.tsx:25`, `app/(app)/home/page.tsx:22`, `my-team/page.tsx:23`, `profile/page.tsx:35`
   e `ranking/page.tsx` chamam `await headers()` para a sessão — então nenhuma delas é pré-renderizada e
   ler um header ou cookie a mais não custa cache nenhum. `next.config.ts` não liga `cacheComponents`.
7. **A Vercel entrega o fuso por IP no header `x-vercel-ip-timezone`** (confirmado na doc oficial,
   `https://vercel.com/docs/headers/request-headers`, via Context7 — nome IANA, ex. `America/Sao_Paulo`).
   Está disponível em Route Handler, proxy e Server Component (tudo lê o mesmo objeto de request). Em
   `pnpm dev` **não existe**. Deploy confirmado em `iad1` (plano 23).
8. **`proxy.ts` não precisa entrar nisto.** O proxy (`proxy.ts:24`) existe para a guarda de sessão e para
   a região — e a região precisou dele porque `?region=` chega na **mesma** requisição em que o cookie é
   escrito (`proxy.ts:38-52`). O fuso não tem esse problema: o header da Vercel já vem no request, e o
   cookie do navegador é escrito antes da requisição seguinte. Mexer no proxy aqui só adicionaria risco
   (o `matcher` dele é delicado — ver o comentário em `proxy.ts:92-96` sobre AST literal).
9. **Fuso inválido é exceção, não `null`** (verificado em Node 22.17.1 nesta máquina):
   `dayjs(d).tz("Foo/Bar")` lança `RangeError: Invalid time zone specified`, e
   `new Intl.DateTimeFormat("pt-BR", { timeZone: "Foo/Bar" })` lança o mesmo. Header e cookie são
   entrada não confiável → **precisa de validação antes de chegar num formatador**, senão um cookie
   forjado derruba a Home inteira. `Intl.supportedValuesOf("timeZone")` existe (418 zonas) mas **não**
   inclui apelidos legados (`Asia/Calcutta`), então a validação certa é `try/catch` em
   `Intl.DateTimeFormat`, não `includes` na lista.
10. **Os plugins `utc`/`timezone` do dayjs são estendidos por efeito colateral de import.** Só
    `lib/round/day.ts:5-6` e `lib/vlr/normalize/kickoff.ts:5-6` chamam `dayjs.extend`.
    `lib/round/format.ts` e `lib/market/window.ts` chamam `.tz()` e funcionam **porque** importam
    `APP_TZ` de `lib/round/day.ts` (`format.ts:4`, `window.ts:4`). `lib/championship/format.ts` **não**
    importa nada de lá — se ganhar um `.tz()` sem mais nada, quebra com "`.tz is not a function`". Isso
    dita onde o novo módulo de fuso mora e o que ele precisa fazer.
11. **A contagem regressiva é duração, e duração não tem fuso.** `formatTimeLeft`
    (`lib/market/window.ts:130`), `formatMarketClose` (`:158`), `myTeamRefreshMs` (`:188`),
    `closesIn` (`lib/team/mappers.ts:98`), `components/market/market-countdown.tsx` e
    `components/team/team-stats.tsx:53` são todos `closesAt − now`. **Nada aqui muda.** `/my-team` só
    mostra duração, então a tela de escalação não entra na Fase de UI.
12. **A superfície de exibição é fechada e pequena.** Todo `<time>`/texto de data da app está em:
    `components/home/match-schedule.tsx:175-183` (kickoff) e `:233-243` (`MarketCell`, "Mercado fecha
    HH:mm"); os cabeçalhos de dia via `groupMatchesByDay` (`lib/round/schedule.ts:35,43`);
    `components/home/player-match-results.tsx:106-110`; `components/home/player-form-chart.tsx:236`;
    `components/championship/pending-invites.tsx:75`; `components/profile/friend-requests.tsx:61`.
    `/ranking` não mostra data nenhuma (verificado: nenhum `<time>`, nenhum `dayjs`).
13. **Todos esses componentes já estão no grafo de cliente.** `match-schedule.tsx:1`,
    `upcoming-matches.tsx:1`, `pending-invites.tsx:1`, `friend-requests.tsx:1`,
    `team-performance.tsx:1` e `player-form-chart.tsx:1` têm `"use client"`.
    `player-match-results.tsx` **não tem a diretiva**, mas é importado por `team-performance.tsx:7`
    (client) — ou seja, já é compilado como cliente. Logo, um Context React alcança 100% da superfície,
    e é o mesmo mecanismo que o repo já usa para valor semeado pelo layout
    (`components/layout/region-display.tsx:42-64`).
14. **`formatClosesAt` (`lib/market/window.ts:144`) não é usada em tela nenhuma** — só em
    `lib/market/window.test.ts:67-70`. Entra na migração por consistência, não por necessidade.
15. **`toIsoDate` (`lib/round/format.ts:57`) está correto e não muda.** `.toISOString()` alimenta o
    atributo `dateTime` do `<time>`, que **deve** ser o instante absoluto — é assim que leitor de tela e
    navegador reinterpretam a data no fuso local do usuário.
16. **`router.refresh()` re-renderiza Server Components da rota atual e reavalia `cookies`/`headers`**
    (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46,56`: *"Making a
    new request to the server, re-fetching data requests, and re-rendering Server Components"* e
    *"Other Request-time APIs like `cookies` and `headers` could also change the response"*). O layout
    faz parte da rota atual — é o que permite ao layout re-semear o fuso depois que o cookie chega.
17. **`db/schema/auth.ts` usa `timestamp` sem `withTimezone`** (`:22,23,33,35,36,64,65,68,69,88,89,90`).
    Não afeta este plano: nada dessas colunas é exibido como data ao usuário (são `expiresAt` de sessão
    e `createdAt`/`updatedAt` de auditoria). Fica **nomeado como pendência**, não corrigido aqui — mudar
    isso é migration, e migration não pertence a um plano de apresentação.

## Os três fusos que hoje se confundem

Este é o entregável conceitual do plano. Depois dele, cada função da base pertence a **exatamente uma**
destas três colunas, e o nome diz a qual.

| Fuso | O que é | Constante | Muda neste plano? |
| --- | --- | --- | --- |
| **FONTE** | O relógio em que o vlr.gg escreve o HTML que a gente raspa. Serve só para transformar texto em instante. | `VLR_SOURCE_TZ` (`lib/vlr/normalize/kickoff.ts:19`) | **Não.** Continua `America/New_York`. |
| **REGRA** | Onde começa e termina o "dia de jogo" do produto. Define o grupo de fechamento do mercado, a trava de escalação e o portão dos destaques. | `APP_TZ` → renomeada para `GAME_DAY_TZ` (`lib/round/day.ts:23`) | **Não muda de valor.** Continua `America/Sao_Paulo`, e continua **igual para todo usuário**. |
| **EXIBIÇÃO** | O relógio em que a tela escreve hora e data para quem está lendo. | `DISPLAY_FALLBACK_TZ` (novo, `lib/round/timezone.ts`) — só o **fallback**; o valor real vem do usuário. | **Sim.** É o único que passa a variar por pessoa. |

**A linha que não se cruza:** a regra "o mercado fecha uma hora antes do primeiro jogo do dia daquele
campeonato" produz um **instante absoluto**. Esse instante é o mesmo para o brasileiro e para o
japonês, e **não pode** passar a depender de quem olha — senão dois usuários teriam janelas de
negociação diferentes para o mesmo jogo, e o `lockedOrganizations` do servidor contradiria o relógio da
tela. O que muda é só **como aquele instante é escrito**: `16:00Z` é "13:00" para quem está em São Paulo
e "01:00 do dia seguinte" para quem está em Tóquio — mesmo instante, duas frases.

Por isso o `dayKey` tem dois usos que **devem** discordar, e o plano os separa explicitamente:

| Chamada de `dayKey`/dia | Natureza | Fuso depois do plano |
| --- | --- | --- |
| `marketGroupKey` (`lib/market/window.ts:43`) | Regra: define **qual** instante é o fechamento | `GAME_DAY_TZ` |
| `isSameDay` em `pendingRegions` (`lib/home/summary.ts:255`) | Regra: portão dos destaques | `GAME_DAY_TZ` |
| fronteira de dia em `lockedOrganizations` (`lib/market/lock.ts:34`) | Regra: a trava (hoje **sem fuso** — bug) | `GAME_DAY_TZ` |
| agrupamento do calendário em `groupMatchesByDay` (`lib/round/schedule.ts:35`) | Exibição: sob qual cabeçalho a linha aparece | **fuso do usuário** |

## Decisões tomadas neste plano (decorrem do código, não de gosto)

| # | Decisão |
| --- | --- |
| 1 | Nenhuma migration, nenhum reprocessamento de scrap, nenhuma mudança em `VLR_SOURCE_TZ`. O dado está certo (fatos 1 e 2). |
| 2 | O fuso do usuário é resolvido **no servidor** e desce como string para os componentes. Servidor e cliente formatam com a **mesma** string → nenhum mismatch de hidratação possível. Nada é formatado "só no cliente". |
| 3 | O canal até os componentes é um Context React (`useTimezone()`), não prop drilling. Todos os 6 pontos de exibição já estão no grafo de cliente (fato 13), e o repo já tem exatamente este padrão em `components/layout/region-display.tsx`. |
| 4 | `useTimezone()` **não lança** fora do provider: devolve `DISPLAY_FALLBACK_TZ`. Diferente de `useRegionDisplay` (`region-display.tsx:67-73`), que lança — região errada mostra o time errado (dado), fuso ausente mostra a hora de Brasília (cosmético, e é o comportamento de hoje). Efeito colateral bom: nenhum teste de componente existente precisa ganhar um provider para continuar passando. |
| 5 | Fuso vindo de header ou cookie passa por `parseTimezone` antes de qualquer `.tz()`. Sem isso, `?`/cookie forjado derruba a página com `RangeError` (fato 9). |
| 6 | Durações não mudam (fato 11). `MarketCountdown`, `closesIn`, `formatTimeLeft`, `myTeamRefreshMs` ficam exatamente como estão. |
| 7 | `toIsoDate` continua `.toISOString()` (fato 15) — o `dateTime` do `<time>` é instante absoluto por definição. |
| 8 | `proxy.ts` não é tocado (fato 8). |
| 9 | O novo módulo `lib/round/timezone.ts` faz o `dayjs.extend(utc)`/`dayjs.extend(timezone)` e é importado por **todo** formatador (todos precisam de `DISPLAY_FALLBACK_TZ`), o que transforma a extensão de plugin num efeito colateral garantido em vez de acidental (fato 10). |

## Decisões a confirmar com o Rodrigo

Não trava nada: cada item já tem a recomendação embutida nas fases. Se ele discordar de alguma, o
ajuste é local.

| # | Pergunta | **Recomendação** | Alternativas e o que custam |
| --- | --- | --- | --- |
| A | Como descobrir o fuso do usuário? | **Cookie do navegador (`vlr.tz`) → header `x-vercel-ip-timezone` → fallback São Paulo**, nessa ordem. O header acerta o **primeiro** paint sem nenhum round-trip; o cookie corrige o header quando ele errar (VPN, IP de operadora em outro estado) e é a verdade do relógio da pessoa; o fallback mantém o comportamento de hoje quando não há nenhum dos dois (dev local, primeiro acesso sem JS). | *(a)* Só formatação no cliente (`useEffect` + `suppressHydrationWarning`): pisca a hora errada em toda navegação e joga fora o SSR. *(b)* Só o header da Vercel: quebra em `pnpm dev` e erra com VPN, sem caminho de correção. *(c)* Só preferência no perfil: exige migration, só serve para logado, e obriga todo usuário a configurar o que o navegador já sabe. |
| B | Qual o fallback quando o fuso é desconhecido? | **`America/Sao_Paulo`** — é o público (o comentário em `lib/round/day.ts:20-21` já assume isso) e é exatamente o que a tela mostra hoje, então o fallback não é regressão para ninguém. | UTC: seria "mais neutro" e pioraria a experiência do usuário mais provável. |
| C | A tela deve **dizer** em que fuso está mostrando? | **Sim, um rótulo discreto** no cabeçalho de "Próximos jogos": `Horários em GMT−3 (seu fuso)`. Sem ele, um horário certo é indistinguível de um errado, e o usuário não tem como saber que o app já se adaptou. Custo: uma linha de texto. | Não mostrar: mais limpo, mas deixa o usuário sem como confirmar. Mostrar o nome IANA (`America/Sao_Paulo`): informação de máquina em texto de produto. |
| D | O bug da trava (fato 4) entra neste plano? | **Sim, Fase 1, com teste de regressão.** É a mesma frase do pedido ("o horário que o mercado fecha"), é uma regra inviolável reabrindo sozinha, e é **uma linha**. Deixar para depois significa entregar a tela certa sobre uma trava errada. | Só nomear como follow-up: o plano de apresentação fica menor, o bug fica em produção. |
| E | O bug do `formatInvitedAt` (fato 5) entra? | **Sim, Fase 2**, junto com os outros formatadores — ele deixa de ser um caso especial ao ganhar o parâmetro de fuso como todos os demais. Custo zero adicional. | Deixar de fora: sobra o único formatador sem fuso na base, que é como este bug nasceu. |
| F | Os cabeçalhos "Hoje"/"Amanhã"/"sáb, 06/09" seguem o fuso do usuário? | **Sim.** "Hoje" é a informação que o usuário usa para decidir se dá tempo de mexer no time (`lib/round/format.ts:30-33`); "hoje" em Brasília não é "hoje" em Tóquio. Consequência aceita e documentada: dois jogos do mesmo dia-de-regra podem cair sob cabeçalhos diferentes para um usuário do Pacífico, ambos mostrando o mesmo "Mercado fecha HH:mm" — o que é honesto, porque o fechamento é um instante só. | Manter em `GAME_DAY_TZ`: a coluna de horário ficaria no fuso do usuário e o cabeçalho no de Brasília — um jogo marcado "Amanhã" com hora "23:00" de hoje. Pior dos dois mundos. |
| G | Preferência manual de fuso no perfil? | **Fica de fora** (nomeada em "o que fica de fora"). O cookie já acompanha a pessoa quando ela viaja, sem que ela configure nada. Se depois aparecer demanda (alguém que mora em um fuso e acompanha a liga de outro), entra como *override* em cima de `resolveTimezone`, sem refazer nada deste plano. | Fazer agora: migration em `user` + form RHF/Zod + Server Action, para um caso de uso não confirmado. |
| H | Renomear `APP_TZ` → `GAME_DAY_TZ`? | **Sim, Fase 0.** Depois deste plano "o fuso do app" passa a ser o do usuário, e o nome `APP_TZ` vira ativamente enganoso justo na constante em que a confusão custa mais caro (regra de negócio). Depois da Fase 2 só restam 3 pontos de uso (`lib/round/day.ts`, `lib/round/day.test.ts` e um comentário em `lib/market/window.ts`). | Manter o nome: zero churn, e a próxima pessoa a ler `APP_TZ` numa regra de mercado vai supor que é o fuso de exibição — que é literalmente o erro que este plano existe para desfazer. |

## Fase 0 — O vocabulário: um módulo puro para o fuso de exibição

Sem React, sem banco, sem `next/headers`. Testável em milissegundos, no espírito de
`lib/round/day.ts` e `lib/team/region-constants.ts`.

**Arquivos**

- **novo** `lib/round/timezone.ts`
- **novo** `lib/round/timezone.test.ts` (`// @vitest-environment node`, como `lib/round/day.test.ts:1`)
- **muda** `lib/round/day.ts` — renomeia `APP_TZ` → `GAME_DAY_TZ` e reescreve o docblock para dizer
  **fuso de regra**, com o contraponto explícito ao fuso de exibição
- **muda** `lib/round/day.test.ts:4,44-47` — o `describe` passa a se chamar `GAME_DAY_TZ`; a asserção
  `toBe("America/Sao_Paulo")` continua (é ela que impede a regra de virar preferência de usuário)
- **muda** `lib/market/window.ts:4,141` e `lib/round/format.ts:4,12` — só o identificador/comentário
  (a Fase 2 mexe no corpo)
- **muda** `lib/home/summary.ts:243-246` — o comentário que cita `APP_TZ`

**O que muda**

`lib/round/timezone.ts`, inteiro em conceito:

```ts
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Este módulo é o único caminho até o fuso de EXIBIÇÃO, e é importado por todo
// formatador — então estender os plugins aqui torna a extensão garantida, e
// não um efeito colateral de quem por acaso importou `lib/round/day.ts`.
dayjs.extend(utc);
dayjs.extend(timezone);

/** O cookie que o navegador escreve com o próprio fuso (`components/layout/timezone.tsx`). */
export const TZ_COOKIE = "vlr.tz";
/** Fuso por geolocalização de IP, entregue pela Vercel em produção. */
export const VERCEL_TZ_HEADER = "x-vercel-ip-timezone";

/**
 * O fuso em que a tela escreve quando não se sabe o de quem está lendo.
 *
 * Coincide com `GAME_DAY_TZ` porque o público é o mesmo, **não** porque um
 * derive do outro: são conceitos diferentes e podem divergir sem que nada
 * quebre. Literal repetido de propósito — ligar os dois convidaria alguém a
 * "arrumar" a regra de negócio mexendo no fallback de exibição.
 */
export const DISPLAY_FALLBACK_TZ = "America/Sao_Paulo";

/** Fuso IANA válido, ou `null` — no contrato de `parseTeamRegion` (`lib/round/regions.ts:65`). */
export function parseTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value });
    return value;
  } catch {
    return null; // `RangeError: Invalid time zone specified` — fato 9.
  }
}

/** O fuso do navegador, já validado. `null` fora do navegador ou se o Intl não souber. */
export function guessBrowserTimezone(): string | null {
  return parseTimezone(dayjs.tz.guess());
}
```

Duas coisas que **não** vão neste arquivo, de propósito: `try/catch` em vez de
`Intl.supportedValuesOf` (a lista não tem apelidos legados como `Asia/Calcutta` — fato 9), e nenhum
`z.enum` de fusos (são 418 zonas mais os apelidos; e a regra de mensagens pt-BR do `CLAUDE.md` isenta
schema de header/cookie interno, então Zod aqui só adicionaria peso).

**Testes** (`lib/round/timezone.test.ts`)

- `parseTimezone` aceita `"America/Sao_Paulo"`, `"Asia/Tokyo"` e o apelido legado `"Asia/Calcutta"`.
- `parseTimezone` devolve `null` para `"Foo/Bar"`, `""`, `undefined`, `42` e `{}` — e, explicitamente,
  **não lança** (é a defesa contra cookie forjado).
- `DISPLAY_FALLBACK_TZ` é `"America/Sao_Paulo"`.
- Um teste que documenta a separação: `DISPLAY_FALLBACK_TZ` e `GAME_DAY_TZ` são constantes
  independentes — asserção sobre os dois valores, com o comentário do porquê.

**Como verificar:** `pnpm test lib/round/timezone.test.ts lib/round/day.test.ts` e
`pnpm exec tsc --noEmit` (o rename de `APP_TZ` tem que estourar em qualquer ponto esquecido).

## Fase 1 — Bug 1: a fronteira de dia da trava de escalação

Independente da Fase 0 em conceito, mas escrita depois dela para já usar o nome novo. **É a única
fase que muda comportamento de regra de negócio** — e muda para o que a regra sempre dizia que era.

**Arquivos**

- **muda** `lib/market/lock.ts:1,28,34`
- **muda** `lib/market/lock.test.ts` (novo teste de regressão)

**O que muda**

Sai o `dayjs` cru, entra a função que já existe para essa pergunta:

```ts
// antes: import dayjs from "dayjs";  →  const today = dayjs(now);
//        if (!dayjs(match.scheduledAt).isSame(today, "day")) continue;
import { isSameDay } from "@/lib/round/day";
// ...
if (!isSameDay(match.scheduledAt, now)) continue;
```

Com isso `lib/market/lock.ts` deixa de importar `dayjs` (a linha `:1` sai) e a trava passa a recortar
o dia **exatamente** como `marketGroupKey` (`lib/market/window.ts:43`) — que é quem calcula o instante
que a trava consulta. Hoje as duas discordam, e o docblock de `lock.ts:6-23` afirma que concordam.
Vale acrescentar uma frase ao docblock apontando `GAME_DAY_TZ` como a fronteira, no tom dos comentários
vizinhos.

**Testes** (`lib/market/lock.test.ts`)

Um teste de regressão com o caso do fato 4 — ele **falha** hoje e passa depois:

```ts
it("a trava não reabre quando o dia UTC vira mas o dia de jogo continua", () => {
  // Jogo 04/09 20:00 em Brasília (23:00Z); o mercado fechou às 22:00Z (19:00).
  const grade = [match("a", "VCT Americas", "SENTINELS", "NRG",
    new Date("2026-09-04T23:00:00Z"))];
  // 04/09 22:00 em Brasília — mesmo dia de jogo, já 05/09 em UTC.
  const now = new Date("2026-09-05T01:00:00Z");
  expect(lockedOrganizations(grade, now)).toEqual(["SENTINELS", "NRG"]);
});
```

Manter o `TZ: "UTC"` do `vitest.config.ts:12` como está: é justamente sob UTC (o runtime da Vercel) que
o teste tem valor. Vale um segundo caso simétrico no outro sentido — jogo de `2026-09-05T01:00:00Z`
(04/09 22:00 em Brasília) com `now` em `2026-09-05T02:00:00Z` — provando que a trava **não** vaza para
o dia seguinte de verdade.

**Como verificar:** `pnpm test lib/market/lock.test.ts lib/market/window.test.ts lib/home` — e conferir
que `app/(app)/my-team/actions.test.ts` continua verde (é quem consome `lockedOrganizations` nas Server
Actions: `actions.ts:71,165,238,293`).

## Fase 2 — Os formatadores passam a receber o fuso

Domínio puro. Nenhum componente muda ainda: cada função ganha um parâmetro `tz` **no fim**, com default
`DISPLAY_FALLBACK_TZ`, então todo chamador atual continua compilando e com o mesmo resultado de hoje.

**Arquivos**

- **muda** `lib/round/format.ts` — `formatMatchKickoff` (`:19`), `formatKickoffTime` (`:24`),
  `formatMatchDay` (`:38`); troca o import de `GAME_DAY_TZ` por `DISPLAY_FALLBACK_TZ`
- **muda** `lib/round/schedule.ts` — `groupMatchesByDay` (`:22`)
- **muda** `lib/championship/format.ts` — `formatInvitedAt` (`:9`) — **Bug 2**
- **muda** `lib/market/window.ts` — `formatClosesAt` (`:144`); mantém `GAME_DAY_TZ` para `dayKey`/
  `marketGroupKey`, agora com comentário explicando por que os dois fusos coexistem no arquivo
- **muda** `lib/round/format.test.ts`, `lib/round/schedule.test.ts`, `lib/market/window.test.ts`
- **novo** `lib/championship/format.test.ts` (o módulo não tem teste hoje — `lib/championship/` só tem
  `regions.test.ts` e `standings.test.ts`)

**O que muda**

```ts
// lib/round/format.ts
import { DISPLAY_FALLBACK_TZ } from "@/lib/round/timezone";

export function formatKickoffTime(
  scheduledAt: Date,
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  return dayjs(scheduledAt).tz(tz).format("HH:mm");
}
```

```ts
// lib/round/schedule.ts — o dia de EXIBIÇÃO, não o da regra
export function groupMatchesByDay(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
  tz: string = DISPLAY_FALLBACK_TZ,
): MatchDay[] {
  // ...
  const key = dayKey(match.scheduledAt, tz);   // era dayKey(match.scheduledAt)
  // ...
  label: formatMatchDay(dayMatches[0].scheduledAt, now, tz),
}
```

O docblock de `lib/round/format.ts:11-16` precisa ser **reescrito, não apenas ajustado**: ele hoje diz
"sempre no fuso do jogo (`APP_TZ`), nunca no do runtime", e a razão que ele dá (servidor e cliente têm
de chegar ao mesmo texto) continua verdadeira — mas a garantia passa a ser outra: o fuso é **resolvido
no servidor e passado como argumento**, então os dois lados recebem a mesma string. Esse parágrafo é o
que impede alguém de "simplificar" trocando o parâmetro por `dayjs.tz.guess()` dentro do formatador —
que é exatamente como se cria um mismatch de hidratação.

`lib/championship/format.ts` ganha `.tz(tz)` e, junto, o import de `lib/round/timezone` que garante os
plugins (fato 10) — sem ele a função quebra em runtime, e o teste novo é o que prova isso.

**Testes**

- `lib/round/format.test.ts`: cada caso existente ganha um par em `Asia/Tokyo`. O de ouro:
  `formatKickoffTime(new Date("2026-09-03T21:00:00Z"), "Asia/Tokyo")` → `"06:00"` (contra `"18:00"` em
  São Paulo, `:45`) — o mesmo instante, duas frases. E
  `formatMatchDay(new Date("2026-09-03T21:00:00Z"), now, "Asia/Tokyo")` com
  `now = 2026-09-03T12:00:00Z` → `"Amanhã"`, enquanto em São Paulo é `"Hoje"` (`:53`): é a Decisão F
  virando asserção.
- `lib/round/schedule.test.ts`: dois jogos (`2026-09-04T17:00:00Z` e `2026-09-05T01:00:00Z`) caem num
  cabeçalho só em `America/Sao_Paulo` e em **dois** em `Asia/Tokyo` — o agrupamento é de exibição.
- `lib/championship/format.test.ts` (novo): `formatInvitedAt(new Date("2026-03-14T18:00:00Z"))` →
  `"14/03 às 15:00"` (default São Paulo) e `"15/03 às 03:00"` em `Asia/Tokyo`. Um terceiro caso serve de
  teste de fumaça dos plugins: chamar com `tz` explícito **não** lança.
- `lib/market/window.test.ts:67-70`: mantém o caso default e acrescenta um com `tz`. E um teste que
  fixa a Decisão da linha que não se cruza: `marketClosesByMatch` devolve **o mesmo `Date`**
  independentemente de qualquer fuso de exibição — não recebe `tz` e não deve receber.

**Como verificar:** `pnpm test lib/round lib/market lib/championship lib/home` + `pnpm exec tsc --noEmit`
+ `pnpm lint`. Nenhum teste de componente deve mudar nesta fase (os defaults preservam o comportamento):
se algum quebrar, é sinal de que um `tz` entrou onde não devia.

## Fase 3 — Descobrir o fuso do usuário e levá-lo até a árvore

**Arquivos**

- **novo** `lib/round/timezone-selection.ts` (server-only, espelha `lib/team/region-selection.ts:37-56`)
- **novo** `lib/round/timezone-selection.test.ts`
- **novo** `components/layout/timezone.tsx` (`"use client"`)
- **novo** `components/layout/timezone.test.tsx`
- **muda** `app/(app)/layout.tsx:30-63`

**O que muda**

`lib/round/timezone-selection.ts` — a ordem de precedência da Decisão A:

```ts
import { cookies, headers } from "next/headers";
import {
  DISPLAY_FALLBACK_TZ, parseTimezone, TZ_COOKIE, VERCEL_TZ_HEADER,
} from "@/lib/round/timezone";

/**
 * O fuso em que esta requisição vai escrever as horas.
 *
 * Ordem: cookie do navegador → geolocalização de IP da Vercel → fallback.
 * O cookie vem **primeiro** porque é o relógio de verdade da pessoa; o header
 * é um chute bom (acerta o primeiro paint sem round-trip) e erra com VPN.
 * Nenhum dos dois é confiável como texto: os dois passam por `parseTimezone`.
 */
export async function resolveTimezone(): Promise<string> {
  const fromCookie = parseTimezone((await cookies()).get(TZ_COOKIE)?.value);
  const fromHeader = fromCookie ?? parseTimezone((await headers()).get(VERCEL_TZ_HEADER));
  return fromHeader ?? DISPLAY_FALLBACK_TZ;
}
```

`components/layout/timezone.tsx` — três exportações:

- `TimezoneProvider({ tz, children })`: um `createContext<string>(DISPLAY_FALLBACK_TZ)`. Não tem estado
  (diferente de `RegionDisplayProvider`): o fuso não muda dentro de uma renderização, e quem o atualiza
  é o servidor no refresh.
- `useTimezone(): string`: `useContext`, com o default do contexto como fallback (Decisão 4) — sem
  `throw`.
- `TimezoneSync({ serverTz })`: não renderiza nada, no molde de `RegionDisplaySync`
  (`region-display.tsx:80-95`). Em `useEffect`:

```ts
const browserTz = guessBrowserTimezone();
// Inválido (ou sem Intl): não escreve nada e não atualiza. Sem essa guarda,
// um fuso que `parseTimezone` recusa no servidor deixaria a condição abaixo
// sempre verdadeira — um laço infinito de refresh.
if (!browserTz || browserTz === serverTz) return;
document.cookie = `${TZ_COOKIE}=${browserTz}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
router.refresh();
```

Três detalhes que não são acidentais:

1. **O cookie não é `httpOnly`** — quem escreve é o navegador (`document.cookie`), não o servidor, ao
   contrário de `REGION_COOKIE` (`proxy.ts:63-68`). Não há nada sensível nele.
2. **O laço é impossível por construção**: depois do refresh o servidor resolve `serverTz === browserTz`
   e o efeito sai no primeiro `if`. A guarda de `!browserTz` fecha o único caminho em que o servidor
   poderia recusar o que o navegador escreveu.
3. **Nunca há mismatch de hidratação**: o primeiro paint e a hidratação usam a **mesma** `serverTz`
   (veio do servidor como prop). O fuso do navegador só entra depois de montar, e por um caminho que
   refaz o HTML no servidor — nunca reescrevendo texto no cliente.

`app/(app)/layout.tsx` — `resolveTimezone()` entra no `Promise.all`/sequência já existente (a função é
async e o layout já é), e o provider envolve o `<RegionDisplayProvider>` (ou é envolvido por ele; a
ordem é indiferente — não há dependência entre os dois):

```tsx
const tz = await resolveTimezone();
// ...
<TimezoneProvider tz={tz}>
  <TimezoneSync serverTz={tz} />
  <RegionDisplayProvider initial={...}>{/* ... */}</RegionDisplayProvider>
</TimezoneProvider>
```

**Por que o layout e não cada página:** o fuso, diferente da região, **não muda na navegação** — então
o problema que obrigou a região a inverter a direção (`region-display.tsx:21-41`: layout não
re-renderiza em troca de `?region=`) não existe aqui. E `router.refresh()` refaz os Server Components da
rota, layout incluído, reavaliando `cookies()` (fato 16).

**Testes**

- `lib/round/timezone-selection.test.ts`, com `vi.mock("next/headers", ...)` no padrão de
  `app/(app)/profile/actions.test.ts:47`:
  cookie válido vence o header; header vale quando não há cookie; cookie **inválido** cai no header (e
  não no fallback direto); sem nenhum dos dois → `DISPLAY_FALLBACK_TZ`; header inválido → fallback.
- `components/layout/timezone.test.tsx` (React Testing Library, banco irrelevante — nada de `@/db` aqui):
  - um componente-sonda dentro do `TimezoneProvider` mostra a `tz` recebida (`getByText("Asia/Tokyo")`);
  - a mesma sonda **fora** do provider mostra `America/Sao_Paulo` (Decisão 4);
  - `TimezoneSync` com `serverTz` diferente do do navegador escreve o cookie e chama `router.refresh()`
    — `refresh` mockado via `vi.mock("next/navigation")`, e o fuso do navegador simulado fazendo stub de
    `Intl.DateTimeFormat().resolvedOptions().timeZone` (é o que `dayjs.tz.guess()` lê);
  - `TimezoneSync` com `serverTz` **igual** ao do navegador não escreve cookie nem chama `refresh`;
  - fuso do navegador inválido → nada acontece (a guarda anti-laço).

**Como verificar:** `pnpm test lib/round components/layout` + `pnpm lint` + `pnpm build`. Manualmente
ainda não há nada visível — a Fase 3 só entrega o encanamento.

## Fase 4 — As telas passam a escrever no fuso de quem lê

**Arquivos**

- **muda** `components/home/match-schedule.tsx` — `:182` (kickoff), `:242` (`MarketCell`), `:140`
  (`groupMatchesByDay`)
- **muda** `components/home/player-match-results.tsx` — `:110`; ganha `"use client"` na primeira linha
  (é o que já é de fato, por `team-performance.tsx:7` — fato 13)
- **muda** `components/home/player-form-chart.tsx` — `:236`
- **muda** `components/championship/pending-invites.tsx` — `:75`
- **muda** `components/profile/friend-requests.tsx` — `:61`
- **muda** `components/home/upcoming-matches.tsx` — o rótulo de fuso da Decisão C
- **muda** `components/home/upcoming-matches.test.tsx`, `components/home/player-match-results.test.tsx`,
  `components/home/team-performance.test.tsx`, `components/championship/pending-invites.test.tsx`,
  `components/profile/friend-requests.test.tsx`
- **não muda:** `components/market/market-countdown.tsx`, `components/team/*`, `app/(app)/my-team/page.tsx`
  (só duração — fato 11), `app/(app)/ranking/*` (nenhuma data — fato 12)

**O que muda**

Sempre o mesmo movimento, sem prop nova em nenhum componente:

```tsx
const tz = useTimezone();
// ...
{formatKickoffTime(match.scheduledAt, tz)}
```

Em `match-schedule.tsx` são três pontos e o `tz` tem de ser **o mesmo** nos três, senão o cabeçalho de
dia e a linha se contradizem: `ScheduleDays` chama `groupMatchesByDay(visible, now, tz)` (`:140`), o
`<time>` do kickoff usa `formatKickoffTime(match.scheduledAt, tz)` (`:182`) e `MarketCell` recebe `tz`
por prop (é função local do arquivo, `:227`) ou chama o hook por conta própria — tanto faz, desde que
venha do mesmo `useTimezone()`. Recomendo o hook em `ScheduleDays` e prop para `MarketCell`, que é
componente interno e já recebe `now` assim.

O rótulo da Decisão C, em `upcoming-matches.tsx`, logo abaixo do título do painel — uma linha no tom das
frases auxiliares que o painel já tem (`:64-67`), usando `dayjs().tz(tz).format("Z")` para o offset:

```tsx
<p className="text-[10px] text-muted-foreground">
  Horários em GMT{offsetLabel} (seu fuso)
</p>
```

`offsetLabel` sai de uma função nova em `lib/round/format.ts` (`formatTimezoneOffset(tz, now)` → `"−3"`,
`"+9"`, `"+5:30"`), testável sem React, porque a regra do `CLAUDE.md` é que componente não formata data
na mão. Nada de cor hard-coded (`text-muted-foreground` é variável de `app/globals.css`), nada de
`Date` nativo.

**Testes**

Todos com React Testing Library, queries por role/texto, banco irrelevante (estes componentes não tocam
`@/db`). O padrão novo é um helper de render que envolve no provider:

```tsx
function renderPanel(matches, tz = "America/Sao_Paulo") {
  return render(
    <TimezoneProvider tz={tz}>
      <UpcomingMatches upcoming={{ matches, myOrganizations: [] }} now={NOW} />
    </TimezoneProvider>,
  );
}
```

- `upcoming-matches.test.tsx`: os casos de hoje continuam (sem provider, o fallback mantém São Paulo —
  então nenhuma asserção existente precisa mudar, o que é a prova de que a Decisão 4 pagou). **Novos**,
  todos com `tz = "Asia/Tokyo"` e a grade de `:16` (`2026-09-04T17:00:00Z`):
  - o kickoff mostra `"02:00"` onde São Paulo mostrava `"14:00"` (`:50`);
  - o `MarketCell` mostra `"Mercado fecha 01:00"` onde São Paulo mostrava `"Mercado fecha 13:00"`
    (`:150`);
  - o `dateTime` dos dois `<time>` **continua** o mesmo ISO (`:137,141`) — é a asserção que prova que o
    instante não mudou, só a frase;
  - o contador `"Mercado fecha em 28h 0m"` (`:188`) é **idêntico** nos dois fusos — a asserção que fixa
    a Decisão 6;
  - o rótulo `"Horários em GMT+9 (seu fuso)"` aparece.
- `pending-invites.test.tsx` / `friend-requests.test.tsx`: hoje nenhum dos dois assere o texto da data
  (verificado) — ganham a primeira asserção sobre ela, nos dois fusos. É o teste que faltava para o Bug 2.
- `player-match-results.test.tsx` e `team-performance.test.tsx`: um caso em `Asia/Tokyo` provando que
  `formatMatchKickoff` do histórico acompanha.

**Como verificar**

- `pnpm test` (suíte inteira), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- Manual, em `pnpm dev` (sem header da Vercel — é o caminho do cookie):
  1. Abrir `/home` com o `TZ` da máquina (Toronto). Primeiro paint vem em Brasília (fallback); o
     `TimezoneSync` detecta `America/Toronto`, escreve `vlr.tz` e o refresh repinta em Toronto. **Conferir
     no DevTools que o cookie `vlr.tz` existe** e que o rótulo diz `GMT−4`.
  2. Editar `vlr.tz` para `Asia/Tokyo` no DevTools → F5. Os horários e os cabeçalhos "Hoje/Amanhã"
     mudam; o `"Mercado fecha em …"` **não**. (Se o valor editado for sobrescrito no mesmo instante pelo
     `TimezoneSync`, é o comportamento correto — ele só reescreve quando difere do fuso real do
     navegador; para testar Tóquio de verdade, use o *Sensors → Location* do DevTools ou rode
     `TZ=Asia/Tokyo pnpm dev` e recarregue.)
  3. Com `vlr.tz=Foo/Bar` (forjado) → F5: a página **abre** em Brasília, sem erro. É o fato 9 virando
     verificação.
  4. Abrir dois navegadores com fusos diferentes lado a lado na mesma Home: as horas escritas divergem,
     a contagem regressiva do mercado é a mesma nos dois. Esse é o critério de aceite do pedido.
  5. Conferir no console que não há aviso de hidratação (`Text content did not match`) em nenhuma das
     telas logadas.
- Em produção, depois do deploy: abrir com VPN em outro país e confirmar que o **primeiro** paint já vem
  no fuso certo (caminho do `x-vercel-ip-timezone`, que não existe em dev).

**Contingência nomeada (gatilho concreto):** se no passo 1 o cookie for escrito mas o rótulo **não**
mudar depois do `router.refresh()` — ou seja, se o layout não re-renderizar —, troque a única linha
`router.refresh()` de `TimezoneSync` por `window.location.reload()`. Nada mais muda: o provider, o
resolver e os componentes são idênticos nos dois caminhos. O custo é um recarregamento completo, uma vez
por navegador (o cookie vive um ano).

## Riscos e o que fica de fora

**Riscos**

1. **Primeiro acesso pode piscar a hora errada.** Em produção o header da Vercel acerta quase sempre e
   não há piscada. Em dev, e para quem usa VPN, o primeiro paint sai no fallback e o refresh corrige —
   uma vez por navegador. A alternativa (formatar só no cliente) piscaria em *toda* navegação, não só na
   primeira; a decisão é consciente.
2. **`router.refresh()` depende de o layout re-renderizar.** A doc do Next 16 diz que sim (fato 16), mas
   é o único elo que não dá para provar em teste unitário. Coberto pelo passo 1 da verificação manual e
   pela contingência de uma linha acima.
3. **Cabeçalhos de dia e grupo de fechamento podem discordar** para usuário longe de Brasília: dois jogos
   do mesmo dia-de-regra caindo sob cabeçalhos diferentes, ambos com o mesmo "Mercado fecha HH:mm". É
   consequência aceita da Decisão F, e é honesta — o fechamento é um instante só. Se incomodar na tela, o
   ajuste é de texto (ex. um "mercado do dia de Americas" no `EventOrigin`), não de regra.
4. **A Fase 1 muda comportamento em produção.** Depois dela, a trava passa a ficar fechada em janelas em
   que hoje reabria sozinha. É o comportamento correto, mas é uma mudança percebível por quem usa: vale
   um aviso ao Rodrigo antes do deploy, não um rollback.
5. **`dayjs.tz.guess()` mente em navegador antigo ou com privacidade agressiva.** Nesses casos
   `parseTimezone` recusa e o app fica no fallback — degradação silenciosa e correta, nunca uma tela
   quebrada.

**O que este plano deliberadamente não faz**

- **Nenhuma migration, nenhum reprocessamento de scrap** (fatos 1 e 2). Se alguém achar que "os horários
  do banco estão errados", a resposta está no fato 2 — não estão.
- **Não muda `VLR_SOURCE_TZ`** nem o teste que o trava (`lib/vlr/normalize/kickoff.test.ts:29`).
- **Não muda nada em `/my-team`, `/ranking`, `db/close-round.ts`, `db/seed.ts` ou
  `lib/vlr/normalize/week.ts`** (`week.ts:19,26` usa `.utc()` de propósito: semana ISO é chave de
  agrupamento interna, não texto de tela).
- **Não torna o fechamento do mercado dependente do usuário.** É a linha que não se cruza.
- **Preferência manual de fuso no perfil** (Decisão G) — follow-up. Encaixa como primeiro item da
  precedência em `resolveTimezone`, sem refazer nada daqui.
- **`db/schema/auth.ts` com `timestamp` sem `withTimezone`** (fato 17) — pendência nomeada, não corrigida:
  é migration, e nenhuma dessas colunas é exibida como data ao usuário.
- **`formatClosesAt` continua sem chamador de tela** (fato 14). Ganha o parâmetro por consistência; se
  continuar órfã no próximo plano, o certo é apagá-la, não decorá-la.
- **Testes end-to-end (Playwright) de dois fusos simultâneos** — está na lista do `prompts/TODO.md` como
  item próprio; aqui a cobertura é RTL com o fuso injetado, mais a verificação manual do passo 4.
