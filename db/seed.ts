import "dotenv/config";

import dayjs from "dayjs";
import { and, count, eq, isNull } from "drizzle-orm";

import { db, pool } from "@/db";
import { closeActiveRound } from "@/db/close-round";
import {
  fantasyTeam,
  match,
  player,
  round,
  rosterSlot,
  user,
} from "@/db/schema";
import { assignUniqueUsername } from "@/lib/auth/username";
import type { LeagueRegion } from "@/lib/round/regions";
import { ensureFantasyTeam } from "@/lib/team/queries";
import type { PlayerAvailability, PlayerRole } from "@/lib/team/types";

/**
 * Catálogo de demonstração: 6 jogadores por função, preços na faixa
 * 20,0–90,0 créditos (Decisão 2, `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`)
 * — nenhum consome sozinho o orçamento inicial de 300,0 (é a regra), mas
 * contratar mais de um "caro" por função já aperta o saldo de verdade. Os
 * cinco primeiros reproduzem o roster do antigo `lib/team/placeholder.ts`,
 * para a tela continuar reconhecível.
 *
 * A maioria fica `available` (o default da coluna, por isso omitido). Um
 * punhado ganha disponibilidade variada — dois de banco, dois lesionados e
 * dois eliminados, estes últimos quatro com nota em pt-BR — para os alertas
 * da Home (`lib/home/summary.ts`) aparecerem de verdade num ambiente de
 * desenvolvimento novo. `TenZ` e `Sacy` estão no `REFERENCE_ROSTER` abaixo,
 * então o alerta já aparece na escalação de qualquer conta nova.
 *
 * **`region`**: a liga de cada jogador (`.claude/plans/10-time-por-regiao.md`)
 * — em produção ela nasce do scrap (`lib/vlr/persist/player-regions.ts`),
 * mas o seed não tem partidas de liga para derivá-la, então é atribuída à
 * mão, coerente com o `team` de cada um e com `MATCH_PAIRINGS` abaixo. Pelo
 * menos 5 jogadores por liga — o mínimo para cada uma das 5 abas de
 * escalação nascer montável num ambiente de desenvolvimento novo.
 */
const PLAYERS: {
  nickname: string;
  team: string;
  agent: string;
  role: PlayerRole;
  region: LeagueRegion;
  priceCents: number;
  score: number;
  availability?: PlayerAvailability;
  availabilityNote?: string;
}[] = [
  // Duelistas
  {
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    region: "americas",
    priceCents: 4120,
    score: 18.2,
    availability: "injured",
    availabilityNote: "Fora por lesão no pulso",
  },
  {
    nickname: "Derke",
    team: "FNATIC",
    agent: "Raze",
    role: "Duelista",
    region: "emea",
    priceCents: 4600,
    score: 15.8,
  },
  {
    nickname: "Jamppi",
    team: "Team Liquid",
    agent: "Reyna",
    role: "Duelista",
    region: "emea",
    priceCents: 2650,
    score: 11.5,
  },
  {
    nickname: "yay",
    team: "EDward Gaming",
    agent: "Neon",
    role: "Duelista",
    region: "china",
    priceCents: 5170,
    score: 13.7,
  },
  {
    nickname: "Aspas",
    team: "LEVIATÁN",
    agent: "Iso",
    role: "Duelista",
    region: "americas",
    priceCents: 5420,
    score: 20.1,
  },
  {
    nickname: "Demon1",
    team: "NRG",
    agent: "Yoru",
    role: "Duelista",
    region: "americas",
    priceCents: 9000,
    score: 22.9,
  },

  // Iniciadores
  {
    nickname: "Sacy",
    team: "LOUD",
    agent: "Skye",
    role: "Iniciador",
    region: "americas",
    priceCents: 3140,
    score: 9.4,
    availability: "bench",
    availabilityNote: "Preparando a estreia do substituto",
  },
  {
    nickname: "Mazino",
    team: "DRX",
    agent: "Fade",
    role: "Iniciador",
    region: "pacific",
    priceCents: 2490,
    score: 7.2,
  },
  {
    nickname: "Trent",
    team: "Bilibili Gaming",
    agent: "Breach",
    role: "Iniciador",
    region: "china",
    priceCents: 2160,
    score: 5.8,
  },
  {
    nickname: "BuZz",
    team: "DRX",
    agent: "KAY/O",
    role: "Iniciador",
    region: "pacific",
    priceCents: 3710,
    score: 12.9,
  },
  {
    nickname: "Zekken",
    team: "SENTINELS",
    agent: "Sova",
    role: "Iniciador",
    region: "americas",
    priceCents: 7700,
    score: 19.6,
  },
  {
    nickname: "FNS",
    team: "Evil Geniuses",
    agent: "Gekko",
    role: "Iniciador",
    region: "americas",
    priceCents: 2000,
    score: 4.3,
  },

  // Controladores
  {
    nickname: "Boaster",
    team: "FNATIC",
    agent: "Astra",
    role: "Controlador",
    region: "emea",
    priceCents: 3470,
    score: 24.6,
  },
  {
    nickname: "Xeppaa",
    team: "Cloud9",
    agent: "Omen",
    role: "Controlador",
    region: "americas",
    priceCents: 2730,
    score: 9.1,
  },
  {
    nickname: "Marved",
    team: "Trace Esports",
    agent: "Viper",
    role: "Controlador",
    region: "china",
    priceCents: 2330,
    score: 6.4,
  },
  {
    nickname: "Crashies",
    team: "Gen.G",
    agent: "Harbor",
    role: "Controlador",
    region: "pacific",
    priceCents: 3300,
    score: 10.2,
  },
  {
    nickname: "Alfajer",
    team: "FNATIC",
    agent: "Clove",
    role: "Controlador",
    region: "emea",
    priceCents: 2980,
    score: 8.0,
    availability: "injured",
    availabilityNote: "Fora por lesão no ombro",
  },
  {
    nickname: "ANGE1",
    team: "Team Heretics",
    agent: "Astra",
    role: "Controlador",
    region: "emea",
    priceCents: 8020,
    score: 21.3,
    availability: "eliminated",
    availabilityNote: "Eliminado nas quartas de final",
  },

  // Sentinelas
  {
    nickname: "Chronicle",
    team: "FNATIC",
    agent: "Cypher",
    role: "Sentinela",
    region: "emea",
    priceCents: 2810,
    score: 6.1,
  },
  {
    nickname: "Zellsis",
    team: "SENTINELS",
    agent: "Killjoy",
    role: "Sentinela",
    region: "americas",
    priceCents: 2330,
    score: 5.0,
    availability: "bench",
  },
  {
    nickname: "foxy9",
    team: "DRX",
    agent: "Sage",
    role: "Sentinela",
    region: "pacific",
    priceCents: 2160,
    score: 4.8,
  },
  {
    nickname: "Munchables",
    team: "Dragon Ranger Gaming",
    agent: "Chamber",
    role: "Sentinela",
    region: "china",
    priceCents: 3220,
    score: 9.9,
    availability: "eliminated",
    availabilityNote: "Eliminado nas quartas de final",
  },
  {
    nickname: "Kanpeki",
    team: "Titan Esports Club",
    agent: "Deadlock",
    role: "Sentinela",
    region: "china",
    priceCents: 2000,
    score: 3.9,
  },
  {
    nickname: "Vulcan",
    team: "Gen.G",
    agent: "Vyse",
    role: "Sentinela",
    region: "pacific",
    priceCents: 8510,
    score: 18.4,
  },
];

/**
 * Roster de referência: quem ocupa cada uma das cinco vagas do time
 * Americas no seed. Todo Americas de propósito (`.claude/plans/10-time-por-regiao.md`):
 * é o único time que `seedExistingUsersTeams` preenche, e ele precisa ser um
 * elenco válido para essa região.
 */
const REFERENCE_ROSTER: { nickname: string; captain: boolean }[] = [
  { nickname: "TenZ", captain: true },
  { nickname: "Demon1", captain: false },
  { nickname: "Sacy", captain: false },
  { nickname: "Xeppaa", captain: false },
  { nickname: "Zellsis", captain: false },
];

async function seedPlayers() {
  await db
    .insert(player)
    .values(PLAYERS)
    .onConflictDoNothing({ target: player.nickname });
  console.log(
    `✓ ${PLAYERS.length} jogadores no catálogo (onConflictDoNothing por apelido).`,
  );
}

/**
 * Três rodadas: a 1 nasce `active` só para `closeRoundOnce` (abaixo) ter o
 * que fechar — o ambiente de desenvolvimento já nasce com uma rodada fechada
 * de verdade, com snapshots gerados pelo mesmo código de produção. As
 * janelas de mercado da 2 (que vira `active` no fechamento) e da 3 ficam
 * coerentes com o "agora": a 2 aberta, a 3 no futuro.
 */
async function seedRounds() {
  const now = dayjs();

  await db
    .insert(round)
    .values([
      {
        number: 1,
        name: "Rodada 1",
        marketOpensAt: now.subtract(6, "day").toDate(),
        marketClosesAt: now.subtract(3, "day").toDate(),
        totalMatches: 10,
        scoredMatches: 10,
        status: "active",
      },
      {
        number: 2,
        name: "Rodada 2",
        marketOpensAt: now.subtract(1, "day").toDate(),
        marketClosesAt: now.add(2, "day").toDate(),
        totalMatches: 10,
        scoredMatches: 3,
        status: "upcoming",
      },
      {
        number: 3,
        name: "Rodada 3",
        marketOpensAt: now.add(2, "day").toDate(),
        marketClosesAt: now.add(5, "day").toDate(),
        totalMatches: 10,
        scoredMatches: 0,
        status: "upcoming",
      },
    ])
    .onConflictDoNothing({ target: round.number });
  console.log("✓ Rodadas 1 (ativa), 2 e 3 (upcoming) semeadas.");
}

/**
 * Dez confrontos entre organizações que já aparecem em `PLAYERS` — o
 * suficiente para todo jogador do `REFERENCE_ROSTER` ter uma partida na
 * Rodada 2.
 *
 * **Cada confronto respeita a região da liga.** Dado de demonstração também
 * precisa ser verdade: FNATIC é EMEA, DRX e Gen.G são Pacific, e um
 * "SENTINELS × FNATIC em VCT Americas" na tela não é uma amostra, é um erro
 * que alguém vai passar meia hora caçando no scraper.
 */
const MATCH_PAIRINGS: { teamA: string; teamB: string; event: string }[] = [
  { teamA: "SENTINELS", teamB: "NRG", event: "VCT Americas" },
  { teamA: "LOUD", teamB: "LEVIATÁN", event: "VCT Americas" },
  { teamA: "Evil Geniuses", teamB: "Cloud9", event: "VCT Americas" },
  { teamA: "100 Thieves", teamB: "SENTINELS", event: "VCT Americas" },
  { teamA: "NRG", teamB: "LOUD", event: "VCT Americas" },
  { teamA: "Cloud9", teamB: "100 Thieves", event: "VCT Americas" },
  { teamA: "LEVIATÁN", teamB: "Evil Geniuses", event: "VCT Americas" },
  { teamA: "FNATIC", teamB: "Team Liquid", event: "VCT EMEA" },
  { teamA: "Team Heretics", teamB: "FNATIC", event: "VCT EMEA" },
  { teamA: "DRX", teamB: "Gen.G", event: "VCT Pacific" },
  { teamA: "EDward Gaming", teamB: "Bilibili Gaming", event: "VCT China" },
];

/** Um horário por partida, espaçado uniformemente dentro da janela da rodada. */
function scheduleWithinWindow(
  opensAt: Date,
  closesAt: Date,
  index: number,
  total: number,
): Date {
  const start = dayjs(opensAt);
  const end = dayjs(closesAt);
  const stepMinutes = end.diff(start, "minute") / (total + 1);
  return start.add(stepMinutes * (index + 1), "minute").toDate();
}

/**
 * Calendário de cada rodada — idempotente por checagem manual (`match` não
 * tem chave natural para `onConflictDoNothing`): se a rodada já tem
 * partidas, pula. A Rodada 1 nasce toda `finished` com placar (é o passado);
 * a 2 mistura `finished`/`live`/`upcoming` (`scoredMatches: 3` bate com as
 * três primeiras já encerradas); a 3 é só `upcoming`, sem placar.
 */
async function seedMatches() {
  const rounds = await db.query.round.findMany({
    orderBy: (row, { asc }) => [asc(row.number)],
  });

  for (const [roundIndex, currentRound] of rounds.entries()) {
    const existing = await db.query.match.findFirst({
      where: eq(match.roundId, currentRound.id),
    });
    if (existing) continue;

    const rows = MATCH_PAIRINGS.map((pairing, index) => {
      const scheduledAt = scheduleWithinWindow(
        currentRound.marketOpensAt,
        currentRound.marketClosesAt,
        index,
        MATCH_PAIRINGS.length,
      );
      // Rodada 1 (passada): tudo encerrado. Rodada 2 (em curso): as 3
      // primeiras encerradas, a 4ª ao vivo, o resto por vir. Rodada 3
      // (futura): tudo por vir.
      const finished = roundIndex === 0 || (roundIndex === 1 && index < 3);
      const live = roundIndex === 1 && index === 3;
      const status = finished ? "finished" : live ? "live" : "upcoming";

      return {
        roundId: currentRound.id,
        teamA: pairing.teamA,
        teamB: pairing.teamB,
        event: pairing.event,
        scheduledAt,
        status: status as "upcoming" | "live" | "finished",
        scoreA: finished ? 13 : null,
        scoreB: finished ? 8 : null,
      };
    });

    await db.insert(match).values(rows);
    console.log(
      `✓ ${rows.length} partidas semeadas para "${currentRound.name}".`,
    );
  }
}

/**
 * Fecha a Rodada 1 uma única vez — só quando o catálogo ainda não tem
 * nenhuma rodada `finished` — chamando o mesmo `closeActiveRound` do script
 * `pnpm db:round:close`. É o que dá à Home snapshots reais para exibir
 * (`round_player_score`, `round_roster`, `round_team_result`) sem inventar
 * números à mão aqui.
 */
async function closeRoundOnce(): Promise<boolean> {
  const [{ value: finishedRounds }] = await db
    .select({ value: count() })
    .from(round)
    .where(eq(round.status, "finished"));
  if (finishedRounds > 0) {
    console.log("✓ Já existe rodada finalizada — nada para fechar.");
    return false;
  }

  const result = await db.transaction((tx) => closeActiveRound(tx));
  if (!result) {
    console.log("✓ Nenhuma rodada ativa para fechar.");
    return false;
  }
  console.log(
    `✓ Rodada 1 fechada com snapshots reais. Rodada ativa agora: ${result.nextRoundId}.`,
  );
  return true;
}

/**
 * `closeActiveRound` zera `player.score` — o comportamento correto na virada,
 * já que a pontuação é sempre "da rodada corrente". Só que, rodando dentro do
 * seed, isso deixaria o ambiente de desenvolvimento inteiro com 0 ponto em
 * toda tela (header, `/my-team`, `/ranking`, destaques) e sem como recuperar:
 * `seedPlayers` usa `onConflictDoNothing`, então re-rodar o seed não
 * restauraria nada. Reaplica as pontuações de `PLAYERS` na rodada agora
 * ativa. Só é chamada quando o fechamento realmente aconteceu — nunca
 * sobrescreve pontuação de um banco já em uso.
 */
async function restoreCatalogScores() {
  for (const seedPlayer of PLAYERS) {
    await db
      .update(player)
      .set({ score: seedPlayer.score })
      .where(eq(player.nickname, seedPlayer.nickname));
  }
  console.log(
    `✓ Pontuações da rodada corrente reaplicadas em ${PLAYERS.length} jogadores.`,
  );
}

/**
 * Para quem já tinha conta antes de o mercado existir: garante os 5 times
 * (`ensureFantasyTeam`) e, se a escalação **do time Americas** estiver
 * totalmente vazia, preenche com o roster de referência — só assim
 * `/my-team?region=americas` fica reconhecível sem passar pelo fluxo de
 * substituição. Os outros 4 times nascem vazios, como qualquer conta nova.
 */
async function seedExistingUsersTeams() {
  const users = await db
    .select({ id: user.id, name: user.name, username: user.username })
    .from(user);
  if (users.length === 0) return;

  const referencePlayers = await db.query.player.findMany({
    where: (row, { inArray }) =>
      inArray(
        row.nickname,
        REFERENCE_ROSTER.map((r) => r.nickname),
      ),
  });
  const byNickname = new Map(
    referencePlayers.map((row) => [row.nickname, row]),
  );

  for (const u of users) {
    // `backfillUsernames` já rodou antes desta função (ver `main`), então
    // todo usuário aqui já tem login.
    await ensureFantasyTeam(u.id, u.username ?? u.name);

    const team = await db.query.fantasyTeam.findFirst({
      where: and(
        eq(fantasyTeam.userId, u.id),
        eq(fantasyTeam.region, "americas"),
      ),
      with: { slots: true },
    });
    if (!team) continue;

    const isEmpty = team.slots.every((slot) => slot.playerId === null);
    if (!isEmpty) continue;

    for (const [index, ref] of REFERENCE_ROSTER.entries()) {
      const refPlayer = byNickname.get(ref.nickname);
      const slot = team.slots.find((s) => s.position === index + 1);
      if (!refPlayer || !slot) continue;
      await db
        .update(rosterSlot)
        .set({ playerId: refPlayer.id, captain: ref.captain })
        .where(eq(rosterSlot.id, slot.id));
    }
    console.log(`✓ Escalação de referência aplicada ao time de "${u.name}".`);
  }
}

/**
 * Contas criadas antes do plugin `username` (lib/auth.ts) não têm login —
 * gera um `@login` único para cada uma, a partir do e-mail.
 */
async function backfillUsernames() {
  const usersWithoutUsername = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(isNull(user.username));

  for (const u of usersWithoutUsername) {
    const username = await assignUniqueUsername(
      u.id,
      u.email.split("@")[0] || u.name,
    );
    if (username) {
      console.log(`✓ Login "@${username}" gerado para "${u.name}".`);
    }
  }
}

async function main() {
  await seedPlayers();
  await seedRounds();
  await seedMatches();
  await backfillUsernames();
  await seedExistingUsersTeams();
  // Por último: fecha a Rodada 1 com o time de referência (e qualquer outro
  // já semeado) na escalação, para os snapshots saírem preenchidos. O
  // fechamento zera os scores, então a rodada agora ativa recebe as
  // pontuações de volta.
  if (await closeRoundOnce()) {
    await restoreCatalogScores();
  }
  console.log("Seed concluído.");
}

main()
  .catch((error) => {
    console.error("Falha ao rodar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
