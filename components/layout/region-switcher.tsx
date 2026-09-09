"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { regionHref } from "@/lib/team/region-href";
import { regionColor, regionLabel, type TeamRegion } from "@/lib/round/regions";

export function RegionSwitcher({
  current,
  available,
}: {
  current: TeamRegion;
  /** As regiões que o header pode oferecer agora — vem do layout (`resolveRegion`). */
  available: readonly TeamRegion[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Trocar de região (${regionLabel(current)})`}
        className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase transition-opacity hover:opacity-80"
        style={{ color: regionColor(current) }}
      >
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ backgroundColor: regionColor(current) }}
        />
        {regionLabel(current)}
        <ChevronDown aria-hidden className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {available.map((region) => (
          <DropdownMenuItem key={region} asChild className="cursor-pointer">
            <Link
              href={regionHref(pathname, region, searchParams)}
              prefetch={false}
              aria-current={region === current ? "page" : undefined}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: regionColor(region) }}
              />
              {regionLabel(region)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
