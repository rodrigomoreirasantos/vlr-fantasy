import { z } from "zod";

export const substitutePlayerSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
  outgoingPlayerId: z.uuid("Jogador de saída inválido."),
  incomingPlayerId: z.uuid("Jogador de entrada inválido."),
});

export type SubstitutePlayerInput = z.infer<typeof substitutePlayerSchema>;
