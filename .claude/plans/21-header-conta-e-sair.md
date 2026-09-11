# Menu de conta no header: o `@nick` no lugar da saudação, "Sair" dentro dele

## Context

`prompts/21_header_style_exit_button.md` pede uma coisa só, em uma frase: usar o padrão de design
do projeto (skills `web-design-guidelines` e `frontend-design`) para refazer, **no header**, o
**botão de sair** e o **nickname do usuário**, "seguindo um design como o do website".

O que o código diz e que muda o pedido:

1. **O bloco existe e é o canto direito do header.** `components/layout/app-header.tsx:107-112`:
   `Olá, {userName}` em `text-muted-foreground` + `<SignOutButton />`. É o único lugar do app
   onde `SignOutButton` é usado (`app-header.tsx:7` é o único import —
   `grep -rn "SignOutButton"` não acha mais nada) e **não existe** `sign-out-button.test.tsx`
   (`ls components/auth/`). Absorver esse botão não deixa nada órfão nem descoberto.

2. **O header não mostra o nickname hoje — mostra o nome de exibição.** O layout passa
   `userName={session.user.name}` (`app/(app)/layout.tsx:58`), que é o campo editável em
   `/profile` (`components/profile/account-panel.tsx`, `authClient.updateUser({ name })`;
   montado em `app/(app)/profile/page.tsx:128`). O **nickname** é outra coisa: `user.username`,
   do plugin `username` do better-auth (`lib/auth.ts:131`), imutável por decisão do plano 06
   (`.claude/plans/06-aba-perfil.md:42-44`), e é o identificador que o resto do app usa —
   `@${row.username}` na classificação (`components/championship/standings-table.tsx:81`) e na
   lista de amigos (`components/profile/friends-list.tsx:69`). **O header é hoje o único lugar
   do app que chama o usuário por um nome que não é o handle.** Este é o ponto central do
   pedido: não é "estilizar o nick", é **passar a mostrá-lo**.

3. **Nome do time e nome de exibição já se parecem demais no header.** O nome do time nasce do
   `@login` (`ensureFantasyTeam(user.id, assignedUsername ?? user.name)`, `lib/auth.ts:123`, e
   plano 06 §2.3), então o header exibe hoje, lado a lado, "rodrigo" (time, `app-header.tsx:61-63`)
   e "Rodrigo" (saudação, `:108-110`) — duas variações do mesmo texto, e **nenhuma** delas é o
   handle. Trocar a saudação pelo `@rodrigo` não acrescenta um terceiro nome: substitui o mais
   redundante dos dois pelo que de fato identifica a pessoa.

4. **O peso visual está invertido.** O "Sair" é `Button variant="outline"` no tamanho padrão
   (`components/auth/sign-out-button.tsx:21-28`): borda + fundo próprio, altura 32px, no canto
   mais alto da tela. É o elemento com mais presença do header depois do logo — e é a ação que
   ninguém quer executar por engano. Clicou, saiu, sem confirmação (`:13-18`).

5. **A peça do padrão "menu de conta" já está instalada e já tem precedente no header.**
   `components/ui/dropdown-menu.tsx` existe, com `DropdownMenuLabel` (`:161`),
   `DropdownMenuSeparator` (`:181`) e `DropdownMenuItem` com `variant="destructive"` (`:63-84`,
   o `data-[variant=destructive]` vem pronto). O `RegionSwitcher`
   (`components/layout/region-switcher.tsx`) já é um dropdown **dentro do header**, com teste
   passando (`components/layout/region-switcher.test.tsx`) e os stubs de Radix necessários no
   jsdom já prontos em `vitest.setup.ts:16-45`. Nada de novo precisa ser instalado.

6. **Avatar com a foto do usuário não funciona hoje.** `Avatar` existe no shadcn (confirmado via
   Context7, `/websites/ui_shadcn` → `npx shadcn add avatar`, com `AvatarImage`/`AvatarFallback`),
   e `user.image` existe na tabela (`db/schema/auth.ts:16`) e vem preenchido pelo Google. Mas
   `next.config.ts:4-18` só libera `owcdn.net/img/**` (e com `search: ""`, de propósito): um
   `next/image` apontando para `lh3.googleusercontent.com` **quebra em runtime**. Ou seja,
   qualquer avatar neste plano é marca (monograma), não retrato — a menos que se libere um host
   novo, o que é outra decisão, com outro custo.

7. **`username` é `string | null` no tipo.** O `customSyntheticUser` de `lib/auth.ts:56-65` nasce
   com `username: null`, e o resto do app já convive com isso (`session.user.username ??
session.user.name` em `app/(app)/layout.tsx:33`, `home/page.tsx:31`, `profile/page.tsx:51`,
   `ranking/page.tsx:75`). Na prática todo usuário real recebe um handle no hook
   `user.create.after` (`lib/auth.ts:102-123`), mas o header precisa do fallback mesmo assim.

8. **"Perfil" já é uma seção da navegação** (`app-header.tsx:20`, com `aria-current` por
   `pathname.startsWith`). Um item "Perfil" dentro do menu de conta seria a segunda porta para a
   mesma tela, a 200px de distância da primeira.

9. **O header não tem nada responsivo além do `flex-wrap`** (`app-header.tsx:50`): em tela
   estreita os três blocos empilham, e navegação mobile foi deliberadamente deixada de fora pelo
   plano 12 (`.claude/plans/12-header-saldo-e-regiao.md:458-460`). Este plano não reabre isso —
   só garante que a peça nova não piore a situação.

10. **Nada aqui toca banco.** Não há saldo, rodada, mercado nem data envolvidos: nenhuma
    migration, nenhuma `db.transaction`, nenhuma Server Action nova (logo, `next-safe-action`
    não entra), nenhum formulário (logo, React Hook Form + Zod não entram), nenhum `dayjs`. O
    `signOut` continua sendo chamada de cliente do better-auth (`lib/auth-client.ts:10`).

**Resultado esperado:** no canto direito de qualquer tela logada, no lugar de "Olá, Rodrigo" +
botão "Sair", fica um gatilho discreto com o monograma chanfrado e o `@rodrigo`. Clicando, abre um
menu ancorado à direita que mostra o nome de exibição, o `@login` e uma única ação — "Sair", em
vermelho —, que exibe "Saindo…" enquanto encerra a sessão e devolve o usuário ao `/login`.

## Suposições (entrevista rodada contra o código — não houve canal com o usuário)

Este agente roda sem `AskUserQuestion` disponível, então a entrevista foi feita contra o código.
Cada linha é **suposição**, não decisão fechada: vem com a alternativa descartada e o motivo, para
virar pergunta de uma linha.

| #   | Pergunta                                         | Suposição adotada                                                                                                                                                                                                                                             | Alternativa descartada e por quê                                                                                                                                                                                     |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | O que exatamente muda no header?                 | **Só o bloco da direita** (saudação + Sair) vira um menu de conta. Logo, brasão + nome do time, saldo, `RegionSwitcher` e a nav ficam **intactos**.                                                                                                              | Redesenhar o header inteiro — o plano 12 acabou de desenhá-lo (`.claude/plans/12-header-saldo-e-regiao.md`) e o prompt cita duas peças, não cinco. Mexer no resto é reabrir decisão vigente sem pedido.                     |
| 2   | "Sair" vira item de menu ou continua botão?      | **Item de um `DropdownMenu`** cujo gatilho é a identidade do usuário — é literalmente o "design como o do website" (padrão de menu de conta) e resolve o fato 4: a ação destrutiva sai da superfície e passa a exigir dois passos.                                | Manter botão solto, só reestilizado (`variant="ghost"` + ícone). Custa menos, mas deixa o nick sem casa e mantém logout a um clique acidental de distância.                                                                 |
| 3   | O nick **substitui** ou **acompanha** o nome do time? | **Acompanha, em outro canto.** Nome do time continua à esquerda (com brasão); o `@nick` passa a ser a identidade da **pessoa**, à direita. Quem sai é a saudação "Olá, {nome de exibição}" (fato 3).                                                       | Trocar o nome do time pelo `@nick` à esquerda — o brasão e o nome do time são a identidade do **time** (`fantasy_identity`), usada em ranking e amigos; apagá-la do header quebraria o elo com o resto do app.               |
| 4   | O gatilho tem avatar?                            | **Monograma chanfrado** com a inicial do `@login`: quadrado `clip-corner` `[--clip:5px]`, `bg-primary/15` + `text-primary`. Dá alvo e âncora ao canto direito usando a assinatura visual do produto, sem rede e sem `next/image`.                                | (a) Foto do Google — impossível sem liberar host novo (fato 6); (b) repetir o `<TeamCrest>` — ele já está no header, a 3 blocos de distância, e passaria a significar duas coisas; (c) sem nada, só texto + chevron.         |
| 5   | O que mais entra no menu além de "Sair"?         | **Nada.** Rótulo de identidade (nome de exibição + `@login`), separador, e a ação "Sair". Um item por vez: o menu tem um trabalho só.                                                                                                                            | Acrescentar "Perfil" — é a segunda porta para a mesma tela que já tem item na nav (fato 8). Se um dia o menu precisar crescer (ex.: "Sair de todos os dispositivos"), o `DropdownMenuLabel` + separador já estão lá.        |
| 6   | O texto da ação                                  | **"Sair"**, com ícone `LogOut`, voz ativa, mesmo termo de hoje — o menu já está rotulado com a conta, então "Sair da conta" repetiria o contexto.                                                                                                                | "Sair da conta" / "Encerrar sessão" — mais específicos, mais compridos, e mudam vocabulário já estabelecido.                                                                                                              |
| 7   | Confirmação antes de sair?                       | **Não.** O menu já são dois passos e a ação é reversível (basta entrar de novo). O que entra é o **estado de saída**: o item vira "Saindo…" e ignora clique repetido.                                                                                            | `Dialog` de confirmação — três passos para uma ação sem perda de dado; ruído.                                                                                                                                             |
| 8   | O menu fecha na hora do clique?                  | **Não:** `onSelect` com `event.preventDefault()`, para o item poder mostrar "Saindo…" até o `router.push("/login")` acontecer. Sem isso o menu some antes do feedback e um segundo clique dispararia outro `signOut`.                                            | Deixar fechar (padrão do Radix) — mais simples, mas o usuário fica sem nenhum sinal entre o clique e o redirecionamento, que depende de uma chamada de rede.                                                               |
| 9   | Fallback quando `username` é `null` (fato 7)     | **Gatilho e rótulo caem no nome de exibição**, sem `@`. Nada de "@null", nada de bloco vazio.                                                                                                                                                                     | Esconder o menu inteiro (deixaria o usuário sem como sair) ou inventar um handle na hora (mentira na tela).                                                                                                                |
| 10  | O que acontece no mobile?                        | Abaixo de `sm`, **o gatilho fica só com o monograma** (o texto do `@nick` some via `hidden sm:inline`); o `aria-label` continua com o handle e o nome completo aparece no rótulo do menu ao abrir. Altura do botão segue 32px — acima do mínimo de alvo de toque. | Deixar o `@nick` sempre visível — em nick de 20 caracteres (`maxUsernameLength: 20`, `lib/auth.ts:131`) o bloco empurra a nav para outra linha em qualquer telefone.                                                        |
| 11  | A prop `userName` do header sobrevive?           | **Vira duas props explícitas:** `displayName` (o `user.name`) e `username` (`string \| null`). O nome `userName` é exatamente a ambiguidade do fato 2 e some.                                                                                                     | Manter `userName` e acrescentar `username` — dois nomes quase idênticos na mesma assinatura; quem ler daqui a um mês erra.                                                                                                 |
| 12  | `components/auth/sign-out-button.tsx` fica?      | **Some**, absorvido pelo `AccountMenu`. Único consumidor era o header, e não há teste dele (fato 1).                                                                                                                                                              | Manter e renderizar dentro do item com `asChild` — `<Button>` dentro de `DropdownMenuItem` empilha dois conjuntos de estilo de foco e dois `role`; a lógica é de 6 linhas, não vale o componente intermediário.             |

## Fase 1 — `AccountMenu`: o menu de conta, isolado e testado

Nasce sozinho, sem depender do header — é o que permite testá-lo com RTL antes de plugar.

**Arquivos**

- **Novo:** `components/layout/account-menu.tsx`
- **Novo:** `components/layout/account-menu.test.tsx`

```tsx
"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

export type AccountMenuProps = {
  /** `user.name` — o nome de exibição, editável em `/profile`. */
  displayName: string;
  /**
   * `user.username` — o `@login` imutável (plano 06). É `null` no tipo por
   * causa do `customSyntheticUser` (`lib/auth.ts:56-65`); na prática todo
   * usuário real recebe um em `user.create.after`.
   */
  username: string | null;
};

/**
 * A identidade da **pessoa** no header — distinta do brasão + nome do **time**,
 * que ficam à esquerda. O logout mora aqui dentro de propósito: é a única ação
 * destrutiva do header e não deveria estar a um clique de distância.
 */
export function AccountMenu({ displayName, username }: AccountMenuProps) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const handle = username ? `@${username}` : displayName;
  const initial = (username ?? displayName).charAt(0).toUpperCase();

  async function signOutAndLeave() {
    if (isLeaving) return;
    setIsLeaving(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Abrir menu da conta (${handle})`}
          className="gap-2 pl-1"
        >
          <span
            aria-hidden
            className="clip-corner flex size-6 items-center justify-center bg-primary/15 text-[11px] font-bold text-primary [--clip:5px]"
          >
            {initial}
          </span>
          {/* Em tela estreita sobra só o monograma — nick de 20 caracteres
              empurraria a nav para outra linha (suposição 10). */}
          <span className="hidden text-[13px] font-semibold sm:inline">
            {handle}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-semibold text-foreground">
            {displayName}
          </span>
          {username && (
            <span className="text-xs text-muted-foreground">@{username}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          aria-disabled={isLeaving}
          className="cursor-pointer"
          onSelect={(event) => {
            // Segura o menu aberto: sem isto o item some antes do "Saindo…"
            // aparecer, e um segundo clique dispararia outro signOut.
            event.preventDefault();
            void signOutAndLeave();
          }}
        >
          <LogOut aria-hidden />
          {isLeaving ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Detalhes que **não** são opcionais:

- `cursor-pointer` no item: o `DropdownMenuItem` traz `cursor-default` no estilo base
  (`components/ui/dropdown-menu.tsx:77`) — mesmo ponto já resolvido no `RegionSwitcher`
  (`region-switcher.tsx:45`).
- Foco visível vem do `buttonVariants` (`focus-visible:ring-3 focus-visible:ring-ring/50`,
  `components/ui/button.tsx:8`) — por isso o gatilho é um `<Button asChild>` e não um
  `<DropdownMenuTrigger>` cru como o do `RegionSwitcher`.
- `aria-disabled` em vez de `disabled`: o item continua focável enquanto sai, e o guard
  `if (isLeaving) return` é quem impede a segunda chamada. `disabled` do Radix tiraria o foco do
  elemento no meio da interação.
- Zero cor literal: `bg-primary/15`, `text-primary`, `text-muted-foreground`, `text-foreground` —
  todas variáveis de `app/globals.css` (regra do `CLAUDE.md`).
- Nenhuma animação nova: a entrada/saída do menu já vem do `tw-animate-css` do shadcn, que
  respeita `prefers-reduced-motion`.

**Testes** (`components/layout/account-menu.test.tsx`, RTL + `userEvent`, no padrão de
`region-switcher.test.tsx`; mocks de `next/navigation` e `@/lib/auth-client`, banco nem aparece):

1. o gatilho tem nome acessível `Abrir menu da conta (@rodrigo)` e mostra o texto `@rodrigo`;
2. abrindo o menu, aparecem o nome de exibição (`Rodrigo Santos`) e o `@rodrigo` no rótulo;
3. clicar em "Sair" chama `signOut` uma vez e, resolvido, chama `router.push("/login")`;
4. enquanto o `signOut` não resolve (promise controlada por um `resolve` guardado no teste), o
   item mostra "Saindo…" e um **segundo** clique não chama `signOut` de novo — a prova da
   suposição 8;
5. com `username={null}`, o gatilho cai no nome de exibição, o `aria-label` não tem `@` e o
   rótulo do menu não renderiza a linha do handle.

**Como verificar:** `pnpm test components/layout/account-menu.test.tsx`.

## Fase 2 — o header usa o menu e a saudação sai

**Arquivos**

- **Muda:** `components/layout/app-header.tsx`
- **Muda:** `components/layout/app-header.test.tsx`
- **Muda:** `app/(app)/layout.tsx`
- **Apagado:** `components/auth/sign-out-button.tsx` (suposição 12)

Em `app-header.tsx`:

1. `AppHeaderProps`: `userName: string` vira `displayName: string` + `username: string | null`
   (suposição 11), com comentário curto dizendo qual é qual — é o fato 2 registrado no código.
2. O bloco `:107-112` inteiro vira:

```tsx
<AccountMenu displayName={displayName} username={username} />
```

   O `<div className="flex items-center gap-4">` some junto: sobra um filho só, e o
   `justify-between` do `<header>` já posiciona.
3. Import de `SignOutButton` sai; entra `AccountMenu`.

Em `app/(app)/layout.tsx:55-60`:

```tsx
<AppHeader
  teamName={overview.summary.name}
  crest={overview.summary.crest}
  displayName={session.user.name}
  username={session.user.username ?? null}
  available={available}
/>
```

O `?? null` existe porque o plugin `username` tipa o campo como `string | null | undefined` — e
`undefined` numa prop obrigatória é erro de tipo, não `null`. Nada de `any` em lugar nenhum.

**Testes** (`components/layout/app-header.test.tsx`):

- `renderHeader` (`:29-44`) passa `displayName="Rodrigo"` e `username="rodrigo"` no lugar de
  `userName`;
- o teste `:113-124` ("mostra o nome do time, o brasão, o saldo e a saudação") vira
  "…, o saldo e o menu de conta": nome do time, brasão e `148.2` seguem iguais; entram
  `expect(screen.queryByText(/olá/i)).not.toBeInTheDocument()` e
  `expect(screen.getByRole("button", { name: /abrir menu da conta \(@rodrigo\)/i })).toBeInTheDocument()`;
- novo caso: **não existe mais um botão "Sair" solto no header** —
  `expect(screen.queryByRole("button", { name: /^sair$/i })).not.toBeInTheDocument()` (ele só
  aparece depois de abrir o menu). É o que prova que o botão migrou em vez de ter sido duplicado;
- o mock de `@/lib/auth-client` (`:12-14`) continua necessário — agora por causa do `AccountMenu`.

**Como verificar:** `pnpm test components/layout`, `pnpm exec tsc --noEmit` (o compilador acha
sozinho qualquer sobra de `userName`), `pnpm lint`. Na tela: `pnpm dev`, abrir `/home`, conferir
que o canto direito tem o monograma + `@nick`, abrir o menu, sair, cair em `/login`; voltar e
repetir apertando `Tab` até o gatilho, `Enter` para abrir, `↓` até "Sair", `Esc` para fechar (o
foco tem de voltar ao gatilho).

## Fase 3 — passada pelas diretrizes de interface

Checklist executável, aplicado ao que as fases 1 e 2 produziram. Cada item é uma verificação, não
uma investigação: se algum falhar, o conserto está descrito.

- **Alvo de clique:** o gatilho é `Button` tamanho padrão (`h-8`, 32px de altura,
  `components/ui/button.tsx:34-35`), acima do mínimo de 24px, inclusive no mobile onde sobra só o
  monograma. Não reduzir para `size="sm"`.
- **Foco visível sobre `bg-sidebar`:** o anel é `ring-ring/50` (`--ring: #ff4655`) sobre
  `--sidebar: #101215` — conferir a olho no `pnpm dev`; se ficar apagado, o ajuste é
  `focus-visible:ring-offset-2`, nunca uma cor literal.
- **Nome acessível em pt-BR:** `Abrir menu da conta (@rodrigo)` no gatilho; o monograma é
  `aria-hidden` (a inicial já está no rótulo). Nenhuma string em inglês chega ao usuário.
- **Teclado:** `Enter`/`Espaço` abrem, setas navegam, `Esc` fecha devolvendo o foco — tudo do
  Radix; a única coisa que poderia quebrar isso é trocar `aria-disabled` por `disabled`
  (suposição 7/8).
- **Estado de saída anunciado:** o texto do item muda para "Saindo…" — mesma linguagem do resto do
  app (`components/profile/account-panel.tsx` usa "Salvando…").
- **Hierarquia:** nenhum elemento do canto direito compete com o logo; o único ponto de vermelho
  novo é o monograma a 15% e o item destrutivo ao abrir o menu.
- **Sem cor hard-coded, sem `any`, sem data** — `pnpm lint` cobre parte; a leitura do diff cobre o
  resto.

**Como verificar:** `pnpm lint && pnpm test components/layout && pnpm build`.

## Riscos e o que fica de fora

- **Foto de perfil real continua impossível** (fato 6). Se um dia o avatar tiver de virar retrato,
  são três coisas juntas: liberar o host em `next.config.ts`, instalar o `Avatar` do shadcn e
  decidir o que fazer com quem entrou por e-mail/senha e não tem `image`. Fora deste plano de
  propósito — o monograma cobre 100% dos usuários hoje.
- **`username` nulo** (fato 7) degrada silenciosamente para o nome de exibição. Quem cair nesse
  caso vê um header sem `@` — aceitável, e improvável fora de conta sintética.
- **Sair continua sem confirmação** (suposição 7). Se aparecer relato de logout acidental, o
  conserto é um `Dialog`, não desfazer este plano.
- **O header continua com nome do time e `@nick` parecidos** para quem nunca renomeou o time
  (fato 3) — "rodrigo" à esquerda, "@rodrigo" à direita. O plano não renomeia time de ninguém;
  se incomodar, a saída é o editor de nome que já existe em `/profile`.
- **Navegação mobile segue fora do escopo** (fato 9): o header continua `flex-wrap`, empilhando em
  tela estreita. Este plano só garante que o bloco novo é o mais estreito dos três.
- **Nada de banco, saldo, pontuação ou Server Action** (fato 10): nenhuma migration, nenhuma
  `db.transaction`, nenhum uso de `next-safe-action`, `lib/scoring/` intocado.
