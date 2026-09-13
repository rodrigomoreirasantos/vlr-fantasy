import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MyTeamLoading from "@/app/(app)/my-team/loading";

describe("MyTeamLoading", () => {
  it("renderiza sem nenhum alvo do tour guiado", () => {
    const { container } = render(<MyTeamLoading />);
    expect(container.querySelector("[data-tour]")).toBeNull();
  });
});
