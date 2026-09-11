import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { translateAuthError } from "@/lib/auth-errors";

export const metadata: Metadata = {
  title: "Confirmar e-mail | VLR Fantasy",
};

/**
 * O link do e-mail aponta para o **endpoint** do better-auth
 * (`/api/auth/verify-email?token=…&callbackURL=/verify-email`), que valida o
 * token e então redireciona para cá — com `?error=<código>` em caso de falha
 * ou limpo em caso de sucesso, já com o cookie de sessão gravado
 * (`emailVerification.autoSignInAfterVerification`, lib/auth.ts).
 *
 * Por isso esta página trata três casos, nesta ordem: erro no token; sucesso
 * com sessão (o caminho feliz — o usuário clicou e já está logado); sucesso
 * sem sessão (verificou em outro navegador).
 */
export default async function VerifyEmailPage(
  props: PageProps<"/verify-email">,
) {
  const searchParams = await props.searchParams;
  const errorParam = searchParams?.error;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;

  if (error) {
    return (
      <AuthShell
        title="Não foi possível confirmar"
        description="O link de verificação não é mais válido."
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
          <Alert variant="destructive">
            <AlertDescription>{translateAuthError(error)}</AlertDescription>
          </Alert>
          <ResendVerification />
        </div>
      </AuthShell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/home");
  }

  return (
    <AuthShell
      title="E-mail confirmado"
      description="Sua conta já está pronta."
    >
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-success/10 p-3">
            <MailCheck className="size-6 text-success" aria-hidden="true" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Seu e-mail foi confirmado. Entre para montar seu time.
        </p>
        <Button asChild className="w-full">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
