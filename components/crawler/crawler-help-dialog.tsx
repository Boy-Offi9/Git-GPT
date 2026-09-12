"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  CirclePause,
  Database,
  Gauge,
  GitBranch,
  Infinity as InfinityIcon,
  ListOrdered,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Timer,
  Users,
} from "lucide-react";

type CrawlerHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const HOW_ITEMS = [
  { key: "crawlerInfo1" as const, icon: ListOrdered },
  { key: "crawlerInfo2" as const, icon: Users },
  { key: "crawlerInfo3" as const, icon: SkipForward },
  { key: "crawlerInfo4" as const, icon: SkipForward },
  { key: "crawlerInfo5" as const, icon: Database },
  { key: "crawlerInfo6" as const, icon: GitBranch },
  { key: "crawlerInfo7" as const, icon: ShieldAlert },
  { key: "crawlerInfo8" as const, icon: CirclePause },
  { key: "crawlerInfoReset" as const, icon: RotateCcw },
];

const SETTINGS_ITEMS = [
  { key: "crawlerInfoDelay" as const, icon: Timer },
  { key: "crawlerInfoCustomDelay" as const, icon: Gauge },
  { key: "crawlerInfoQueueLimit" as const, icon: InfinityIcon },
  { key: "crawlerInfoRunDuration" as const, icon: Timer },
];

export function CrawlerHelpDialog({
  open,
  onOpenChange,
}: CrawlerHelpDialogProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(85dvh,720px)] w-full max-w-[calc(100%-2rem)] top-[max(1rem,4dvh)] left-1/2 -translate-x-1/2 translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:top-[max(1.5rem,6dvh)]"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg font-medium">
            {t("crawlerInfoTitle")}
          </DialogTitle>
          <DialogDescription>{t("crawlerHint")}</DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
        >
          <ul className="space-y-3">
            {HOW_ITEMS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex gap-3 text-sm leading-5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted text-foreground">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="text-muted-foreground">{t(key)}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-medium">
              {t("crawlerInfoSettingsTitle")}
            </h3>
            <ul className="space-y-3">
              {SETTINGS_ITEMS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-3 text-sm leading-5">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted text-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-muted-foreground">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="shrink-0 px-5 pb-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("crawlerInfoClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
