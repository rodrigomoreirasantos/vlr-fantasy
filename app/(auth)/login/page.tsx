import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Separator } from "@/components/ui/separator";
import { auth, isGoogleConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Entrar | VLR Fantasy",
};

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/my-team");
  }

  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse sua conta para gerenciar seu time."
      footerText="Ainda não tem uma conta?"
      footerLinkText="Criar conta"
      footerLinkHref="/signup"
    >
      <div className="space-y-4">
        <SignInForm />
        {isGoogleConfigured && (
          <>
            <div className="relative">
              <Separator />
              <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                OU
              </span>
            </div>
            <GoogleButton />
          </>
        )}
      </div>
    </AuthCard>
  );
}
