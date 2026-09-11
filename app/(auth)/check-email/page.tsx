import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";

export const metadata: Metadata = {
  title: "Confirme seu e-mail | VLR Fantasy",
};

const emailParamSchema = z.email();

export default async function CheckEmailPage(props: PageProps<"/check-email">) {
  const searchParams = await props.searchParams;
  const emailParam = searchParams?.email;
  const rawEmail = Array.isArray(emailParam) ? emailParam[0] : emailParam;
  const parsedEmail = emailParamSchema.safeParse(rawEmail);
  const email = parsedEmail.success ? parsedEmail.data : undefined;

  return (
    <AuthShell
      title="Confirme seu e-mail"
      description="Falta um passo para você entrar em campo."
      footer={
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Voltar para o login
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-3">
            <Mail className="size-6 text-primary" aria-hidden="true" />
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Mandamos um link de confirmação para{" "}
          {email ? (
            <span className="font-medium text-foreground">{email}</span>
          ) : (
            "o e-mail que você cadastrou"
          )}
          . Clique nele para começar a jogar.
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Não encontrou? Olhe também a caixa de spam.
        </p>
        <ResendVerification email={email} />
      </div>
    </AuthShell>
  );
}
