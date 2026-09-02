import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  respondToFriendRequest: "respondToFriendRequest-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FriendRequests } from "@/components/profile/friend-requests";
import type { IncomingFriendRequest } from "@/lib/friendship/types";

const REQUEST: IncomingFriendRequest = {
  friendshipId: "11111111-1111-4111-8111-111111111111",
  requesterUserId: "user-2",
  requesterUserName: "Bruno",
  requesterUsername: "bruno",
  requestedAt: new Date("2026-01-10T18:00:00Z"),
};

describe("FriendRequests", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("sem pedidos: não renderiza nada", () => {
    const { container } = render(<FriendRequests requests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("'Aceitar' chama execute com accept: true", async () => {
    const user = userEvent.setup();
    render(<FriendRequests requests={[REQUEST]} />);

    await user.click(screen.getByRole("button", { name: /aceitar/i }));

    expect(executeMock).toHaveBeenCalledWith({
      friendshipId: REQUEST.friendshipId,
      accept: true,
    });
  });

  it("'Recusar' chama execute com accept: false", async () => {
    const user = userEvent.setup();
    render(<FriendRequests requests={[REQUEST]} />);

    await user.click(screen.getByRole("button", { name: /recusar/i }));

    expect(executeMock).toHaveBeenCalledWith({
      friendshipId: REQUEST.friendshipId,
      accept: false,
    });
  });
});
