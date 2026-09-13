import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RankingLoading from "@/app/(app)/ranking/loading";

describe("RankingLoading", () => {
  it("renderiza sem nenhum alvo do tour guiado", () => {
    const { container } = render(<RankingLoading />);
    expect(container.querySelector("[data-tour]")).toBeNull();
  });
});
