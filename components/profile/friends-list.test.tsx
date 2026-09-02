import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  removeFriend: "removeFriend-token",
  inviteFriendToChampionship: "inviteFriendToChampionship-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FriendsList } from "@/components/profile/friends-list";
import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { Friend } from "@/lib/friendship/types";

const FRIEND: Friend = {
  friendshipId: "11111111-1111-4111-8111-111111111111",
  userId: "user-2",
  userName: "Bruno",
  username: "bruno",
  teamName: "Bruno FC",
  crest: DEFAULT_CREST,
};

describe("FriendsList", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("sem amigos: mostra o estado vazio em pt-BR", () => {
    render(<FriendsList friends={[]} ownedChampionships={[]} />);

    expect(
      screen.getByText("Você ainda não tem amigos. Convide alguém pelo login."),
    ).toBeInTheDocument();
  });

  it("'Remover' só chama execute depois da confirmação no diálogo", async () => {
    const user = userEvent.setup();
    render(<FriendsList friends={[FRIEND]} ownedChampionships={[]} />);

    await user.click(screen.getByRole("button", { name: /^remover$/i }));
    expect(executeMock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /^remover$/i }),
    );

    expect(executeMock).toHaveBeenCalledWith({
      friendshipId: FRIEND.friendshipId,
    });
  });
});
