"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { BulkUnfollowProgress, BulkUnfollowResult } from "@/types/github";
import { emptyBulkProgress } from "@/types/github";
import type { StarredRepo } from "@/types/cleanup";
import { API_ERROR_KEYS } from "@/lib/i18n/core";
import { formatCount } from "@/lib/format";
import {
  STAR_SORTS,
  STAR_VIEWS,
  filterStars,
  sortStars,
  starViewCounts,
  type StarSort,
  type StarView,
} from "@/lib/cleanup/filters";
import { unstarOneRepo } from "@/components/app/use-star";
import { runBulkUnfollow } from "@/lib/github/bulk";
import { StalenessGauge } from "@/components/app/staleness-gauge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/feedback/empty-state";
import { FilterPills } from "@/components/users/filter-pills";
import { SearchField } from "@/components/users/search-field";
import { SelectionBar } from "@/components/users/selection-bar";
import { BulkProgressDialog } from "@/components/dialogs/bulk-progress";
import { CleanupConfirmDialog } from "@/components/dialogs/cleanup-confirm";
import { useI18n } from "@/components/i18n/i18n-provider";

export function StarsCleanupView() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [repos, setRepos] = useState<StarredRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<StarView>("all");
  const [sort, setSort] = useState<StarSort>("push_asc");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progress, setProgress] = useState<BulkUnfollowProgress>(
    emptyBulkProgress(),
  );
  const [result, setResult] = useState<BulkUnfollowResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const [runId, setRunId] = useState(0);
  const now = Date.now();

  function load() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/cleanup/stars", {
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as {
          repositories?: StarredRepo[];
          error?: string;
        };
        if (response.status === 401) {
          router.replace("/login?error=session_expired");
          return;
        }
        if (!response.ok) {
          setError(body.error ?? "failed");
          return;
        }
        setRepos(Array.isArray(body.repositories) ? body.repositories : []);
      } catch {
        setError("network");
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const all = repos ?? [];
  const visible = sortStars(filterStars(all, view, query, now), sort);
  const counts = starViewCounts(all, now);
  const selectableIds = visible.map((r) => r.fullName);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(fullName: string, value: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(fullName);
      else next.delete(fullName);
      return next;
    });
  }

  async function unstarOne(fullName: string) {
    if (progressOpen || rowPending) return;
    setRowPending(fullName);
    try {
      await unstarOneRepo(fullName);
      setRepos((current) =>
        (current ?? []).filter((r) => r.fullName !== fullName),
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(fullName);
        return next;
      });
      toast.success(t("toastCleanupUnstarred", { fullName }));
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "failed";
      if (code === "unauthorized") {
        router.replace("/login?error=session_expired");
        return;
      }
      toast.error(t(API_ERROR_KEYS[code] ?? "errorFailed"));
    } finally {
      setRowPending(null);
    }
  }

  async function runQueue(fullNames: string[]) {
    if (fullNames.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;
    setRunId(nextRunId);

    setProgress(emptyBulkProgress(fullNames.length));
    setResult(null);
    setCancelling(false);
    setProgressOpen(true);

    const bulk = await runBulkUnfollow(
      fullNames,
      (fullName) => unstarOneRepo(fullName),
      {
        concurrency: 1,
        delayMs: 500,
        onProgress: (next) => {
          if (runIdRef.current === nextRunId) setProgress(next);
        },
        signal: controller.signal,
      },
    );

    if (nextRunId !== runIdRef.current) return;

    if (bulk.succeeded.length > 0) {
      const done = new Set(bulk.succeeded);
      setRepos((current) => (current ?? []).filter((r) => !done.has(r.fullName)));
    }

    if (abortRef.current === controller) abortRef.current = null;
    setResult(bulk);
    setCancelling(false);
    setSelected(new Set());

    if (bulk.abortReason === "unauthorized") {
      router.replace("/login?error=session_expired");
    }
  }

  function stopQueue() {
    setCancelling(true);
    abortRef.current?.abort();
  }

  const retryTargets = result
    ? [...result.failed.map((f) => f.username), ...result.aborted]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 pb-3">
        <SearchField value={query} onChange={setQuery} />
        <FilterPills
          value={view}
          onChange={setView}
          options={STAR_VIEWS.map((v) => ({
            value: v.id,
            label: `${t(v.labelKey)} (${formatCount(counts[v.id])})`,
          }))}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as StarSort)}
          aria-label={t("cleanupSortLabel")}
          className="h-9 w-full border border-border bg-transparent px-2 text-sm outline-none focus:border-foreground"
        >
          {STAR_SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {error ? (
          <EmptyState
            title={t(API_ERROR_KEYS[error] ?? "errorFailed")}
            description={t("cleanupEmpty")}
          />
        ) : null}

        {pending && !repos ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t("cleanupLoading")}
          </div>
        ) : null}

        {repos && repos.length === 0 && !error ? (
          <EmptyState title={t("cleanupEmpty")} description="" />
        ) : null}

        {repos && repos.length > 0 ? (
          <>
            {visible.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">
                {t("cleanupNothingMatches")}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between py-2 text-sm">
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(selectableIds))
                    }
                  >
                    {allSelected ? t("clearSelection") : t("selectAll")}
                  </button>
                </div>
                <ul className="divide-y divide-border border-y">
                  {visible.map((repo) => (
                    <li key={repo.fullName} className="flex items-start gap-3 py-3">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(repo.fullName)}
                        disabled={progressOpen}
                        onCheckedChange={(v) => toggle(repo.fullName, Boolean(v))}
                        aria-label={`${t("selectAll")} ${repo.fullName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {repo.fullName}
                        </p>
                        {repo.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {repo.description}
                          </p>
                        ) : null}
                        <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <StalenessGauge pushedAt={repo.pushedAt} now={now} />
                          <span>·</span>
                          <span>{formatCount(repo.stars)} ★</span>
                          {repo.archived ? (
                            <>
                              <span>·</span>
                              <span>{t("cleanupFilterArchived")}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-sm"
                          disabled={progressOpen || rowPending === repo.fullName}
                          onClick={() => void unstarOne(repo.fullName)}
                        >
                          {rowPending === repo.fullName ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : null}
                          {t("starsUnstar")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-sm"
                          onClick={() =>
                            window.open(
                              repo.htmlUrl,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}
      </div>

      <SelectionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        primaryLabel={t("cleanupUnstarSelected")}
        primaryVariant="destructive"
        onPrimary={() => setConfirmOpen(true)}
      />

      <CleanupConfirmDialog
        open={confirmOpen}
        kind="unstar"
        count={selected.size}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          void runQueue([...selected]);
        }}
      />

      <BulkProgressDialog
        open={progressOpen}
        runId={runId}
        progress={progress}
        result={result}
        cancelling={cancelling}
        concurrency={1}
        action="unstar"
        onStop={stopQueue}
        onClose={() => {
          setProgressOpen(false);
          setCancelling(false);
        }}
        onRetry={() => void runQueue(retryTargets.length ? retryTargets : [])}
      />
    </div>
  );
}
