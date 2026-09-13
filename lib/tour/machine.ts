/**
 * A máquina de estados do tour — puro, sem React. `TourProvider` (Fase 2) é
 * quem observa a transição `running → idle` e marca o tour como visto: essa
 * separação é o que deixa a regra "quando marcar como visto" testável sem
 * montar componente nenhum.
 */
export type TourState =
  | { status: "idle" }
  | { status: "running"; index: number };

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "back" }
  | { type: "close" };

export function tourReducer(
  state: TourState,
  action: TourAction,
  total: number,
): TourState {
  switch (action.type) {
    case "start":
      return { status: "running", index: 0 };
    case "close":
      return { status: "idle" };
    case "next": {
      if (state.status !== "running") return state;
      const nextIndex = state.index + 1;
      // Próximo no último passo termina o tour — não existe passo `total`.
      return nextIndex >= total
        ? { status: "idle" }
        : { status: "running", index: nextIndex };
    }
    case "back": {
      if (state.status !== "running") return state;
      return { status: "running", index: Math.max(0, state.index - 1) };
    }
    default:
      return state;
  }
}
