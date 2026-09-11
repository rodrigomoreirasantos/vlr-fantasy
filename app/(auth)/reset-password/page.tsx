import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { translateAuthError } from "@/lib/auth-errors";

export const metadata: Metadata = {
  title: "Redefinir senha | VLR Fantasy",
  // O token viaja na query. `no-referrer` evita que ele escape no header
  // Referer de qualquer requisição disparada por esta página.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage(
  props: PageProps<"/reset-password">,
) {
  const searchParams = await props.searchParams;
  const errorParam = searchParams?.error;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const tokenParam = searchParams?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  if (error || !token) {
    return (
      <AuthShell
        title="Não foi possível redefinir"
        description="O link de redefinição não é mais válido."
        footer={
          <Link
            href="/forgot-password"
            className="font-medium text-primary hover:underline"
          >
            Pedir um novo link
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertDescription>
            {translateAuthError(error ?? "INVALID_TOKEN")}
          </AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Redefinir senha"
      description="Escolha uma nova senha para sua conta."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
