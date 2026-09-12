"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ListFilter,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  formatLogAt,
  logToneClass,
  withLogMark,
  type CrawlerLogItem,
} from "@/components/crawler/crawler-log-display";
import type { MessageKey } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";

type CrawlerLogsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type LogSort = "newest" | "oldest";
type LogFilter =
  | "all"
  | "followed"
  | "skipped"
  | "failed"
  | "control"
  | "settings"
  | "problems";

const DISPLAY_LIMITS = [50, 100, 250, 500, 1000, 0] as const;
type DisplayLimit = (typeof DISPLAY_LIMITS)[number];

const FILTER_OPTIONS: {
  value: LogFilter;
  labelKey: MessageKey;
  mark: string;
}[] = [
  { value: "all", labelKey: "crawlerLogsFilterAll", mark: "" },
  { value: "followed", labelKey: "crawlerLogsFilterFollowed", mark: "✓" },
  { value: "skipped", labelKey: "crawlerLogsFilterSkipped", mark: "↷" },
  { value: "failed", labelKey: "crawlerLogsFilterFailed", mark: "✗" },
  { value: "control", labelKey: "crawlerLogsFilterControl", mark: "●" },
  { value: "settings", labelKey: "crawlerLogsFilterSettings", mark: "●" },
  { value: "problems", labelKey: "crawlerLogsFilterProblems", mark: "⏸" },
];

function matchesFilter(log: CrawlerLogItem, filter: LogFilter): boolean {
  if (filter === "all") {
    return true;
  }
  const type = log.type;
  const message = log.message;
  if (filter === "followed") {
    return type === "followed" || message.startsWith("✓");
  }
  if (filter === "skipped") {
    return type.includes("skip") || message.startsWith("↷");
  }
  if (filter === "failed") {
    return (
      type === "failed" ||
      type === "error" ||
      (type.includes("fail") && type !== "info") ||
      (message.startsWith("✗") && type !== "rate_limited")
    );
  }
  if (filter === "control") {
    return (
      (type === "info" || message.startsWith("●")) &&
      type !== "settings" &&
      !message.startsWith("⏸")
    );
  }
  if (filter === "settings") {
    return type === "settings";
  }
  if (filter === "problems") {
    return type === "rate_limited" || message.startsWith("⏸");
  }
  return true;
}

function LogMessageInline({ log }: { log: CrawlerLogItem }) {
  const text = withLogMark(log.type, log.message);
  const username = log.username?.trim();
  if (!username) {
    return <span className="truncate">{text}</span>;
  }

  const needle = `@${username}`;
  const idx = text.indexOf(needle);
  if (idx === -1) {
    return <span className="truncate">{text}</span>;
  }

  return (
    <span className="min-w-0 truncate">
      {text.slice(0, idx)}
      <a
        href={`https://github.com/${encodeURIComponent(username)}`}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:underline"
      >
        @{username}
      </a>
      {text.slice(idx + needle.length)}
    </span>
  );
}

export function CrawlerLogsDialog({
  open,
  onOpenChange,
}: CrawlerLogsDialogProps) {
  const { t } = useI18n();
  const [logs, setLogs] = useState<CrawlerLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<LogSort>("newest");
  const [filter, setFilter] = useState<LogFilter>("all");
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>(50);
  const [filterOpen, setFilterOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSort("newest");
    setFilter("all");
    setDisplayLimit(50);
    setFilterOpen(false);
    setLimitOpen(false);

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/crawler/logs?all=1", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) {
          return;
        }
        const json = (await res.json()) as { logs: CrawlerLogItem[] };
        if (!cancelled) {
          setLogs(json.logs);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const visibleLogs = useMemo(() => {
    const filtered = logs.filter((log) => matchesFilter(log, filter));
    const sorted = [...filtered].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) {
        return sort === "newest" ? tb - ta : ta - tb;
      }
      return sort === "newest" ? b.id - a.id : a.id - b.id;
    });
    if (displayLimit === 0) {
      return sorted;
    }
    return sorted.slice(0, displayLimit);
  }, [logs, filter, sort, displayLimit]);

  const filteredTotal = useMemo(
    () => logs.filter((log) => matchesFilter(log, filter)).length,
    [logs, filter],
  );

  const activeFilter =
    FILTER_OPTIONS.find((o) => o.value === filter) ?? FILTER_OPTIONS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,720px)] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="text-lg font-medium">
            {t("crawlerLogsTitle")}
          </DialogTitle>
          <div className="flex items-end justify-between gap-2">
            <DialogDescription className="min-w-0 flex-1">
              {t("crawlerLogsHint")}
              {!loading
                ? ` · ${t("crawlerLogsCount", { count: visibleLogs.length })}`
                : null}
              {!loading &&
              displayLimit !== 0 &&
              filteredTotal > visibleLogs.length
                ? ` · ${t("crawlerLogsFilteredOf", { total: filteredTotal })}`
                : null}
            </DialogDescription>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-sm"
                aria-label={
                  sort === "newest"
                    ? t("crawlerLogsSortNewest")
                    : t("crawlerLogsSortOldest")
                }
                title={
                  sort === "newest"
                    ? t("crawlerLogsSortNewest")
                    : t("crawlerLogsSortOldest")
                }
                onClick={() =>
                  setSort((current) =>
                    current === "newest" ? "oldest" : "newest",
                  )
                }
              >
                {sort === "newest" ? (
                  <ArrowDownWideNarrow className="size-3.5" />
                ) : (
                  <ArrowUpWideNarrow className="size-3.5" />
                )}
              </Button>

              <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant={filter === "all" ? "outline" : "default"}
                      className="rounded-sm"
                      aria-label={t("crawlerLogsFilterAria")}
                    />
                  }
                >
                  <ListFilter className="size-3.5" />
                  <span className="inline-flex items-center gap-1">
                    {activeFilter.mark ? (
                      <span aria-hidden="true">{activeFilter.mark}</span>
                    ) : null}
                    {t(activeFilter.labelKey)}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }
                      setFilter(value as LogFilter);
                      setFilterOpen(false);
                    }}
                  >
                    {FILTER_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2">
                          {option.mark ? (
                            <span className="w-3 text-center" aria-hidden="true">
                              {option.mark}
                            </span>
                          ) : (
                            <span className="w-3" aria-hidden="true" />
                          )}
                          {t(option.labelKey)}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu open={limitOpen} onOpenChange={setLimitOpen}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-sm tabular-nums"
                      aria-label={t("crawlerLogsLimitAria")}
                    />
                  }
                >
                  {displayLimit === 0
                    ? t("crawlerLogsLimitAll")
                    : t("crawlerLogsLimitN", { count: displayLimit })}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-28">
                  <DropdownMenuRadioGroup
                    value={String(displayLimit)}
                    onValueChange={(value) => {
                      if (value == null) {
                        return;
                      }
                      setDisplayLimit(Number(value) as DisplayLimit);
                      setLimitOpen(false);
                    }}
                  >
                    {DISPLAY_LIMITS.map((limit) => (
                      <DropdownMenuRadioItem
                        key={limit}
                        value={String(limit)}
                        className="cursor-pointer"
                      >
                        {limit === 0
                          ? t("crawlerLogsLimitAll")
                          : t("crawlerLogsLimitN", { count: limit })}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogHeader>

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-sm border border-border bg-muted/20 p-2 font-mono text-xs">
          {loading ? (
            <li className="px-1 py-1 text-muted-foreground">
              {t("crawlerLogsLoading")}
            </li>
          ) : visibleLogs.length === 0 ? (
            <li className="px-1 py-1 text-muted-foreground">
              {t("crawlerActivityEmpty")}
            </li>
          ) : (
            visibleLogs.map((log, index) => (
              <li
                key={log.id}
                className={cn(
                  "flex items-center gap-2 px-1 py-1",
                  logToneClass(log.type, log.message),
                )}
              >
                <span className="w-7 shrink-0 tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <LogMessageInline log={log} />
                </div>
                <time
                  className="shrink-0 tabular-nums text-muted-foreground"
                  dateTime={log.createdAt}
                >
                  {formatLogAt(log.createdAt)}
                </time>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
