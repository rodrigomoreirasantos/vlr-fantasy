import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomeLoading from "@/app/(app)/home/loading";

describe("HomeLoading", () => {
  it("renderiza sem nenhum alvo do tour guiado", () => {
    const { container } = render(<HomeLoading />);
    expect(container.querySelector("[data-tour]")).toBeNull();
  });
});
