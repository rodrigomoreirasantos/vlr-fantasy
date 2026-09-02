import type { CrestColor, CrestShape, CrestSymbol } from "@/lib/crest/catalog";

/** O brasão do time: forma + símbolo + 3 cores de paleta. Dado, não imagem. */
export type Crest = {
  shape: CrestShape;
  symbol: CrestSymbol;
  background: CrestColor;
  foreground: CrestColor;
  border: CrestColor;
};
