"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCount } from "@/lib/format";
import { useI18n } from "@/components/i18n/i18n-provider";

type CleanupConfirmKind = "unstar" | "archive" | "delete";

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
  delete: {
    title: "confirmDeleteTitle",
    body: "confirmDeleteBody",
    action: "confirmDeleteAction",
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
  const [typed, setTyped] = useState("");
  const repos = count === 1 ? t("repoOne") : t("repoMany");
  const formatted = formatCount(count);
  const copy = COPY[kind];
  const needsTypedConfirm = kind === "delete";
  const confirmWord = t("confirmDeleteConfirmWord");
  const canConfirm =
    !needsTypedConfirm || typed.trim().toLowerCase() === confirmWord;

  function close(next: boolean) {
    if (!next) setTyped("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            {t(copy.title, { count: formatted, repos })}
          </DialogTitle>
          <DialogDescription>{t(copy.body)}</DialogDescription>
        </DialogHeader>

        {needsTypedConfirm ? (
          <div className="space-y-2">
            <p className="border-l-2 border-destructive pl-3 text-sm leading-6 text-muted-foreground">
              {t("confirmDeleteWarning")}
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              aria-label={t("confirmDeleteWarning")}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={kind === "unstar" ? "default" : "destructive"}
            disabled={!canConfirm}
            onClick={() => {
              setTyped("");
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
