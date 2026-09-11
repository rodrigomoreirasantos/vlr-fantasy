import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { auth, configuredSocialProviders } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Criar conta | VLR Fantasy",
};

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/home");
  }

  return (
    <AuthShell
      title="Criar conta"
      description="Monte seu time dos sonhos e dispute o topo do ranking."
      footer={
        <>
          Já tem uma conta?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            Entrar
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <SignUpForm />
        <ProviderButtons providers={configuredSocialProviders} />
      </div>
    </AuthShell>
  );
}
