import { z } from "zod";

import { TEAM_REGIONS } from "@/lib/round/regions";

export const createChampionshipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Deve ter pelo menos 3 caracteres.")
    .max(40, "Deve ter no máximo 40 caracteres."),
  region: z.enum(TEAM_REGIONS, "Escolha uma região válida."),
});

export type CreateChampionshipInput = z.infer<typeof createChampionshipSchema>;

export const inviteMemberSchema = z.object({
  championshipId: z.uuid("Campeonato inválido."),
  username: z.string().trim().min(1, "Este campo é obrigatório."),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const respondToInviteSchema = z.object({
  memberId: z.uuid("Convite inválido."),
  accept: z.boolean(),
});

export type RespondToInviteInput = z.infer<typeof respondToInviteSchema>;
