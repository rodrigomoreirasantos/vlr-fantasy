import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegionTabs } from "@/components/team/region-tabs";
import { LEAGUE_REGIONS, TEAM_REGIONS } from "@/lib/round/regions";

describe("RegionTabs", () => {
  it("sem torneio internacional, mostra as 4 abas de liga", () => {
    render(<RegionTabs current="americas" available={LEAGUE_REGIONS} />);

    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByText("Internacional")).not.toBeInTheDocument();
  });

  it("com torneio internacional, mostra as 5 abas", () => {
    render(<RegionTabs current="americas" available={TEAM_REGIONS} />);

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText("Internacional")).toBeInTheDocument();
  });

  it("cada link aponta para /my-team?region=<região>", () => {
    render(<RegionTabs current="americas" available={LEAGUE_REGIONS} />);

    expect(screen.getByText("EMEA").closest("a")).toHaveAttribute(
      "href",
      "/my-team?region=emea",
    );
  });

  it("aria-current='page' só na região atual", () => {
    render(<RegionTabs current="emea" available={LEAGUE_REGIONS} />);

    expect(screen.getByText("EMEA").closest("a")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Americas").closest("a")).not.toHaveAttribute(
      "aria-current",
    );
  });
});
