import { z } from "zod";

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Deve ter pelo menos 2 caracteres."),
    username: z
      .string()
      .trim()
      .min(3, "Deve ter pelo menos 3 caracteres.")
      .max(20, "Deve ter no máximo 20 caracteres.")
      .regex(
        /^[a-zA-Z0-9_.]+$/,
        "Use apenas letras, números, ponto e underline.",
      ),
    email: z.email("E-mail inválido."),
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
