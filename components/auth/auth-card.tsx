import Link from "next/link";
import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText: string;
  footerLinkText: string;
  footerLinkHref: string;
};

export function AuthCard({
  title,
  subtitle,
  children,
  footerText,
  footerLinkText,
  footerLinkHref,
}: AuthCardProps) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <span className="text-xl font-bold tracking-tight text-primary">
          VLR<span className="text-foreground">FANTASY</span>
        </span>
      </div>
      <Card className="clip-corner border-none ring-1 ring-border">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {footerText}{" "}
        <Link
          href={footerLinkHref}
          className="font-medium text-primary hover:underline"
        >
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}
