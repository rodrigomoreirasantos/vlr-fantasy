import type { RosterSlot, TeamSummary } from "./types";

/**
 * ------------------------------------------------------------------------
 * DADOS PROVISÓRIOS — NÃO SÃO REAIS.
 *
 * O banco hoje só tem as tabelas de autenticação (`db/schema/auth.ts`), então
 * não existe de onde ler escalação, pontuação, saldo ou mercado. Estes valores
 * reproduzem o design de referência para que a tela possa ser construída e
 * revisada.
 *
 * Para ligar de verdade: crie o schema (players/roster/rounds), troque as duas
 * funções abaixo por queries Drizzle e apague este arquivo. Nenhum componente
 * importa daqui — só `app/my-team/page.tsx` — então a troca fica contida.
 * ------------------------------------------------------------------------
 */

export function placeholderRoster(): RosterSlot[] {
  return [
    {
      captain: true,
      player: {
        id: "boaster",
        nickname: "Boaster",
        team: "FNATIC",
        agent: "Astra",
        role: "Controlador",
        score: 24.6,
      },
    },
    {
      captain: false,
      player: {
        id: "tenz",
        nickname: "TenZ",
        team: "SENTINELS",
        agent: "Jett",
        role: "Duelista",
        score: 18.2,
      },
    },
    {
      captain: false,
      player: {
        id: "derke",
        nickname: "Derke",
        team: "FNATIC",
        agent: "Raze",
        role: "Duelista",
        score: 15.8,
      },
    },
    {
      captain: false,
      player: {
        id: "sacy",
        nickname: "Sacy",
        team: "LOUD",
        agent: "Skye",
        role: "Iniciador",
        score: 9.4,
      },
    },
    {
      captain: false,
      player: {
        id: "chronicle",
        nickname: "Chronicle",
        team: "FNATIC",
        agent: "Cypher",
        role: "Sentinela",
        score: 6.1,
      },
    },
  ];
}

export function placeholderSummary(): TeamSummary {
  return {
    name: "Ghost Wolves",
    points: 218.6,
    balance: 148.2,
    scoredMatches: { played: 9, total: 10 },
    market: { open: true, closesIn: "36h 12m" },
  };
}
