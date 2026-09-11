import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerPhoto } from "@/components/player/player-photo";

describe("PlayerPhoto", () => {
  it("sem photoUrl: não existe <img> no DOM, só a hachura", () => {
    const { container } = render(
      <PlayerPhoto photoUrl={null} nickname="TenZ" size={46} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('[data-slot="player-photo"]'),
    ).toBeInTheDocument();
  });

  it("com photoUrl: existe exatamente uma <img>", () => {
    const { container } = render(
      <PlayerPhoto
        photoUrl="https://owcdn.net/img/x.png"
        nickname="TenZ"
        size={46}
      />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("a moldura é decorativa: alt vazio, o nickname não vira acessível como imagem", () => {
    const { container } = render(
      <PlayerPhoto
        photoUrl="https://owcdn.net/img/x.png"
        nickname="TenZ"
        size={46}
      />,
    );

    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden");
    expect(screen.queryByRole("img", { name: "TenZ" })).not.toBeInTheDocument();
  });

  it("shape padrão é 'corner' — clip-corner com --clip aplicado", () => {
    const { container } = render(
      <PlayerPhoto photoUrl={null} nickname="TenZ" size={46} />,
    );

    const wrapper = container.querySelector(
      '[data-slot="player-photo"]',
    ) as HTMLElement;
    expect(wrapper.className).toContain("clip-corner");
    expect(wrapper.style.getPropertyValue("--clip")).toBe("6px");
  });

  it("shape='circle' usa rounded-full com overflow-hidden, sem --clip", () => {
    const { container } = render(
      <PlayerPhoto photoUrl={null} nickname="TenZ" size={56} shape="circle" />,
    );

    const wrapper = container.querySelector(
      '[data-slot="player-photo"]',
    ) as HTMLElement;
    expect(wrapper.className).toContain("rounded-full");
    expect(wrapper.className).toContain("overflow-hidden");
    expect(wrapper.style.getPropertyValue("--clip")).toBe("");
  });

  it("clip customizado é aplicado no shape corner", () => {
    const { container } = render(
      <PlayerPhoto photoUrl={null} nickname="TenZ" size={46} clip={12} />,
    );

    const wrapper = container.querySelector(
      '[data-slot="player-photo"]',
    ) as HTMLElement;
    expect(wrapper.style.getPropertyValue("--clip")).toBe("12px");
  });

  it("aplica width/height numéricos do tamanho pedido", () => {
    const { container } = render(
      <PlayerPhoto photoUrl={null} nickname="TenZ" size={46} />,
    );

    const wrapper = container.querySelector(
      '[data-slot="player-photo"]',
    ) as HTMLElement;
    expect(wrapper.style.width).toBe("46px");
    expect(wrapper.style.height).toBe("46px");
  });
});
