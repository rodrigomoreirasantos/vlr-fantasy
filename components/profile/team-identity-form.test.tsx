import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  updateTeamIdentity: "updateTeamIdentity-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TeamIdentityForm } from "@/components/profile/team-identity-form";
import { DEFAULT_CREST } from "@/lib/crest/crest";

function renderForm() {
  return render(
    <TeamIdentityForm name="Sentinels BR" crest={DEFAULT_CREST} />,
  );
}

describe("TeamIdentityForm", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("um botão só, desabilitado até algo mudar — sem 'Desfazer' antes disso", () => {
    renderForm();

    expect(
      screen.getAllByRole("button", { name: /salvar/i }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Desfazer" }),
    ).not.toBeInTheDocument();
  });

  it("abre em Formato, mostrando um grupo de opções por vez", () => {
    renderForm();

    expect(screen.getByRole("tab", { name: "Formato" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("radiogroup", { name: "Formato" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Símbolo" }),
    ).not.toBeInTheDocument();
  });

  it("nome com 2 caracteres: mostra erro pt-BR e não chama execute", async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByLabelText("Nome do time");
    await user.clear(input);
    await user.type(input, "Ab");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(
      await screen.findByText("Deve ter pelo menos 3 caracteres."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("muda o nome e o formato: 'Salvar' envia os dois campos numa chamada só", async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByLabelText("Nome do time");
    await user.clear(input);
    await user.type(input, "Nova Org");
    await user.click(screen.getByRole("radio", { name: "Octógono" }));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nova Org",
        shape: "octagon",
        symbol: DEFAULT_CREST.symbol,
      }),
    );
  });

  it("'Desfazer' aparece depois de uma mudança e volta ao que estava salvo", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("radio", { name: "Octógono" }));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    expect(screen.getByRole("radio", { name: "Escudo" })).toBeChecked();
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Desfazer" }),
    ).not.toBeInTheDocument();
  });

  it("escolher a parte 'Fundo' abre as cores; 'Ciano' pinta o preview e é enviado ao salvar", async () => {
    const user = userEvent.setup();
    renderForm();

    const parts = screen.getByRole("radiogroup", { name: "Parte do brasão" });
    await user.click(within(parts).getByRole("radio", { name: /fundo/i }));

    const palette = screen.getByRole("radiogroup", { name: "Cor de fundo" });
    await user.click(within(palette).getByRole("radio", { name: "Ciano" }));

    const preview = screen.getByRole("img", { name: "Brasão de Sentinels BR" });
    expect(preview.querySelector("path")).toHaveStyle({
      fill: "var(--crest-cyan)",
    });

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ background: "cyan" }),
    );
  });

  it("símbolo sem texto visível, mas escolhível pelo nome acessível do poder", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("tab", { name: "Símbolo" }));
    const symbols = screen.getByRole("radiogroup", { name: "Símbolo" });
    await user.click(within(symbols).getByRole("radio", { name: "Arco" }));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "bow" }),
    );
  });

  it("credita os autores dos símbolos, como exige a licença CC BY 3.0", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("tab", { name: "Símbolo" }));

    expect(screen.getByText(/símbolos por/i)).toHaveTextContent(
      /Lorc|Delapouite/,
    );
    expect(
      screen.getByRole("link", { name: "game-icons.net" }),
    ).toHaveAttribute("href", "https://game-icons.net");
    expect(screen.getByRole("link", { name: "CC BY 3.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/3.0/",
    );
  });
});
