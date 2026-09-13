// @vitest-environment node
import { describe, expect, it } from "vitest";

import { tourReducer, type TourState } from "@/lib/tour/machine";

const TOTAL = 3;
const IDLE: TourState = { status: "idle" };

describe("tourReducer", () => {
  it("start sempre vai para o índice 0", () => {
    expect(tourReducer(IDLE, { type: "start" }, TOTAL)).toEqual({
      status: "running",
      index: 0,
    });
  });

  it("next avança um passo", () => {
    const state: TourState = { status: "running", index: 0 };
    expect(tourReducer(state, { type: "next" }, TOTAL)).toEqual({
      status: "running",
      index: 1,
    });
  });

  it("back volta um passo", () => {
    const state: TourState = { status: "running", index: 1 };
    expect(tourReducer(state, { type: "back" }, TOTAL)).toEqual({
      status: "running",
      index: 0,
    });
  });

  it("back no primeiro passo fica no primeiro passo", () => {
    const state: TourState = { status: "running", index: 0 };
    expect(tourReducer(state, { type: "back" }, TOTAL)).toEqual({
      status: "running",
      index: 0,
    });
  });

  it("next no último passo termina o tour", () => {
    const state: TourState = { status: "running", index: TOTAL - 1 };
    expect(tourReducer(state, { type: "next" }, TOTAL)).toEqual(IDLE);
  });

  it("close termina o tour em qualquer passo", () => {
    const state: TourState = { status: "running", index: 1 };
    expect(tourReducer(state, { type: "close" }, TOTAL)).toEqual(IDLE);
  });

  it("uma ação que não seja start não faz nada quando parado", () => {
    expect(tourReducer(IDLE, { type: "next" }, TOTAL)).toEqual(IDLE);
    expect(tourReducer(IDLE, { type: "back" }, TOTAL)).toEqual(IDLE);
  });
});
