"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
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
import type { MessageKey } from "@/lib/i18n/core";
import type {
  BulkUnfollowProgress,
  BulkUnfollowResult,
} from "@/types/github";

export type BulkProgressAction =
  | "unfollow"
  | "follow"
  | "star"
  | "unstar"
  | "archive"
  | "delete";

type BulkProgressDialogProps = {
  open: boolean;
  runId?: number;
  progress: BulkUnfollowProgress;
  result: BulkUnfollowResult | null;
  cancelling?: boolean;
  concurrency?: number;
  action?: BulkProgressAction;
  onStop: () => void;
  onClose: () => void;
  onRetry: () => void;
};

/** Per-action copy. Anything not listed here falls back to the "unfollow" wording. */
const ACTION_KEYS: Partial<
  Record<
    BulkProgressAction,
    {
      title: MessageKey;
      summary: MessageKey;
      working: MessageKey;
      ok: MessageKey;
      stopTitle: MessageKey;
      stopBody: MessageKey;
    }
  >
> = {
  follow: {
    title: "progressFollowTitle",
    summary: "progressFollowSummary",
    working: "progressFollowWorking",
    ok: "progressFollowOk",
    stopTitle: "progressFollowStopTitle",
    stopBody: "progressFollowStopBody",
  },
  star: {
    title: "progressStarTitle",
    summary: "progressStarSummary",
    working: "progressStarWorking",
    ok: "progressStarOk",
    stopTitle: "progressStarStopTitle",
    stopBody: "progressStarStopBody",
  },
  unstar: {
    title: "progressUnstarTitle",
    summary: "progressUnstarSummary",
    working: "progressUnstarWorking",
    ok: "progressUnstarOk",
    stopTitle: "progressUnstarStopTitle",
    stopBody: "progressUnstarStopBody",
  },
  archive: {
    title: "progressArchiveTitle",
    summary: "progressArchiveSummary",
    working: "progressArchiveWorking",
    ok: "progressArchiveOk",
    stopTitle: "progressArchiveStopTitle",
    stopBody: "progressArchiveStopBody",
  },
  delete: {
    title: "progressDeleteTitle",
    summary: "progressDeleteSummary",
    working: "progressDeleteWorking",
    ok: "progressDeleteOk",
    stopTitle: "progressDeleteStopTitle",
    stopBody: "progressDeleteStopBody",
  },
};

/** Rows in the "sending now" list are shown as plain names rather than "@login" for these actions. */
const PLAIN_NAME_ACTIONS: ReadonlySet<BulkProgressAction> = new Set([
  "star",
  "unstar",
  "archive",
  "delete",
]);

export function BulkProgressDialog({
  open,
  runId = 0,
  progress,
  result,
  cancelling = false,
  concurrency = 3,
  action = "unfollow",
  onStop,
  onClose,
  onRetry,
}: BulkProgressDialogProps) {
  const { t } = useI18n();
  const [confirmStop, setConfirmStop] = useState(false);
  const [seenRunId, setSeenRunId] = useState(runId);
  if (seenRunId !== runId) {
    setSeenRunId(runId);
    setConfirmStop(false);
  }
  const running = !result;
  const failedCount = result?.failed.length ?? progress.failed;
  const abortedCount = result?.aborted.length ?? 0;
  const percent =
    progress.total === 0
      ? 0
      : Math.round((progress.sent / progress.total) * 100);

  const copy = ACTION_KEYS[action];
  const runningTitle = copy ? t(copy.title) : t("progressTitle");
  const summaryKey = copy ? copy.summary : "progressSummary";
  const workingKey = copy ? copy.working : "progressWorking";
  const okLabel = copy ? t(copy.ok) : t("progressOk");
  const stopTitle = copy ? t(copy.stopTitle) : t("progressStopTitle");
  const stopBody = copy ? t(copy.stopBody) : t("progressStopBody");

  const title = running
    ? cancelling
      ? t("progressStopping")
      : runningTitle
    : result.abortReason === "rate_limited"
      ? t("progressRateLimit")
      : result.abortReason === "unauthorized"
        ? t("progressExpired")
        : result.abortReason === "cancelled"
          ? t("progressCancelled")
          : t("progressDone");

  const summary = result
    ? t(summaryKey, {
        ok: formatCount(result.succeeded.length),
        failed:
          result.failed.length > 0
            ? t("progressFailed", {
                count: formatCount(result.failed.length),
              })
            : "",
        skipped:
          result.aborted.length > 0
            ? t("progressSkipped", {
                count: formatCount(result.aborted.length),
              })
            : "",
      })
    : t(workingKey, {
        count: concurrency,
      });

  function requestClose() {
    if (running) {
      setConfirmStop(true);
      return;
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal={running}
      onOpenChange={(next) => {
        if (!next) {
          requestClose();
        }
      }}
    >
      <DialogContent showCloseButton className="gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-medium">
            {running && !cancelling ? (
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-mark" />
            ) : null}
            {title}
          </DialogTitle>
          <DialogDescription>
            <span aria-live="polite">{summary}</span>
          </DialogDescription>
        </DialogHeader>

        <div aria-live="polite" aria-atomic="true">
          <p
            key={progress.succeeded}
            className="font-mono text-5xl leading-none tabular-nums tracking-tight text-mark"
          >
            {formatCount(progress.succeeded)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{okLabel}</p>
        </div>

        <dl className="divide-y divide-border border-y text-sm">
          <Stat
            label={t("progressSent")}
            value={progress.sent}
            live={running}
          />
          <Stat
            label={t("progressRemaining")}
            value={result ? result.aborted.length : progress.remaining}
          />
          {failedCount > 0 ? (
            <Stat
              label={t("progressFailedLabel")}
              value={failedCount}
              tone="danger"
            />
          ) : null}
        </dl>

        {running ? (
          <div aria-live="polite">
            <p className="text-xs text-muted-foreground">
              {t("progressInFlight")}
            </p>
            <ul className="mt-2 space-y-1 font-mono text-sm tabular-nums">
              {Array.from({ length: concurrency }, (_, index) => {
                const login = progress.current[index];
                return (
                  <li
                    key={index}
                    className="h-5 truncate leading-5 text-foreground"
                  >
                    {login
                      ? PLAIN_NAME_ACTIONS.has(action)
                        ? login
                        : `@${login}`
                      : "\u00A0"}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="relative h-1 overflow-hidden bg-border">
          <div
            className="h-full bg-foreground transition-[width] duration-300"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
          {running ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="bulk-shimmer h-full w-1/3 bg-foreground/20" />
            </div>
          ) : null}
        </div>

        {confirmStop && running ? (
          <div className="border-l-2 border-foreground pl-3">
            <p className="text-sm font-medium">{stopTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {stopBody}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {confirmStop && running ? (
            <>
              <Button variant="outline" onClick={() => setConfirmStop(false)}>
                {t("progressStopKeep")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmStop(false);
                  onStop();
                }}
              >
                {t("progressStopConfirm")}
              </Button>
            </>
          ) : running ? (
            <Button
              variant="outline"
              onClick={() => setConfirmStop(true)}
              disabled={cancelling}
            >
              {t("progressStop")}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {t("done")}
              </Button>
              {failedCount > 0 || abortedCount > 0 ? (
                <Button onClick={onRetry}>
                  <RotateCcw />
                  {t("retryRemaining")}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  live = false,
  tone,
}: {
  label: string;
  value: number;
  live?: boolean;
  tone?: "danger";
}) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "font-mono tabular-nums text-destructive"
            : live
              ? "font-mono tabular-nums text-foreground"
              : "font-mono tabular-nums"
        }
      >
        {formatCount(value)}
      </dd>
    </div>
  );
}
