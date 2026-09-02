import { z } from "zod";

import { teamNameField } from "@/lib/validations/team";

// O cadastro coleta os quatro dados que definem a conta: e-mail, nome do time,
// nickname (`@login`) e senha. Não há campo de nome de exibição — ele nasce do
// nickname e é editável depois em `/profile` (`displayNameSchema`).
export const signUpSchema = z
  .object({
    email: z.email("E-mail inválido."),
    teamName: teamNameField,
    username: z
      .string()
      .trim()
      .min(3, "Deve ter pelo menos 3 caracteres.")
      .max(20, "Deve ter no máximo 20 caracteres.")
      .regex(
        /^[a-zA-Z0-9_.]+$/,
        "Use apenas letras, números, ponto e underline.",
      ),
    password: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("E-mail inválido."),
  password: z.string().min(1, "Este campo é obrigatório."),
});

export type SignInInput = z.infer<typeof signInSchema>;
