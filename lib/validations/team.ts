import { z } from "zod";

/**
 * Regra única do nome do time — compartilhada pelo cadastro
 * (`lib/validations/auth.ts`) e pela renomeação no perfil
 * (`lib/validations/profile.ts`), para as duas telas nunca divergirem.
 */
export const teamNameField = z
  .string()
  .trim()
  .min(3, "Deve ter pelo menos 3 caracteres.")
  .max(30, "Deve ter no máximo 30 caracteres.");
