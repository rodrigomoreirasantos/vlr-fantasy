import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  /**
   * `ReactNode`, não texto + link fixos: `/check-email` e `/reset-password`
   * têm rodapés que não são "texto + um link" (botão de reenvio, aviso de
   * segurança etc).
   */
  footer?: ReactNode;
};

const BRAND_POINTS = [
  "5 jogadores profissionais",
  "mercado entre as rodadas",
  "pontuação real do VCT",
];

/**
 * Moldura visual compartilhada por `/login`, `/signup` e as telas de
 * verificação/recuperação de senha — duas colunas a partir de `lg`, uma
 * coluna só (painel de marca vira um cabeçalho baixo) abaixo disso.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative flex min-h-[24vh] items-center justify-center overflow-hidden bg-background px-8 py-10 lg:min-h-screen lg:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, var(--color-primary) 0px, var(--color-primary) 1px, transparent 1px, transparent 64px)",
          }}
        />
        <div className="relative max-w-sm">
          <div className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-primary">VLR</span>
            <span className="text-foreground">FANTASY</span>
          </div>
          <p className="mt-4 hidden text-sm text-muted-foreground sm:block">
            Monte seu time com jogadores reais do circuito e dispute o topo do
            ranking.
          </p>
          <ul className="mt-6 hidden space-y-2.5 lg:block">
            {BRAND_POINTS.map((point) => (
              <li
                key={point}
                className="border-l-2 border-primary pl-3 text-sm text-muted-foreground"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10 lg:py-12">
        <div className="w-full max-w-md">
          <Card className="clip-corner border-none ring-1 ring-border [--clip:20px]">
            <CardHeader>
              <h1 className="font-heading text-xl font-medium text-foreground">
                {title}
              </h1>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          {footer && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
