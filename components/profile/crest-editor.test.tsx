import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  updateTeamCrest: "updateTeamCrest-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CrestEditor } from "@/components/profile/crest-editor";
import { DEFAULT_CREST } from "@/lib/crest/crest";

describe("CrestEditor", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("marcar 'Ciano' atualiza o preview e envia background: 'cyan' ao salvar", async () => {
    const user = userEvent.setup();
    render(<CrestEditor crest={DEFAULT_CREST} teamName="Sentinels BR" />);

    const backgroundGroup = screen.getByRole("radiogroup", {
      name: "Cor de fundo",
    });
    await user.click(
      within(backgroundGroup).getByRole("radio", { name: "Ciano" }),
    );

    const preview = screen.getByRole("img", { name: "Brasão de Sentinels BR" });
    expect(preview.querySelector("path")).toHaveStyle({
      fill: "var(--crest-cyan)",
    });

    await user.click(screen.getByRole("button", { name: /salvar brasão/i }));

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ ...DEFAULT_CREST, background: "cyan" }),
    );
  });
});
