"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

const TABS = [
  { href: "/cleanup", key: "cleanupStarsTab" as const },
  { href: "/cleanup/forks", key: "cleanupForksTab" as const },
];

export function CleanupTabs() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div role="tablist" className="flex gap-4 border-b border-border">
      {TABS.map((tab) => {
        const selected = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            className={cn(
              "-mb-px border-b pb-2 text-sm whitespace-nowrap",
              selected
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
