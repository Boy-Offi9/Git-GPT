"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarDays, ExternalLink, LoaderCircle } from "lucide-react";
import { API_ERROR_KEYS } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/en";
import {
  MAX_COMMITS_PER_DAY,
  type OwnedRepo,
} from "@/lib/github/dated-commit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/navigation/page-header";
import { useI18n } from "@/components/i18n/i18n-provider";

type BatchOk = {
  ok: true;
  created: number;
  days: number;
  commitsPerDay: number;
  startDate: string;
  endDate: string;
  last: {
    htmlUrl: string;
    sha: string;
    date: string;
    path: string;
    message: string;
  } | null;
};

function dayCount(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return 0;
  }
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds);
  const b = Date.UTC(ye, me - 1, de);
  if (a > b) return 0;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

export function DatedCommitView() {
  const { t } = useI18n();
  const [repos, setRepos] = useState<OwnedRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<MessageKey | null>(null);
  const [selected, setSelected] = useState("");
  const [manual, setManual] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [commitsPerDay, setCommitsPerDay] = useState("1");
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<BatchOk | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReposLoading(true);
    setReposError(null);
    void (async () => {
      try {
        const response = await fetch("/api/github/repos/mine", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          repos?: OwnedRepo[];
          error?: string;
        };
        if (!response.ok) {
          if (cancelled) return;
          const key = API_ERROR_KEYS[body.error ?? ""] ?? "errorFailed";
          setReposError(key);
          return;
        }
        if (cancelled) return;
        const list = Array.isArray(body.repos) ? body.repos : [];
        setRepos(list);
        if (list[0]) {
          setSelected(list[0].fullName);
        }
      } catch {
        if (!cancelled) {
          setReposError("errorNetwork");
        }
      } finally {
        if (!cancelled) {
          setReposLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function sourceValue(): string {
    const fromManual = manual.trim();
    if (fromManual) return fromManual;
    return selected.trim();
  }

  const perDay = Math.min(
    MAX_COMMITS_PER_DAY,
    Math.max(1, Math.floor(Number(commitsPerDay)) || 1),
  );
  const days = useMemo(
    () => dayCount(startDate.trim(), endDate.trim() || startDate.trim()),
    [startDate, endDate],
  );
  const total = days * perDay;

  function commit() {
    const source = sourceValue();
    const start = startDate.trim();
    const end = (endDate.trim() || start).trim();
    if (!source || !start) {
      toast.error(t("errorValidation"));
      return;
    }
    setLastResult(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/github/dated-commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            startDate: start,
            endDate: end,
            commitsPerDay: perDay,
          }),
        });
        const body = (await response.json()) as BatchOk & { error?: string };
        if (!response.ok) {
          if (response.status === 403) {
            toast.error(t("activityForbiddenRepo"));
            return;
          }
          if (body.error === "range_too_long") {
            toast.error(t("activityRangeTooLong"));
            return;
          }
          if (body.error === "too_many_commits") {
            toast.error(t("activityTooManyCommits"));
            return;
          }
          const key = API_ERROR_KEYS[body.error ?? ""] ?? "errorFailed";
          toast.error(t(key));
          return;
        }
        setLastResult(body);
        toast.success(
          t("activitySuccess", {
            created: body.created,
            days: body.days,
            start: body.startDate,
            end: body.endDate,
          }),
        );
      } catch {
        toast.error(t("errorNetwork"));
      }
    });
  }

  const canSubmit = Boolean(sourceValue() && startDate.trim() && days > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <PageHeader
        title={t("activityTitle")}
        description={t("activityHint")}
        backHref="/"
      />

      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="activity-repo">
            {t("activityRepoLabel")}
          </label>
          {reposLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("activityLoadingRepos")}
            </p>
          ) : reposError ? (
            <p className="text-sm text-destructive">{t(reposError)}</p>
          ) : repos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("activityEmptyRepos")}
            </p>
          ) : (
            <select
              id="activity-repo"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setManual("");
              }}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                {t("activityRepoPlaceholder")}
              </option>
              {repos.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}
                  {repo.private ? " (private)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="activity-manual">
            {t("activityRepoManualLabel")}
          </label>
          <Input
            id="activity-manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={t("activityRepoManualPlaceholder")}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="activity-start">
              {t("activityStartDateLabel")}
            </label>
            <Input
              id="activity-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="activity-end">
              {t("activityEndDateLabel")}
            </label>
            <Input
              id="activity-end"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="activity-count">
            {t("activityCommitsPerDayLabel")}
          </label>
          <Input
            id="activity-count"
            type="number"
            min={1}
            max={MAX_COMMITS_PER_DAY}
            value={commitsPerDay}
            onChange={(e) => setCommitsPerDay(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("activityCommitsPerDayHint")}
          </p>
          {days > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("activityPreview", {
                days,
                perDay,
                total,
              })}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={pending || !canSubmit}
          onClick={() => commit()}
        >
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("activityCommitting")}
            </>
          ) : (
            <>
              <CalendarDays className="size-4" aria-hidden />
              {t("activityCommit")}
            </>
          )}
        </Button>

        {lastResult ? (
          <div className="border border-border px-3 py-3 text-sm">
            <p className="font-medium text-foreground">
              {t("activitySuccess", {
                created: lastResult.created,
                days: lastResult.days,
                start: lastResult.startDate,
                end: lastResult.endDate,
              })}
            </p>
            {lastResult.last ? (
              <>
                <p className="mt-1 text-muted-foreground">
                  {lastResult.last.message}
                </p>
                <a
                  href={lastResult.last.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
                >
                  {t("activityOpenCommit")}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
