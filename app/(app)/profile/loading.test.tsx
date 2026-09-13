import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProfileLoading from "@/app/(app)/profile/loading";

describe("ProfileLoading", () => {
  it("renderiza sem nenhum alvo do tour guiado", () => {
    const { container } = render(<ProfileLoading />);
    expect(container.querySelector("[data-tour]")).toBeNull();
  });
});
