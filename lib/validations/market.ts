import { z } from "zod";

export const substitutePlayerSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
  /** `null` quando a vaga está vazia — contratação sem ninguém saindo. */
  outgoingPlayerId: z.uuid("Jogador de saída inválido.").nullable(),
  incomingPlayerId: z.uuid("Jogador de entrada inválido."),
});

export type SubstitutePlayerInput = z.infer<typeof substitutePlayerSchema>;

export const setCaptainSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
});

export type SetCaptainInput = z.infer<typeof setCaptainSchema>;
