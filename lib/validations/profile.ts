import { z } from "zod";

import { CREST_COLORS, CREST_SHAPES, CREST_SYMBOLS } from "@/lib/crest/catalog";
import { teamNameField } from "@/lib/validations/team";

/**
 * Nome do time + brasão num schema só: a seção "Identidade do time" salva os
 * dois de uma vez, num único botão — duas ações/dois botões para a mesma
 * seção confundia mais do que ajudava.
 */
export const teamIdentitySchema = z.object({
  name: teamNameField,
  shape: z.enum(CREST_SHAPES, "Escolha um formato válido."),
  symbol: z.enum(CREST_SYMBOLS, "Escolha um símbolo válido."),
  background: z.enum(CREST_COLORS, "Escolha uma cor válida."),
  foreground: z.enum(CREST_COLORS, "Escolha uma cor válida."),
  border: z.enum(CREST_COLORS, "Escolha uma cor válida."),
});
export type TeamIdentityInput = z.infer<typeof teamIdentitySchema>;
/** Só a parte do brasão do formulário — o que `TeamCrest` espera renderizar. */
export type CrestInput = Omit<TeamIdentityInput, "name">;

export const sendFriendRequestSchema = z.object({
  username: z.string().trim().min(1, "Este campo é obrigatório."),
});
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;

export const respondToFriendRequestSchema = z.object({
  friendshipId: z.uuid("Pedido inválido."),
  accept: z.boolean(),
});
export type RespondToFriendRequestInput = z.infer<
  typeof respondToFriendRequestSchema
>;

export const removeFriendSchema = z.object({
  friendshipId: z.uuid("Amizade inválida."),
});
export type RemoveFriendInput = z.infer<typeof removeFriendSchema>;

export const inviteFriendToChampionshipSchema = z.object({
  championshipId: z.uuid("Campeonato inválido."),
  friendUserId: z.string().min(1, "Amigo inválido."),
});
export type InviteFriendToChampionshipInput = z.infer<
  typeof inviteFriendToChampionshipSchema
>;

// --- Formulários client-side (authClient), sem Server Action. ---

export const displayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Deve ter pelo menos 2 caracteres.")
    .max(50, "Deve ter no máximo 50 caracteres."),
});
export type DisplayNameInput = z.infer<typeof displayNameSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Este campo é obrigatório."),
    newPassword: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "Este campo é obrigatório."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
