import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import type { Player } from "@/lib/team/types";

const player: Player = {
  id: "tenz",
  nickname: "TenZ",
  team: "SENTINELS",
  agent: "Jett",
  role: "Duelista",
  score: 18.2,
};

describe("PlayerRow", () => {
  it("mostra apelido, organização, agente e função do jogador", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(screen.getByText("TenZ")).toBeInTheDocument();
    expect(screen.getByText("SENTINELS")).toBeInTheDocument();
    expect(screen.getByText("Jett · Duelista")).toBeInTheDocument();
  });

  it("exibe a pontuação sempre com uma casa decimal", () => {
    render(
      <ul>
        <PlayerRow player={{ ...player, score: 9 }} />
      </ul>,
    );

    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("marca o capitão de forma acessível", () => {
    render(
      <ul>
        <PlayerRow player={player} captain />
      </ul>,
    );

    expect(screen.getByLabelText("Capitão")).toBeInTheDocument();
  });

  it("não marca capitão quando o jogador não é o capitão", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(screen.queryByLabelText("Capitão")).not.toBeInTheDocument();
  });
});

describe("EmptyPlayerRow", () => {
  it("indica a posição vaga na escalação", () => {
    render(
      <ul>
        <EmptyPlayerRow position={3} />
      </ul>,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Slot vazio")).toBeInTheDocument();
  });
});
