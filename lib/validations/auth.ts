import { z } from "zod";

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Deve ter pelo menos 2 caracteres."),
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
