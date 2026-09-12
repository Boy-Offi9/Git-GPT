"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Bot,
  CircleHelp,
  ListOrdered,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/navigation/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrawlerClearLogsDialog } from "@/components/crawler/crawler-clear-logs-dialog";
import { CrawlerDemoOverlay } from "@/components/crawler/crawler-demo-overlay";
import { CrawlerHelpDialog } from "@/components/crawler/crawler-help-dialog";
import {
  formatLogAt,
  logRowClass,
  withLogMark,
  type CrawlerLogItem,
} from "@/components/crawler/crawler-log-display";
import { CrawlerLogsDialog } from "@/components/crawler/crawler-logs-dialog";
import { CrawlerResetDialog } from "@/components/crawler/crawler-reset-dialog";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import {
  DELAY_NONE_PRESET,
  DELAY_PRESETS,
  QUEUE_LIMIT_PRESETS,
  RUN_DURATION_PRESETS,
  UNLIMITED_QUEUE_LIMIT,
  isUnlimitedQueue,
} from "@/lib/crawler/types";
import { cn } from "@/lib/utils";

type CrawlerStatusPayload = {
  status: string;
  currentUsername: string | null;
  delaySeconds: number;
  queueLimit: number;
  runDurationMinutes: number;
  runEndsAt: string | null;
  runStartedAt: string | null;
  runElapsedMs: number;
  queueSize: number;
  waitingQueue?: {
    id: number;
    githubUserId: number;
    username: string;
    status: string;
    discoveredAt: string;
  }[];
  lastActivityAt: string | null;
  lastError: string | null;
  counts: {
    followed: number;
    skipped: number;
    failed: number;
    discovered: number;
  };
  hasWorkerCredentials: boolean;
};

type LogItem = CrawlerLogItem;

const STATUS_LABEL: Record<string, MessageKey> = {
  idle: "crawlerStatusIdle",
  running: "crawlerStatusRunning",
  paused: "crawlerStatusPaused",
  rate_limited: "crawlerStatusRateLimited",
  error: "crawlerStatusError",
};

function formatActivityAt(iso: string): string {
  return formatLogAt(iso);
}

/** Elapsed run time: `M:SS` or `H:MM:SS`. */
function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

export function CrawlerView() {
  const { t } = useI18n();
  const [status, setStatus] = useState<CrawlerStatusPayload | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [customDelay, setCustomDelay] = useState("");
  const [queueLimitInput, setQueueLimitInput] = useState("50");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [hydratedSettings, setHydratedSettings] = useState(false);
  const [showCustomDelay, setShowCustomDelay] = useState(false);
  const [showCustomQueue, setShowCustomQueue] = useState(false);
  const [seedSource, setSeedSource] = useState("");
  const [seedOpen, setSeedOpen] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const delayKnownSeconds = [
    ...DELAY_PRESETS.map((p) => p.seconds),
    DELAY_NONE_PRESET.seconds,
  ];
  const queuePresetLimits = [
    ...QUEUE_LIMIT_PRESETS,
    UNLIMITED_QUEUE_LIMIT,
  ];

  const refresh = useCallback(async () => {
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch("/api/crawler/status", { cache: "no-store" }),
        fetch("/api/crawler/logs?limit=40", { cache: "no-store" }),
      ]);
      if (statusRes.status === 503) {
        setLoadError("database_unconfigured");
        return;
      }
      if (!statusRes.ok) {
        setLoadError("failed");
        return;
      }
      setLoadError(null);
      const statusJson = (await statusRes.json()) as CrawlerStatusPayload;
      setStatus(statusJson);
      setHydratedSettings((was) => {
        if (!was) {
          setCustomDelay(String(statusJson.delaySeconds));
          setQueueLimitInput(
            isUnlimitedQueue(statusJson.queueLimit)
              ? ""
              : String(statusJson.queueLimit),
          );
          setShowCustomDelay(
            !delayKnownSeconds.includes(statusJson.delaySeconds),
          );
          setShowCustomQueue(
            !isUnlimitedQueue(statusJson.queueLimit) &&
              !QUEUE_LIMIT_PRESETS.includes(
                statusJson.queueLimit as (typeof QUEUE_LIMIT_PRESETS)[number],
              ),
          );
        }
        return true;
      });
      if (logsRes.ok) {
        const logsJson = (await logsRes.json()) as { logs: LogItem[] };
        setLogs(logsJson.logs);
      }
    } catch {
      setLoadError("failed");
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 2000);
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [refresh]);

  useEffect(() => {
    if (status?.status !== "running" || !status.runStartedAt) {
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [status?.status, status?.runStartedAt]);

  function runAction(path: string, body?: Record<string, unknown>) {
    startTransition(async () => {
      const res = await fetch(path, {
        method: "POST",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!res.ok) {
        toast.error(t("errorFailed"));
        return;
      }
      await refresh();
    });
  }

  function clearLogs() {
    startTransition(async () => {
      const res = await fetch("/api/crawler/logs", { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("errorFailed"));
        return;
      }
      toast.success(t("crawlerClearLogsDone"));
      await refresh();
    });
  }

  function seedFromProfile() {
    const source = seedSource.trim();
    if (!source) {
      toast.error(t("crawlerSeedInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/crawler/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (res.status === 422) {
        toast.error(t("crawlerSeedInvalid"));
        return;
      }
      if (res.status === 404) {
        toast.error(t("crawlerSeedNotFound"));
        return;
      }
      if (res.status === 409) {
        const errJson = (await res.json().catch(() => null)) as {
          login?: string | null;
        } | null;
        toast.error(
          t("crawlerSeedNone", {
            login: errJson?.login || "user",
          }),
        );
        await refresh();
        return;
      }
      if (!res.ok) {
        toast.error(t("errorFailed"));
        return;
      }
      const json = (await res.json()) as {
        added: number;
        login: string;
      };
      toast.success(
        t("crawlerSeedDone", { count: json.added, login: json.login }),
      );
      await refresh();
    });
  }

  function saveSettings(patch: {
    delaySeconds?: number;
    queueLimit?: number;
    runDurationMinutes?: number;
  }) {
    startTransition(async () => {
      const res = await fetch("/api/crawler/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error(t("errorFailed"));
        return;
      }
      if (patch.delaySeconds !== undefined) {
        setCustomDelay(String(patch.delaySeconds));
        setShowCustomDelay(!delayKnownSeconds.includes(patch.delaySeconds));
      }
      if (patch.queueLimit !== undefined) {
        setQueueLimitInput(
          isUnlimitedQueue(patch.queueLimit) ? "" : String(patch.queueLimit),
        );
        setShowCustomQueue(!queuePresetLimits.includes(patch.queueLimit));
      }
      await refresh();
    });
  }

  const statusKey: MessageKey = status
    ? (STATUS_LABEL[status.status] ?? "crawlerStatusIdle")
    : "crawlerStatusIdle";
  const running = status?.status === "running";
  const pausedLike =
    status?.status === "paused" ||
    status?.status === "rate_limited" ||
    status?.status === "error";
  const showElapsed = Boolean(status && status.status !== "idle");
  const elapsedMs = running
    ? Math.max(
        0,
        nowMs -
          (status?.runStartedAt
            ? new Date(status.runStartedAt).getTime()
            : nowMs),
      )
    : (status?.runElapsedMs ?? 0);
  const queueLabel = status
    ? isUnlimitedQueue(status.queueLimit)
      ? `${status.queueSize} / ${t("crawlerQueueDisplayUnlimited")}`
      : `${status.queueSize} / ${status.queueLimit}`
    : `0 / 50`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4">
      <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="size-5 shrink-0" aria-hidden="true" />
            {t("crawlerTitle")}
            <span className="border border-mark/40 bg-mark/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-mark">
              {t("homeToolVip")}
            </span>
          </span>
        }
        description={t("crawlerHint")}
        backHref="/"
        action={
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-sm text-muted-foreground/50 hover:text-muted-foreground"
              aria-label={t("crawlerDemoAria")}
              onClick={() => setDemoOpen(true)}
            >
              <Sparkles className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-sm text-muted-foreground/50 hover:text-muted-foreground"
              aria-label={t("crawlerHelpAria")}
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div
        className={cn(
          "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm",
          running
            ? "border-emerald-500/40 bg-emerald-500/10"
            : pausedLike
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-muted/30",
        )}
        aria-live="polite"
      >
        {running ? (
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              pausedLike ? "bg-amber-500" : "bg-muted-foreground/50",
            )}
          />
        )}
        <p
          className={cn(
            "min-w-0 flex-1 font-medium",
            pausedLike && "text-amber-700 dark:text-amber-400",
          )}
        >
          {t(statusKey)}
        </p>
        {showElapsed ? (
          <p
            className={cn(
              "shrink-0 tabular-nums font-medium tracking-tight",
              running
                ? "text-emerald-700 dark:text-emerald-400"
                : pausedLike
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
            title={t("crawlerRunElapsed")}
          >
            {formatElapsedMs(elapsedMs)}
          </p>
        ) : null}
      </div>

      {loadError === "database_unconfigured" ? (
        <p className="rounded-sm border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("crawlerDbMissing")}
        </p>
      ) : null}

      <section className="space-y-3 rounded-sm border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {t("crawlerLabel")}: {t(statusKey)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="rounded-sm"
              disabled={pending || running}
              onClick={() => runAction("/api/crawler/start")}
            >
              {pending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {t("crawlerStart")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-sm"
              disabled={pending || !running}
              onClick={() => runAction("/api/crawler/stop")}
            >
              <Pause className="size-3.5" />
              {t("crawlerStop")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-sm"
              disabled={pending || running}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-3.5" />
              {t("crawlerReset")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "rounded-sm text-muted-foreground",
                seedOpen && "bg-muted text-foreground",
              )}
              disabled={pending}
              aria-expanded={seedOpen}
              aria-controls="crawler-seed-panel"
              onClick={() => setSeedOpen((open) => !open)}
            >
              <UserPlus className="size-3.5" />
              {t("crawlerSeedToggle")}
            </Button>
          </div>
        </div>

        {seedOpen ? (
          <div
            id="crawler-seed-panel"
            className="space-y-2 rounded-sm border border-dashed border-border/80 bg-muted/20 p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("crawlerSeedHint")}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 rounded-sm text-muted-foreground"
                aria-label={t("crawlerSeedClose")}
                onClick={() => setSeedOpen(false)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={seedSource}
                onChange={(e) => setSeedSource(e.target.value)}
                placeholder={t("crawlerSeedPlaceholder")}
                className="h-8 rounded-sm sm:flex-1"
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    seedFromProfile();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-sm shrink-0"
                disabled={pending || !seedSource.trim()}
                onClick={seedFromProfile}
              >
                {pending ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : null}
                {t("crawlerSeedApply")}
              </Button>
            </div>
          </div>
        ) : null}

        {running && status?.runEndsAt ? (
          <p className="text-xs text-muted-foreground">
            {t("crawlerRunEnds")}: {formatActivityAt(status.runEndsAt)}
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Stat
            label={t("crawlerCurrent")}
            value={
              status?.currentUsername ? (
                <a
                  href={`https://github.com/${encodeURIComponent(status.currentUsername)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-foreground underline-offset-2 hover:underline"
                >
                  @{status.currentUsername}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Stat label={t("crawlerQueue")} value={queueLabel} />
          <Stat
            label={t("crawlerFollowed")}
            value={String(status?.counts.followed ?? 0)}
          />
          <Stat
            label={t("crawlerSkipped")}
            value={String(status?.counts.skipped ?? 0)}
          />
          <Stat
            label={t("crawlerFailed")}
            value={String(status?.counts.failed ?? 0)}
          />
          <Stat
            label={t("crawlerDiscovered")}
            value={String(status?.counts.discovered ?? 0)}
          />
        </dl>

        {status?.lastError ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {status.lastError}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-sm border border-border p-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{t("crawlerSettingsTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("crawlerSettingsLiveHint")}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {t("crawlerDelayTitle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DELAY_PRESETS.map((preset) => (
              <Button
                key={preset.seconds}
                type="button"
                size="sm"
                variant={
                  !showCustomDelay && status?.delaySeconds === preset.seconds
                    ? "default"
                    : "outline"
                }
                className="rounded-sm"
                disabled={pending}
                onClick={() => {
                  setShowCustomDelay(false);
                  saveSettings({ delaySeconds: preset.seconds });
                }}
              >
                {t(preset.labelKey)}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={showCustomDelay ? "default" : "outline"}
              className="rounded-sm"
              disabled={pending}
              onClick={() => setShowCustomDelay(true)}
            >
              {t("crawlerDelayCustom")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                !showCustomDelay &&
                status?.delaySeconds === DELAY_NONE_PRESET.seconds
                  ? "default"
                  : "outline"
              }
              className="rounded-sm"
              disabled={pending}
              onClick={() => {
                setShowCustomDelay(false);
                saveSettings({ delaySeconds: DELAY_NONE_PRESET.seconds });
              }}
            >
              {t(DELAY_NONE_PRESET.labelKey)}
            </Button>
          </div>
          {showCustomDelay ? (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="custom-delay"
                >
                  {t("crawlerDelayCustomHint")}
                </label>
                <Input
                  id="custom-delay"
                  inputMode="numeric"
                  value={customDelay}
                  onChange={(e) => setCustomDelay(e.target.value)}
                  className="h-8 rounded-sm"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="rounded-sm"
                disabled={pending}
                onClick={() => {
                  const seconds = Number(customDelay);
                  if (!Number.isFinite(seconds) || seconds < 0) {
                    toast.error(t("crawlerDelayInvalid"));
                    return;
                  }
                  saveSettings({ delaySeconds: Math.floor(seconds) });
                }}
              >
                {t("crawlerApply")}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {t("crawlerRunTitle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RUN_DURATION_PRESETS.map((preset) => (
              <Button
                key={preset.minutes}
                type="button"
                size="sm"
                variant={
                  status?.runDurationMinutes === preset.minutes
                    ? "default"
                    : "outline"
                }
                className="rounded-sm"
                disabled={pending}
                onClick={() =>
                  saveSettings({ runDurationMinutes: preset.minutes })
                }
              >
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {t("crawlerQueueLimit")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUEUE_LIMIT_PRESETS.map((limit) => (
              <Button
                key={limit}
                type="button"
                size="sm"
                variant={
                  !showCustomQueue && status?.queueLimit === limit
                    ? "default"
                    : "outline"
                }
                className="rounded-sm"
                disabled={pending}
                onClick={() => {
                  setShowCustomQueue(false);
                  saveSettings({ queueLimit: limit });
                }}
              >
                {limit}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={showCustomQueue ? "default" : "outline"}
              className="rounded-sm"
              disabled={pending}
              onClick={() => setShowCustomQueue(true)}
            >
              {t("crawlerQueueCustom")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                !showCustomQueue &&
                status &&
                isUnlimitedQueue(status.queueLimit)
                  ? "default"
                  : "outline"
              }
              className="rounded-sm"
              disabled={pending}
              onClick={() => {
                setShowCustomQueue(false);
                saveSettings({ queueLimit: UNLIMITED_QUEUE_LIMIT });
              }}
            >
              {t("crawlerQueueUnlimited")}
            </Button>
          </div>
          {showCustomQueue ? (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label
                  className="text-xs text-muted-foreground"
                  htmlFor="queue-limit"
                >
                  {t("crawlerQueueLimit")}
                </label>
                <Input
                  id="queue-limit"
                  inputMode="numeric"
                  value={queueLimitInput}
                  onChange={(e) => setQueueLimitInput(e.target.value)}
                  className="h-8 rounded-sm"
                  disabled={!hydratedSettings}
                  autoFocus
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="rounded-sm"
                disabled={pending}
                onClick={() => {
                  const limit = Number(queueLimitInput);
                  if (!Number.isFinite(limit) || limit < 1) {
                    toast.error(t("crawlerDelayInvalid"));
                    return;
                  }
                  saveSettings({ queueLimit: Math.floor(limit) });
                }}
              >
                {t("crawlerApply")}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-sm border border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <h2 className="shrink-0 text-sm font-medium">
            {showQueue ? t("crawlerWaitingQueue") : t("crawlerActivity")}
          </h2>
          {showQueue ? (
            <p className="min-w-0 flex-1 truncate text-xs tabular-nums text-muted-foreground">
              {queueLabel}
            </p>
          ) : status?.lastActivityAt ? (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {formatActivityAt(status.lastActivityAt)}
            </p>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-sm text-muted-foreground/70 hover:text-foreground",
                showQueue && "bg-muted text-foreground",
              )}
              aria-label={t("crawlerWaitingQueueAria")}
              aria-pressed={showQueue}
              onClick={() => setShowQueue((v) => !v)}
            >
              <ListOrdered className="size-4" />
            </Button>
            {!showQueue ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-sm text-muted-foreground/70 hover:text-foreground"
                  aria-label={t("crawlerLogsViewAria")}
                  disabled={pending}
                  onClick={() => setLogsOpen(true)}
                >
                  <ScrollText className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-sm text-muted-foreground/70 hover:text-foreground"
                  aria-label={t("crawlerClearLogsAria")}
                  disabled={pending || logs.length === 0}
                  onClick={() => setClearLogsOpen(true)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {showQueue ? (
          <ol className="max-h-64 space-y-1.5 overflow-y-auto overflow-x-hidden p-3 font-mono text-xs">
            {(status?.waitingQueue?.length ?? 0) === 0 ? (
              <li className="text-muted-foreground">
                {t("crawlerWaitingQueueEmpty")}
              </li>
            ) : (
              <>
                {(status?.waitingQueue ?? []).map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <span className="w-5 shrink-0 tabular-nums text-[10px] opacity-60">
                      {index + 1}
                    </span>
                    <a
                      href={`https://github.com/${encodeURIComponent(item.username)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-foreground underline-offset-2 hover:underline"
                    >
                      @{item.username}
                    </a>
                    {item.status === "processing" ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        {t("crawlerWaitingProcessing")}
                      </span>
                    ) : null}
                  </li>
                ))}
                {status &&
                status.queueSize > (status.waitingQueue?.length ?? 0) ? (
                  <li className="pl-7 text-[10px] text-muted-foreground">
                    {t("crawlerWaitingQueueMore", {
                      count:
                        status.queueSize - (status.waitingQueue?.length ?? 0),
                    })}
                  </li>
                ) : null}
              </>
            )}
          </ol>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto overflow-x-hidden p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <li className="text-muted-foreground">
                {t("crawlerActivityEmpty")}
              </li>
            ) : (
              logs.map((log) => (
                <li key={log.id} className={logRowClass(log.type, log.message)}>
                  {withLogMark(log.type, log.message)}
                </li>
              ))
            )}
          </ul>
        )}
      </section>
      </div>

      <CrawlerHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <CrawlerDemoOverlay
        open={demoOpen}
        onOpenChange={setDemoOpen}
        elapsedLabel={formatElapsedMs(elapsedMs)}
        running={running}
        currentUsername={status?.currentUsername ?? null}
        stats={{
          current: status?.currentUsername ?? null,
          queue: queueLabel,
          followed: status?.counts.followed ?? 0,
          skipped: status?.counts.skipped ?? 0,
          failed: status?.counts.failed ?? 0,
          discovered: status?.counts.discovered ?? 0,
        }}
        logs={logs}
        waitingQueue={status?.waitingQueue ?? []}
      />
      <CrawlerLogsDialog open={logsOpen} onOpenChange={setLogsOpen} />
      <CrawlerClearLogsDialog
        open={clearLogsOpen}
        onOpenChange={setClearLogsOpen}
        onConfirm={clearLogs}
      />
      <CrawlerResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={(hard) => runAction("/api/crawler/reset", { hard })}
      />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-sm bg-muted/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}
