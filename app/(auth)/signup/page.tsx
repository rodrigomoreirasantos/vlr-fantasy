import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Separator } from "@/components/ui/separator";
import { auth, isGoogleConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Criar conta | VLR Fantasy",
};

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/home");
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Monte seu time dos sonhos e dispute o topo do ranking."
      footerText="Já tem uma conta?"
      footerLinkText="Entrar"
      footerLinkHref="/login"
    >
      <div className="space-y-4">
        <SignUpForm />
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
