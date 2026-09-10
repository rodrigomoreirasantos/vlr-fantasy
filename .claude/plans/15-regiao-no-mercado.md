# A região no mercado: o filtro que já existe, e a barra que passa a dizê-lo

## Context

`prompts/15_filter_player_region.md` pede cinco coisas do mercado. Conferidas contra o código, elas
se separam em dois grupos muito diferentes:

**Já implementado desde o plano 10 (nada a fazer):**

- _"SEMPRE somente players que atuam na região"_ — `getMarketByRole` filtra no SQL
  (`lib/team/queries.ts:242-246`, `eq(player.region, scope.region)`), `matchesScope` repete a regra
  no cliente (`lib/market/scope.ts:46-52`), e `market`+`scope` viajam juntos no mesmo `MarketData`,
  sem fallback `??` (`components/team/roster-panel.tsx:250-251`). A região sai do `slotId` relido do
  banco (`app/(app)/my-team/actions.ts:273-280`), nunca do cliente.
- _"NUNCA pode escalar um jogador que não atua na região"_ — `substitutePlayer` revalida
  `evaluateSubstitution` dentro da transação, com tudo relido do banco
  (`app/(app)/my-team/actions.ts:101-118`); `out-of-region` é um dos sete motivos de bloqueio
  (`lib/market/eligibility.ts:102`). Burlar a UI não passa pelo servidor.
- _"Internacional: os players que vão atuar em Champions e Masters"_ — o time Internacional recorta
  por **organização classificada** (`marketScopeFor`, `lib/market/scope.ts:25-33`;
  `qualifiedOrganizations`, `lib/round/international.ts:34-42`), que é a aproximação que o dado
  sustenta. Confirmado com o usuário: **fica como está**.

**O que muda de verdade:** a barra de resumo do mercado não diz em que região o usuário está. Hoje
ela é `Saldo | Pode gastar | Fecha em` (entregue nos planos 11 e 14), e o prompt pede que a célula
"MERCADO" vire a região.

**Resultado esperado:** ao abrir o mercado, o topo responde as três perguntas que decidem a
contratação — quanto tenho, quanto posso gastar e **de que região é este time** — sem perder o aviso
de que a janela está fechando.

## Decisões (respondidas pelo usuário)

| #   | Pergunta                                                                    | Decisão                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A célula do countdown vira região — e o countdown, morre?                    | A célula vira **Região** em destaque, com o tempo restante numa **sublinha discreta** (mesmo padrão da célula "Pode gastar", que já traz o crédito da venda embaixo).                |
| 2   | Internacional: por organização classificada ou só quem já jogou o torneio?   | **Por organização classificada** — a regra atual. "Quem vai atuar" só se sabe depois da partida (o scrap lê o scoreboard), então antes do torneio a org é a única proxy.             |

## Invariantes que não podem quebrar

- **A região exibida é a do TIME, não a do escopo.** `MarketScope` só carrega região no
  `kind: "region"`; no Internacional ele é `{kind:"organizations"}` e **não tem região**
  (`lib/market/scope.ts:16-33`). Derivar o rótulo do escopo funcionaria nos quatro times de liga e
  quebraria exatamente no quinto.
- **A barra é Server Component** (`market-summary-bar.tsx`, sem `"use client"`) e o
  `<MarketCountdown>` que ela embute é que é cliente. Manter assim.
- **Cor de região só por `regionColor()`** (`lib/round/regions.ts:229`), que devolve `var(--chart-N)`
  para ir num `style` — nunca classe de cor do Tailwind (regra do `CLAUDE.md`).
- **Os 33 testes de `market-sheet.test.tsx` renderizam o Sheet sem provider algum.** Qualquer fonte
  de região baseada em contexto (`useRegionDisplay`) quebraria todos eles — a região tem de chegar
  por prop.
- **`<MarketCountdown>` já é um `<p>`** (`components/market/market-countdown.tsx:67-71`), com
  `cn()` por baixo — a sublinha é um elemento **condicional**, nunca um `<p>` embrulhando outro
  (HTML inválido). Como usa `cn`, passar `className="text-[10px] …"` sobrescreve o
  `text-base font-extrabold text-primary` da base sem briga de especificidade.

---

## Fase 1 — a região chega até a barra (quatro arquivos, uma prop cada)

A região **do time** desce por prop, no caminho que já existe:

| Arquivo                                    | Mudança                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `app/(app)/my-team/page.tsx:67-74`          | `region={region}` no `<RosterPanel>` — a variável já está em mãos na linha 28                  |
| `components/team/roster-panel.tsx:25-33`    | `region: TeamRegion` em `RosterPanelProps`, repassada ao `<MarketSheet>` (`:246-261`)          |
| `components/market/market-sheet.tsx:49-74`  | `region: TeamRegion` em `MarketSheetProps`, repassada ao `<MarketSummaryBar>` (`:220-226`)     |
| `components/market/market-summary-bar.tsx`  | `region: TeamRegion` em `MarketSummaryBarProps`; a célula nova (Fase 2)                        |

**Por que não `MarketData`/`loadMarket`:** a região que a página resolveu (`resolveRegion`,
`page.tsx:28`) **é** a que gerou a consulta do elenco; `loadMarket` deriva a mesma região do slot,
que é do mesmo time. Uma segunda cópia no payload seria redundante e criaria a única coisa pior que
um dado ausente: duas fontes que podem divergir. (Nada aqui é como `balanceCents`/`lockedTeams`, que
envelhecem e por isso têm `marketData?.X ?? props.X`.)

**Por que não derivar de `scope`:** funcionaria nos quatro times de liga e quebraria no Internacional
— `{kind:"organizations"}` não tem região.

**Por que não `useRegionDisplay()`:** de graça no cliente, mas quebra os 33 testes que renderizam o
Sheet sem provider.

## Fase 2 — a célula: região em destaque, fechamento na sublinha

**Muda:** `components/market/market-summary-bar.tsx` (a terceira célula, hoje `:85-103`)

```tsx
<Stat label="Região">
  <p
    className="truncate text-sm font-extrabold uppercase"
    style={{ color: regionColor(region) }}
  >
    {regionLabel(region)}
  </p>

  {marketOpen && closesAt ? (
    <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground">
      <span>Fecha em</span>
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown={closesIn}
        formatter={formatTimeLeft}
        className="text-[10px] font-semibold text-muted-foreground normal-case"
      />
    </div>
  ) : (
    <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
      {marketOpen ? closesIn : "Mercado fechado"}
    </p>
  )}
</Stat>
```

- O rótulo da célula deixa de ser condicional (`"Fecha em"`/`"Mercado"`) e passa a ser **sempre**
  `"Região"` — o que está embaixo é detalhe, não o assunto da célula.
- **`"Fecha em"` é um nó irmão, nunca concatenado no formatter.** Três motivos, todos concretos:
  (a) `<MarketCountdown>` renderiza um `<p>` (`market-countdown.tsx:66-83`), então concatenar exigiria
  um `<p>` externo — `<p>` dentro de `<p>` é HTML inválido e dá erro de hidratação; (b) um formatter
  inline (`(d) => "Fecha em " + formatTimeLeft(d)`) entra como **dependência do `useEffect`**
  (`market-countdown.tsx:57-64`) e recria o `setInterval` a cada render; (c) com o nó separado, o
  `<time>` continua contendo exatamente `"36h 12m"`, e os `getByText` exatos que já existem sobrevivem
  sem edição.
- **`"Fechado"` vira `"Mercado fechado"`.** Hoje a palavra solta funciona porque o rótulo da célula é
  "Mercado"; com o rótulo virando "Região", um "Fechado" embaixo de "AMERICAS" fica sem sujeito —
  parece dizer que a região fechou. É a única mudança de texto deliberada, e ela quebra um assert.
- `truncate` não é decoração: `"Internacional"` tem 13 caracteres num terço de um Sheet `sm:max-w-lg`.
  Daí também `text-sm` (e não o `text-base` das duas células de dinheiro).
- Texto colorido **sem bolinha**, seguindo `team-stats.tsx:57-64` — a bolinha de `region-switcher`/
  `region-tabs` só existe onde o texto é neutro; aqui ela seria redundância.
- A sublinha perde o `text-primary` que o countdown tinha (`:91`): a hierarquia da célula passou para
  a região. Se um dia quiser urgência de volta, o mínimo é `text-primary` só abaixo de 1h — não agora.
- **A contagem de colunas não muda:** a célula de região sempre renderiza, então continua
  `grid-cols-3` com `outgoing` e `grid-cols-2` na vaga vazia (`:62-68`).

## O que NÃO fazer: esconder `out-of-region`

Registrado porque é a tentação óbvia diante do "**NUNCA** pode escalar" do prompt — e porque foi
considerado e **rejeitado**, com três razões:

1. **Seria um no-op na tela.** `market` e `scope` saem do mesmo `MarketData`, produzidos pela mesma
   chamada, e o `RosterPanel` passa os dois sem `??` — nunca há catálogo novo com escopo velho. Como
   o `WHERE` e `matchesScope` são a mesma regra, `out-of-region` é inalcançável para itens da lista.
2. **Enfraquece a invariante do plano 14.** Lá, **só** `market-closed` esconde — e é isso que torna
   verdadeira a frase "Nenhum {role} com mercado aberto agora" (`market-sheet.tsx:411`). Com dois
   motivos escondendo, aquela frase passa a poder mentir.
3. **Inverte o modo de falha.** Se um dia a query afrouxar, hoje o usuário vê cards "Fora da região"
   bloqueados — sintoma legível. Escondendo, veria abas vazias sem explicação.

E o "NUNCA" não depende disso: a garantia está na Server Action, que reavalia dentro da transação com
tudo relido do banco e devolve `ActionError` (`app/(app)/my-team/actions.ts:101-118`). Esconder card
no cliente nunca é fronteira de segurança. **`lib/market/ordering.ts` não é tocado nesta feature.**

## Testes

**A decisão da sublinha (decisão 1) é o que mantém a suíte quase intacta.** Como `closesIn`/`closesAt`
continuam sendo exibidos, só as asserções que dependiam do **rótulo condicional** quebram:

| Arquivo:linha                        | Estado                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `market-summary-bar.test.tsx:27-40`   | **Passa sem edição.** `getByText("Fecha em")` acha o `<span>` irmão novo (mesmo texto, lugar diferente) e `"7h 0m"` continua no `<time>`. Nenhuma das duas asserções olha o rótulo da célula    |
| `market-summary-bar.test.tsx:42-55`   | **Quebra**: `getByText("Mercado")` não acha mais nada — o rótulo virou `"Região"` e o ramo sem `closesAt` não tem mais a palavra "Mercado" em lugar nenhum. `"Nenhum jogo marcado"` sobrevive    |
| `market-summary-bar.test.tsx:57-69`   | **Quebra**: `getByText("Fechado")` não bate com `"Mercado fechado"` (match exato) — precisa virar o literal novo                                                                               |
| `market-summary-bar.test.tsx:71-103`  | **Passam** — "Pode gastar" e a vaga vazia não dependem da terceira célula                                                                                                                       |
| `market-sheet.test.tsx:873`           | **Passa** — `getByText("36h 12m")` continua achando o `<time>`, agora como nó irmão                                                                                                             |
| `roster-panel.test.tsx:186-187`       | **Passa** — o teste de regressão do plano 11 (`closesAt: null` do servidor não cai no valor velho da página) mantém o alvo intacto: `"Nenhum jogo marcado"` renderiza como nó próprio no ramo `!closesAt`, e `queryByText("36h 12m")` continua `null` |

**Churn mecânico, e é o maior custo do plano:** `region` é prop obrigatória, então **todo** call site
de teste precisa da linha nova — **33** renders em `market-sheet.test.tsx`, **19** em
`roster-panel.test.tsx` e **5** em `market-summary-bar.test.tsx` (contados, não estimados). É
repetitivo, mas seguro: o TypeScript aponta um por um, e nenhum exige pensar. Por ser tão mecânico e
tocar tantos arquivos, vale um **commit isolado** — só as linhas de prop nova — separado do commit que
muda comportamento (a célula). Se incomodar, um helper `renderSheet(overrides)` no arquivo maior é
melhoria real, mas opcional e fora do escopo do pedido.

**Novos:**

- `market-summary-bar.test.tsx`: **reforçar** o teste de `:27-40` com `getByText("Região")` (hoje ele
  passa por acidente, sem provar que o rótulo é o certo) e `toHaveStyle({ color: regionColor(region) })`
  no valor; um caso para `region="international"` → `getByText("Internacional")` na cor `--chart-1`
  (o caso que provaria um desenho errado que derivasse a região do `scope`, já que ali não haveria de
  onde tirá-la); a vaga vazia continua com duas células, a segunda sendo a região.
- `market-sheet.test.tsx` — **o teste que trava a armadilha central do plano**: escopo por
  organizações (`{kind:"organizations", organizations:[...]}`, como o time Internacional) com
  `region="international"` → a barra mostra `"Internacional"`. Falha na hora se alguém trocar a fonte
  da prop por `scope` (que não tem região nesse `kind`).
- `roster-panel.test.tsx`: a região passada à página chega até a barra do Sheet (`region="emea"`,
  abrir uma vaga, `getByText("EMEA")`) — amarra o caminho de props inteiro.

## Verificação

1. `pnpm exec vitest run components/market components/team lib/market`, depois `pnpm test` inteiro
   (`lib/vlr/persist/rounds.test.ts` já falha por conta própria, sensível à data — não é regressão).
2. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec prettier --write .`.
3. `pnpm dev` → `/my-team`: abrir uma vaga em Americas e conferir que o topo diz **AMERICAS** na cor
   da região, com "Fecha em" + o relógio embaixo; trocar para EMEA pelas abas e reabrir — a célula
   acompanha e o catálogo muda junto; conferir que nenhum jogador de outra liga aparece na lista (é o
   que o plano 10 já garantia); e, se houver Masters/Champions no calendário, abrir o time
   **Internacional** e confirmar que a célula diz "Internacional" mesmo com zero organizações
   classificadas (abas vazias, célula correta — feio, mas honesto).

## Riscos e o que fica de fora

- **O mercado internacional é a organização inteira.** Entram todos os jogadores ativos cujo
  `player.team` bate com uma org classificada — reservas, academy e quem não vai a Champions
  inclusive, porque o `WHERE` do ramo `organizations` filtra por `player.team` e não olha
  `player.region`. É a aproximação aceita na decisão 2; o dado não sustenta "quem vai atuar" antes da
  partida acontecer (o scrap lê o scoreboard **depois** do jogo, e não há tabela de inscrição no
  schema).
- **Acoplamento por string exata** entre `player.team` e `match.teamA/teamB` — risco já registrado em
  `.claude/plans/10-time-por-regiao.md:348`: se o scoreboard grafar a organização diferente da lista,
  **o mercado internacional fica vazio** para ela. Não é criado por este plano, mas a célula nova
  torna o sintoma mais confuso: "INTERNACIONAL" em destaque no topo, quatro abas vazias embaixo.
- **Jogador com `player.region === "other"`** (o scrap ainda não resolveu a liga dele) some dos
  quatro mercados regionais, mas **continua aparecendo no Internacional**, onde o filtro é por
  organização. Coerente com a regra, mas é o tipo de coisa que parece bug para quem olha de fora.
- **A região passa a aparecer em três lugares na mesma tela** — header (`RegionSwitcher`), card
  "Região" do `TeamStats` e agora a barra do Sheet. Redundância deliberada: o Sheet cobre o header no
  mobile, e o pedido é justamente ver a região *dentro* do mercado.
- **O countdown perde o destaque em vermelho** que tinha (`text-primary` → `text-muted-foreground`),
  consequência direta da decisão de sublinha discreta. O relógio "de peso" continua em `TeamStats` e
  no `<LiveRefresh>` da página.
- **Não entra neste plano:** mudar a regra do Internacional; filtro por região *dentro* do mercado
  internacional (chips por liga, que fariam sentido lá porque o catálogo mistura as quatro); esconder
  `out-of-region` (rejeitado acima, com justificativa); mensagem dedicada para "torneio internacional
  sem organizações classificadas"; adicionar `region` a `MarketData`; qualquer mudança em schema,
  migration, query ou Server Action — esta feature é exibição, sem nenhuma trava nova no domínio.
