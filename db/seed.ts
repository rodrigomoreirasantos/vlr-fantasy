import "dotenv/config";

import { eq, isNull } from "drizzle-orm";

import { db, pool } from "@/db";
import { fantasyTeam, player, round, rosterSlot, user } from "@/db/schema";
import { assignUniqueUsername } from "@/lib/auth/username";
import { ensureFantasyTeam } from "@/lib/team/queries";
import type { PlayerRole } from "@/lib/team/types";

/**
 * Catálogo de demonstração: 6 jogadores por função, com pelo menos um preço
 * fora do alcance do saldo inicial (INITIAL_BALANCE_CENTS) em cada função —
 * é o que faz o estado "sem saldo" do mercado aparecer de verdade na tela.
 * Os cinco primeiros reproduzem o roster do antigo `lib/team/placeholder.ts`,
 * para a tela continuar reconhecível.
 */
const PLAYERS: {
  nickname: string;
  team: string;
  agent: string;
  role: PlayerRole;
  priceCents: number;
  score: number;
}[] = [
  // Duelistas
  {
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    priceCents: 18000,
    score: 18.2,
  },
  {
    nickname: "Derke",
    team: "FNATIC",
    agent: "Raze",
    role: "Duelista",
    priceCents: 21000,
    score: 15.8,
  },
  {
    nickname: "Jamppi",
    team: "Team Liquid",
    agent: "Reyna",
    role: "Duelista",
    priceCents: 9000,
    score: 11.5,
  },
  {
    nickname: "yay",
    team: "SENTINELS",
    agent: "Neon",
    role: "Duelista",
    priceCents: 24500,
    score: 13.7,
  },
  {
    nickname: "Aspas",
    team: "LEVIATÁN",
    agent: "Iso",
    role: "Duelista",
    priceCents: 26000,
    score: 20.1,
  },
  {
    nickname: "Demon1",
    team: "NRG",
    agent: "Yoru",
    role: "Duelista",
    priceCents: 48000,
    score: 22.9,
  },

  // Iniciadores
  {
    nickname: "Sacy",
    team: "LOUD",
    agent: "Skye",
    role: "Iniciador",
    priceCents: 12000,
    score: 9.4,
  },
  {
    nickname: "Mazino",
    team: "DRX",
    agent: "Fade",
    role: "Iniciador",
    priceCents: 8000,
    score: 7.2,
  },
  {
    nickname: "Trent",
    team: "100 Thieves",
    agent: "Breach",
    role: "Iniciador",
    priceCents: 6000,
    score: 5.8,
  },
  {
    nickname: "BuZz",
    team: "DRX",
    agent: "KAY/O",
    role: "Iniciador",
    priceCents: 15500,
    score: 12.9,
  },
  {
    nickname: "Zekken",
    team: "SENTINELS",
    agent: "Sova",
    role: "Iniciador",
    priceCents: 40000,
    score: 19.6,
  },
  {
    nickname: "FNS",
    team: "Evil Geniuses",
    agent: "Gekko",
    role: "Iniciador",
    priceCents: 5000,
    score: 4.3,
  },

  // Controladores
  {
    nickname: "Boaster",
    team: "FNATIC",
    agent: "Astra",
    role: "Controlador",
    priceCents: 14000,
    score: 24.6,
  },
  {
    nickname: "Xeppaa",
    team: "Cloud9",
    agent: "Omen",
    role: "Controlador",
    priceCents: 9500,
    score: 9.1,
  },
  {
    nickname: "Marved",
    team: "100 Thieves",
    agent: "Viper",
    role: "Controlador",
    priceCents: 7000,
    score: 6.4,
  },
  {
    nickname: "Crashies",
    team: "NRG",
    agent: "Harbor",
    role: "Controlador",
    priceCents: 13000,
    score: 10.2,
  },
  {
    nickname: "Alfajer",
    team: "FNATIC",
    agent: "Clove",
    role: "Controlador",
    priceCents: 11000,
    score: 8.0,
  },
  {
    nickname: "ANGE1",
    team: "Team Heretics",
    agent: "Astra",
    role: "Controlador",
    priceCents: 42000,
    score: 21.3,
  },

  // Sentinelas
  {
    nickname: "Chronicle",
    team: "FNATIC",
    agent: "Cypher",
    role: "Sentinela",
    priceCents: 10000,
    score: 6.1,
  },
  {
    nickname: "Zellsis",
    team: "SENTINELS",
    agent: "Killjoy",
    role: "Sentinela",
    priceCents: 7000,
    score: 5.0,
  },
  {
    nickname: "foxy9",
    team: "DRX",
    agent: "Sage",
    role: "Sentinela",
    priceCents: 6000,
    score: 4.8,
  },
  {
    nickname: "Munchables",
    team: "Cloud9",
    agent: "Chamber",
    role: "Sentinela",
    priceCents: 12500,
    score: 9.9,
  },
  {
    nickname: "Kanpeki",
    team: "Evil Geniuses",
    agent: "Deadlock",
    role: "Sentinela",
    priceCents: 5000,
    score: 3.9,
  },
  {
    nickname: "Vulcan",
    team: "Gen.G",
    agent: "Vyse",
    role: "Sentinela",
    priceCents: 45000,
    score: 18.4,
  },
];

/** Roster de referência: quem ocupa cada uma das cinco vagas no seed. */
const REFERENCE_ROSTER: { nickname: string; captain: boolean }[] = [
  { nickname: "Boaster", captain: true },
  { nickname: "TenZ", captain: false },
  { nickname: "Derke", captain: false },
  { nickname: "Sacy", captain: false },
  { nickname: "Chronicle", captain: false },
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

async function seedActiveRound() {
  const now = new Date();
  const opensAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const closesAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  await db
    .insert(round)
    .values({
      number: 1,
      name: "Rodada 1",
      marketOpensAt: opensAt,
      marketClosesAt: closesAt,
      totalMatches: 10,
      scoredMatches: 9,
      status: "active",
    })
    .onConflictDoNothing({ target: round.number });
  console.log("✓ Rodada 1 ativa, com mercado aberto.");
}

/**
 * Para quem já tinha conta antes de o mercado existir: garante o time e, se
 * a escalação estiver totalmente vazia, preenche com o roster de referência
 * — só assim `/my-team` fica reconhecível sem passar pelo fluxo de
 * substituição (preencher vaga vazia está fora de escopo do produto).
 */
async function seedExistingUsersTeams() {
  const users = await db.select({ id: user.id, name: user.name }).from(user);
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
    await ensureFantasyTeam(u.id, u.name);

    const team = await db.query.fantasyTeam.findFirst({
      where: eq(fantasyTeam.userId, u.id),
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
  await seedActiveRound();
  await backfillUsernames();
  await seedExistingUsersTeams();
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
