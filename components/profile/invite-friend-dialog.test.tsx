import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  inviteFriendToChampionship: "inviteFriendToChampionship-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InviteFriendDialog } from "@/components/profile/invite-friend-dialog";
import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { ChampionshipSummary } from "@/lib/championship/types";
import type { Friend } from "@/lib/friendship/types";

const FRIEND: Friend = {
  friendshipId: "11111111-1111-4111-8111-111111111111",
  userId: "user-2",
  userName: "Bruno",
  username: "bruno",
  teamName: "Bruno FC",
  crest: DEFAULT_CREST,
};

const CHAMPIONSHIP: ChampionshipSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Liga dos Cria",
  ownerId: "user-1",
  region: "emea",
  memberCount: 3,
};

describe("InviteFriendDialog", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("o Select lista o campeonato com a região ao lado", async () => {
    const user = userEvent.setup();
    render(
      <InviteFriendDialog
        friend={FRIEND}
        ownedChampionships={[CHAMPIONSHIP]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /convidar/i }));

    expect(screen.getByText("Liga dos Cria · EMEA")).toBeInTheDocument();
  });

  it("sem campeonatos próprios, mostra o estado vazio em vez do Select", async () => {
    const user = userEvent.setup();
    render(<InviteFriendDialog friend={FRIEND} ownedChampionships={[]} />);

    await user.click(screen.getByRole("button", { name: /convidar/i }));

    expect(
      screen.getByText("Você ainda não criou nenhum campeonato."),
    ).toBeInTheDocument();
  });
});
