import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { auth, configuredSocialProviders } from "@/lib/auth";
import { translateOAuthError } from "@/lib/auth-errors";

export const metadata: Metadata = {
  title: "Entrar | VLR Fantasy",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/home");
  }

  const searchParams = await props.searchParams;
  const oauthErrorParam = searchParams?.error;
  const oauthError = Array.isArray(oauthErrorParam)
    ? oauthErrorParam[0]
    : oauthErrorParam;
  const resetSuccess = searchParams?.reset === "1";

  return (
    <AuthShell
      title="Entrar"
      description="Acesse sua conta para gerenciar seu time."
      footer={
        <>
          Ainda não tem uma conta?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline"
          >
            Criar conta
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {oauthError && (
          // O callback OAuth (`errorCallbackURL`, `provider-buttons.tsx`) devolve
          // o erro como `?error=<codigo>` em minúsculas com underscore — formato
          // diferente do `$ERROR_CODES` do better-auth, daí o tradutor à parte.
          <Alert variant="destructive">
            <AlertDescription>
              {translateOAuthError(oauthError)}
            </AlertDescription>
          </Alert>
        )}
        {resetSuccess && (
          <Alert>
            <AlertDescription>
              Senha redefinida. Entre com a nova senha.
            </AlertDescription>
          </Alert>
        )}
        <SignInForm />
        <ProviderButtons providers={configuredSocialProviders} />
      </div>
    </AuthShell>
  );
}
