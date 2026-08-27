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

// jsdom não implementa Pointer Events nem scrollIntoView. O Radix Select
// (usado no ChampionshipSelector) depende de `hasPointerCapture` para abrir
// via clique/teclado em testes — sem o stub, o clique lança
// "target.hasPointerCapture is not a function".
if (typeof Element.prototype.hasPointerCapture === "undefined") {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture === "undefined") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture === "undefined") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = () => {};
}
