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

type CleanupConfirmKind = "unstar" | "archive" | "unarchive" | "delete";

type CleanupConfirmDialogProps = {
  open: boolean;
  kind: CleanupConfirmKind;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

const COPY = {
  unstar: {
    title: "confirmUnstarTitle",
    body: "confirmUnstarBody",
    action: "confirmUnstarAction",
  },
  archive: {
    title: "confirmArchiveTitle",
    body: "confirmArchiveBody",
    action: "confirmArchiveAction",
  },
  unarchive: {
    title: "confirmUnarchiveTitle",
    body: "confirmUnarchiveBody",
    action: "confirmUnarchiveAction",
  },
  delete: {
    title: "confirmDeleteTitle",
    body: "confirmDeleteBody",
    action: "confirmYes",
  },
} as const;

export function CleanupConfirmDialog({
  open,
  kind,
  count,
  onOpenChange,
  onConfirm,
}: CleanupConfirmDialogProps) {
  const { t } = useI18n();
  const repos = count === 1 ? t("repoOne") : t("repoMany");
  const formatted = formatCount(count);
  const copy = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {t(copy.title, { count: formatted, repos })}
          </DialogTitle>
          <DialogDescription>{t(copy.body)}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={
              kind === "delete" || kind === "archive" ? "destructive" : "default"
            }
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {t(copy.action, { count: formatted })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
