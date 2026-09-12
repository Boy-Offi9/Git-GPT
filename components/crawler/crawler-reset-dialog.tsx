"use client";

import { useEffect, useState } from "react";
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

type CrawlerResetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (hard: boolean) => void;
};

export function CrawlerResetDialog({
  open,
  onOpenChange,
  onConfirm,
}: CrawlerResetDialogProps) {
  const { t } = useI18n();
  const [hard, setHard] = useState(false);

  useEffect(() => {
    if (open) {
      setHard(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {t("crawlerResetTitle")}
          </DialogTitle>
          <DialogDescription>
            {hard ? t("crawlerResetHardBody") : t("crawlerResetBody")}
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 shrink-0 accent-foreground"
            checked={hard}
            onChange={(e) => setHard(e.target.checked)}
          />
          <span>
            <span className="block font-medium text-foreground">
              {t("crawlerResetHardLabel")}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t("crawlerResetHardHint")}
            </span>
          </span>
        </label>

        <p className="border-l-2 border-foreground pl-3 text-sm leading-6 text-muted-foreground">
          {hard ? t("crawlerResetHardNote") : t("crawlerResetNote")}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm(hard);
            }}
          >
            {hard ? t("crawlerResetHard") : t("crawlerReset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
