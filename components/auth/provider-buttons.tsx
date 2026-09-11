"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth-client";
import type { SocialProviderId } from "@/lib/auth";

type ProviderButtonsProps = {
  providers: SocialProviderId[];
};

const PROVIDER_LABEL: Record<SocialProviderId, string> = {
  google: "Google",
  twitch: "Twitch",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.19 7.19 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function TwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#9146FF"
        d="M4.32 0 1.44 3.6v16.8h5.76V24h3.12l3.12-3.6h4.8L23.52 15.6V0Zm2.16 2.16h14.88v11.52l-3.36 3.36h-4.8l-3.12 3.36v-3.36H6.48Z"
      />
      <path fill="#9146FF" d="M17.28 5.76h2.16v6.48h-2.16Z" />
      <path fill="#9146FF" d="M11.52 5.76h2.16v6.48h-2.16Z" />
    </svg>
  );
}

const PROVIDER_ICON: Record<SocialProviderId, () => React.ReactElement> = {
  google: GoogleIcon,
  twitch: TwitchIcon,
};

/**
 * Um botão por provedor OAuth configurado (`configuredSocialProviders`,
 * lib/auth.ts) — generaliza o antigo `GoogleButton`. Lista vazia: não
 * renderiza nada, nem o separador "OU".
 */
export function ProviderButtons({ providers }: ProviderButtonsProps) {
  const [loadingProvider, setLoadingProvider] =
    useState<SocialProviderId | null>(null);

  if (providers.length === 0) return null;

  const handleClick = async (provider: SocialProviderId) => {
    setLoadingProvider(provider);
    await signIn.social({
      provider,
      callbackURL: "/home",
      // Sem isto, um erro de OAuth (conta não vinculada, provedor sem
      // e-mail etc) cai na página em inglês do better-auth — ver
      // `translateOAuthError` (lib/auth-errors.ts) e `app/(auth)/login/page.tsx`.
      errorCallbackURL: "/login",
    });
    setLoadingProvider(null);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Separator />
        <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          OU
        </span>
      </div>
      <div className="space-y-2">
        {providers.map((provider) => {
          const Icon = PROVIDER_ICON[provider];
          const isLoading = loadingProvider === provider;
          return (
            <Button
              key={provider}
              type="button"
              variant="outline"
              className="w-full"
              disabled={loadingProvider !== null}
              onClick={() => handleClick(provider)}
            >
              <Icon />
              {isLoading
                ? "Conectando…"
                : `Continuar com ${provider === "google" ? "o" : "a"} ${PROVIDER_LABEL[provider]}`}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
