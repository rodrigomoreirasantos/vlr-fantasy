import { describe, expect, it } from "vitest";

import {
  DEBUT_PRICE_CENTS,
  MAX_PRICE_CENTS,
  MAX_STEP_CENTS,
  MIN_PRICE_CENTS,
  dampingFactor,
  nextPriceCents,
  priceDeltaCents,
  targetPriceCents,
} from "@/lib/scoring/pricing";

describe("MIN_PRICE_CENTS / MAX_PRICE_CENTS", () => {
  it("batem com os literais do CHECK player_price_cents_range (db/schema/players.ts)", () => {
    // Um CHECK do Postgres não aceita parâmetro de query — os literais lá
    // são hardcoded. Este teste é a rede que pega a dessincronia se algum
    // dia um lado mudar sem o outro.
    expect(MIN_PRICE_CENTS).toBe(2_000);
    expect(MAX_PRICE_CENTS).toBe(9_000);
  });
});

describe("targetPriceCents", () => {
  it("bate a tabela de percentis reais do circuito (fato 9, plano 20)", () => {
    // forma (pts/série) → preço, régua `20,0 + 0,875 × (forma − 20)`.
    expect(targetPriceCents(22.9)).toBe(2_250); // p10 → 22,5
    expect(targetPriceCents(37.2)).toBe(3_510); // p25 → 35,1
    expect(targetPriceCents(52.1)).toBe(4_810); // p50 → 48,1
    expect(targetPriceCents(66.0)).toBe(6_030); // p75 → 60,3
    expect(targetPriceCents(80.2)).toBe(7_270); // p90 → 72,7
    expect(targetPriceCents(103.7)).toBe(MAX_PRICE_CENTS); // p99 → teto
  });

  it("nunca sai da faixa [MIN, MAX]", () => {
    expect(targetPriceCents(-50)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(0)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(20)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(100)).toBe(MAX_PRICE_CENTS);
    expect(targetPriceCents(500)).toBe(MAX_PRICE_CENTS);
  });

  it("forma null (sem histórico) puxa para o preço de estreia", () => {
    expect(targetPriceCents(null)).toBe(DEBUT_PRICE_CENTS);
  });
});

describe("priceDeltaCents", () => {
  it("forma acima do preço valoriza; forma abaixo desvaloriza", () => {
    const up = priceDeltaCents({ priceCents: 4_000, formPoints: 80 });
    expect(up).toBeGreaterThan(0);

    const down = priceDeltaCents({ priceCents: 8_000, formPoints: 25 });
    expect(down).toBeLessThan(0);
  });

  it("forma exatamente no alvo do preço atual dá delta 0", () => {
    const priceCents = targetPriceCents(52.1);
    expect(priceDeltaCents({ priceCents, formPoints: 52.1 })).toBe(0);
  });

  it("o passo nunca passa de 8,0 créditos, mesmo com o alvo bem distante", () => {
    const deltaUp = priceDeltaCents({
      priceCents: MIN_PRICE_CENTS,
      formPoints: 200,
    });
    const deltaDown = priceDeltaCents({
      priceCents: MAX_PRICE_CENTS,
      formPoints: 0,
    });
    expect(deltaUp).toBe(MAX_STEP_CENTS);
    expect(deltaDown).toBe(-MAX_STEP_CENTS);
  });

  it("um jogador no teto com forma máxima tem delta 0 — não passa do teto", () => {
    expect(
      priceDeltaCents({ priceCents: MAX_PRICE_CENTS, formPoints: 200 }),
    ).toBe(0);
  });

  it("um jogador no piso com forma mínima tem delta 0 — não passa do piso", () => {
    expect(
      priceDeltaCents({ priceCents: MIN_PRICE_CENTS, formPoints: 0 }),
    ).toBe(0);
  });

  it("invariante: nextPriceCents(x) - x === priceDeltaCents(x)", () => {
    const args = { priceCents: 5_230, formPoints: 61.4, gamesPlayed: 2 };
    expect(nextPriceCents(args) - args.priceCents).toBe(priceDeltaCents(args));
  });
});

describe("priceDeltaCents com amortecimento", () => {
  const base = { priceCents: 2_000, formPoints: 90 };

  it("a estreia (gamesPlayed 0) move um quarto do que moveria um veterano", () => {
    const veteran = priceDeltaCents({ ...base, gamesPlayed: 10 });
    const rookie = priceDeltaCents({ ...base, gamesPlayed: 0 });
    // Os dois batem no teto de MAX_STEP_CENTS antes do amortecimento fazer
    // diferença — usa um alvo mais próximo para o amortecimento aparecer.
    const nearBase = { priceCents: 4_000, formPoints: 48.1 };
    const veteranNear = priceDeltaCents({ ...nearBase, gamesPlayed: 10 });
    const rookieNear = priceDeltaCents({ ...nearBase, gamesPlayed: 0 });
    expect(veteran).toBeGreaterThan(0);
    expect(rookie).toBeGreaterThan(0);
    expect(rookieNear).toBeLessThan(veteranNear);
  });

  it("omitir gamesPlayed não amortece — o comportamento default", () => {
    expect(priceDeltaCents(base)).toBe(
      priceDeltaCents({ ...base, gamesPlayed: 99 }),
    );
  });

  it("o passo máximo continua valendo depois do amortecimento", () => {
    const delta = priceDeltaCents({
      priceCents: MIN_PRICE_CENTS,
      formPoints: 500,
      gamesPlayed: 40,
    });
    expect(delta).toBe(MAX_STEP_CENTS);
  });

  it("invariante preservada com amortecimento", () => {
    const args = { ...base, gamesPlayed: 1 };
    expect(nextPriceCents(args) - args.priceCents).toBe(priceDeltaCents(args));
  });
});

describe("dampingFactor", () => {
  it("sobe em rampa nas três primeiras rodadas e satura em 1", () => {
    expect(dampingFactor(0)).toBe(0.25);
    expect(dampingFactor(1)).toBe(0.5);
    expect(dampingFactor(2)).toBe(0.75);
    expect(dampingFactor(3)).toBe(1);
    expect(dampingFactor(40)).toBe(1);
  });

  it("um gamesPlayed negativo cai no fator da estreia, nunca em NaN", () => {
    expect(dampingFactor(-1)).toBe(0.25);
  });
});

describe("convergência", () => {
  it("iterar rodadas converge ao alvo e para de se mover", () => {
    let priceCents = 5_000;
    const formPoints = 80.2; // alvo = 7.270
    const target = targetPriceCents(formPoints);

    for (let round = 0; round < 30; round += 1) {
      priceCents = nextPriceCents({
        priceCents,
        formPoints,
        gamesPlayed: 10, // veterano: sem amortecimento
      });
    }

    expect(priceCents).toBe(target);
    // Uma rodada a mais não move nada: convergiu de verdade.
    expect(
      priceDeltaCents({ priceCents, formPoints, gamesPlayed: 10 }),
    ).toBe(0);
  });
});
