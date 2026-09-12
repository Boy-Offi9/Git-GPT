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

type FollowConfirmDialogProps = {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function FollowConfirmDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: FollowConfirmDialogProps) {
  const { t } = useI18n();
  const accounts = count === 1 ? t("accountOne") : t("accountMany");
  const formatted = formatCount(count);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {t("confirmFollowTitle", { count: formatted, accounts })}
          </DialogTitle>
          <DialogDescription>{t("confirmFollowBody")}</DialogDescription>
        </DialogHeader>

        <p className="border-l-2 border-foreground pl-3 text-sm leading-6 text-muted-foreground">
          {t("confirmFollowWarning")}
          {count > 10 ? (
            <span className="mt-2 block">{t("confirmFollowSlowNote")}</span>
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
            {t("confirmFollowAction", { count: formatted })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
