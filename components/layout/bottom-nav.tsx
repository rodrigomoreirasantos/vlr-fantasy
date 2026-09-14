"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECTIONS } from "@/components/layout/sections";
import { cn } from "@/lib/utils";

/**
 * Navegação do celular (`< md`): o header perde a `nav` nesse tamanho
 * (`app-header.tsx`) e esta barra assume, fixa no rodapé e sempre alcançável
 * pelo polegar. Mesmas 4 seções do header — `SECTIONS` é a única fonte, para
 * as duas nunca divergirem.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-sidebar/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {SECTIONS.map(({ label, icon: Icon, href }) => {
        const current = pathname.startsWith(href);

        return (
          <Link
            key={label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              current ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-0.5 w-8 rounded-full",
                current ? "bg-primary" : "bg-transparent",
              )}
            />
            <Icon aria-hidden className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
