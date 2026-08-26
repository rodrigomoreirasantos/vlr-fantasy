import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom não implementa ResizeObserver. O Radix ScrollArea (usado no
// MarketSheet) observa seu conteúdo ao montar, então qualquer teste que
// abra o Sheet precisa desse stub — mesmo quando o mercado está vazio.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
