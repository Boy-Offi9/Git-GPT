"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { useI18n } from "@/components/i18n/i18n-provider";

type StarConfirmDialogProps = {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function StarConfirmDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: StarConfirmDialogProps) {
  const { t } = useI18n();
  const repos = count === 1 ? t("repoOne") : t("repoMany");
  const formatted = formatCount(count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {t("confirmStarTitle", { count: formatted, repos })}
          </DialogTitle>
          <DialogDescription>{t("confirmStarBody")}</DialogDescription>
        </DialogHeader>

        <p className="border-l-2 border-foreground pl-3 text-sm leading-6 text-muted-foreground">
          {t("confirmStarWarning")}
          {count > 10 ? (
            <span className="mt-2 block">{t("confirmStarSlowNote")}</span>
          ) : null}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {t("confirmStarAction", { count: formatted })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
