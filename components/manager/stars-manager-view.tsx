"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ExternalLink,
  LoaderCircle,
  Square,
  Star,
} from "lucide-react";
import type {
  BulkUnfollowProgress,
  BulkUnfollowResult,
  HtmlRepo,
  HtmlReposPayload,
} from "@/types/github";
import { emptyBulkProgress } from "@/types/github";
import { API_ERROR_KEYS } from "@/lib/i18n/core";
import { formatCount } from "@/lib/format";
import { buildReposPageUrl } from "@/lib/github/html-repos-url";
import {
  starManySequential,
  starOneRepo,
  unstarOneRepo,
} from "@/components/app/use-star";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/navigation/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { SelectionBar } from "@/components/users/selection-bar";
import { StarConfirmDialog } from "@/components/dialogs/star-confirm";
import { BulkProgressDialog } from "@/components/dialogs/bulk-progress";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  getStarsStore,
  getStarsStoreServerSnapshot,
  setStarsStore,
  subscribeStarsStore,
  updateStarsRepos,
} from "@/components/manager/stars-session-store";
import { cn } from "@/lib/utils";

const BULK_SIZES = [10, 20, 30, 50] as const;

export function StarsManagerView() {
  const { t } = useI18n();
  const router = useRouter();
  const stars = useSyncExternalStore(
    subscribeStarsStore,
    getStarsStore,
    getStarsStoreServerSnapshot,
  );
  const { url, payload, repositories, error, pendingExtract } = stars;
  const [pending, startTransition] = useTransition();
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTargets, setConfirmTargets] = useState<string[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progress, setProgress] = useState<BulkUnfollowProgress>(
    emptyBulkProgress(),
  );
  const [result, setResult] = useState<BulkUnfollowResult | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const [runId, setRunId] = useState(0);

  const list = Array.isArray(repositories) ? repositories : [];
  const notStarred = list.filter((r) => !r.isStarred);
  const starredCount = list.length - notStarred.length;
  const notStarredCount = notStarred.length;
  const selectableIds = notStarred.map((r) => r.fullName);
  const allSelectableSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected.has(id));

  function setUrl(next: string) {
    setStarsStore({ url: next });
  }

  function toggle(fullName: string, value: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(fullName);
      else next.delete(fullName);
      return next;
    });
  }

  function selectFirst(limit: number) {
    const targets = notStarred.slice(0, limit).map((r) => r.fullName);
    if (targets.length === 0) {
      toast.message(t("starsNothingToStar"));
      return;
    }
    setSelected(new Set(targets));
  }

  function selectAllNotStarred() {
    setSelected(new Set(selectableIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function extract(targetUrl: string) {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setStarsStore({ error: "validation" });
      return;
    }
    setStarsStore({ error: null });
    setSelected(new Set());
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const response = await fetch("/api/github/html-repos", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: trimmed }),
        });
        const body = (await response.json()) as HtmlReposPayload & {
          error?: string;
        };
        if (response.status === 401) {
          router.replace("/login?error=session_expired");
          return;
        }
        if (!response.ok) {
          setStarsStore({
            payload: null,
            repositories: [],
            error: body.error ?? "failed",
          });
          return;
        }
        setStarsStore({
          payload: body,
          repositories: Array.isArray(body.repositories)
            ? body.repositories
            : [],
          url: body.sourceUrl ?? trimmed,
          error: null,
        });
        setSelected(new Set());
      } catch {
        setStarsStore({ error: "network" });
      }
    });
  }

  useEffect(() => {
    if (!pendingExtract || !url.trim()) {
      return;
    }
    const target = url;
    const timer = window.setTimeout(() => {
      setStarsStore({ pendingExtract: false });
      extract(target);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot queue from Followers
  }, [pendingExtract, url]);

  async function starOne(fullName: string) {
    if (progressOpen || rowPending) return;
    setRowPending(fullName);
    try {
      await starOneRepo(fullName);
      updateStarsRepos((current) =>
        current.map((r) =>
          r.fullName === fullName ? { ...r, isStarred: true } : r,
        ),
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(fullName);
        return next;
      });
      toast.success(t("toastStarred", { fullName }));
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

  async function unstarOne(fullName: string) {
    if (progressOpen || rowPending) return;
    setRowPending(fullName);
    try {
      await unstarOneRepo(fullName);
      updateStarsRepos((current) =>
        current.map((r) =>
          r.fullName === fullName ? { ...r, isStarred: false } : r,
        ),
      );
      toast.success(t("toastUnstarred", { fullName }));
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

    setQueue(fullNames);
    setProgress(emptyBulkProgress(fullNames.length));
    setResult(null);
    setCancelling(false);
    setProgressOpen(true);

    const bulk = await starManySequential(
      fullNames,
      (next) => {
        if (runIdRef.current === nextRunId) {
          setProgress(next);
        }
      },
      controller.signal,
    );

    if (bulk.succeeded.length > 0) {
      const ok = new Set(bulk.succeeded);
      updateStarsRepos((current) =>
        current.map((r) =>
          ok.has(r.fullName) ? { ...r, isStarred: true } : r,
        ),
      );
    }

    if (nextRunId !== runIdRef.current) {
      return;
    }

    if (abortRef.current === controller) {
      abortRef.current = null;
    }

    setResult(bulk);
    setCancelling(false);
    setSelected(new Set());

    if (bulk.abortReason === "unauthorized") {
      router.replace("/login?error=session_expired");
      return;
    }

    if (bulk.abortReason === "cancelled") {
      if (bulk.succeeded.length > 0) {
        toast.message(
          t("toastStarStopped", {
            ok: bulk.succeeded.length,
            skipped: bulk.aborted.length,
          }),
        );
      } else {
        toast.message(t("toastStoppedNone"));
      }
      return;
    }

    if (bulk.abortReason === "rate_limited") {
      toast.error(t(API_ERROR_KEYS.rate_limited));
    } else if (bulk.failed.length === 0 && bulk.aborted.length === 0) {
      toast.success(
        t("toastStarredMany", {
          count: bulk.succeeded.length,
          repos:
            bulk.succeeded.length === 1 ? t("repoOne") : t("repoMany"),
        }),
      );
    }
  }

  function stopQueue() {
    setCancelling(true);
    abortRef.current?.abort();
  }

  const retryTargets = result
    ? [...result.failed.map((item) => item.username), ...result.aborted]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("starsTitle")}
        description={t("starsHint")}
        backHref="/"
      />

      <form
        className="shrink-0 space-y-3 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          extract(url);
        }}
      >
        <label
          htmlFor="stars-url"
          className="block text-xs text-muted-foreground"
        >
          {t("starsUrlLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id="stars-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("starsUrlPlaceholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 border border-border bg-transparent px-3 text-sm outline-none focus:border-foreground"
          />
          <Button
            type="submit"
            disabled={pending || progressOpen}
            className="rounded-sm"
          >
            {pending ? t("starsExtracting") : t("starsExtract")}
          </Button>
        </div>
      </form>

      <div
        className="min-h-0 flex-1 overflow-y-auto pb-6"
        style={selected.size > 0 ? { paddingBottom: 96 } : undefined}
      >
        {error ? (
          <EmptyState
            title={t(API_ERROR_KEYS[error] ?? "errorFailed")}
            description={t("starsErrorBody")}
          />
        ) : null}

        {!payload && !error && !pending ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {t("starsEmpty")}
          </p>
        ) : null}

        {pending && !payload ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t("starsExtracting")}
          </div>
        ) : null}

        {payload ? (
          <div className="space-y-6">
            <dl className="divide-y divide-border border-y text-sm">
              <Stat label={t("starsTotal")} value={formatCount(list.length)} />
              <Stat
                label={t("starsStarred")}
                value={formatCount(starredCount)}
              />
              <Stat
                label={t("starsNotStarred")}
                value={formatCount(notStarredCount)}
              />
            </dl>

            {payload.maybeUnpersonalized && starredCount === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {t("starsUnpersonalizedNote")}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {BULK_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant="outline"
                  className="rounded-sm"
                  disabled={progressOpen || pending || notStarredCount === 0}
                  onClick={() => selectFirst(size)}
                >
                  {t("starsStarN", { count: size })}
                </Button>
              ))}
            </div>

            {notStarredCount > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  disabled={progressOpen}
                  onClick={
                    allSelectableSelected
                      ? clearSelection
                      : selectAllNotStarred
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    {allSelectableSelected ? (
                      <Square className="size-3.5" />
                    ) : (
                      <CheckSquare className="size-3.5" />
                    )}
                    {allSelectableSelected
                      ? t("clearSelection")
                      : t("selectAll")}
                  </span>
                </button>
              </div>
            ) : null}

            <ul className="divide-y divide-border border-y">
              {list.map((repo) => (
                <RepoRow
                  key={repo.fullName}
                  repo={repo}
                  selected={selected.has(repo.fullName)}
                  pending={rowPending === repo.fullName}
                  disabled={progressOpen}
                  onToggle={(value) => toggle(repo.fullName, value)}
                  onStar={() => void starOne(repo.fullName)}
                  onUnstar={() => void unstarOne(repo.fullName)}
                />
              ))}
            </ul>

            {payload.page > 1 || payload.hasNextPage ? (
              <div className="flex gap-2">
                {payload.page > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-sm"
                    disabled={pending || progressOpen}
                    onClick={() => {
                      const prev = buildReposPageUrl(
                        payload.login,
                        payload.page - 1,
                      );
                      setUrl(prev);
                      extract(prev);
                    }}
                  >
                    {t("starsPrevPage")}
                  </Button>
                ) : null}
                {payload.hasNextPage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-sm"
                    disabled={pending || progressOpen}
                    onClick={() => {
                      const next = buildReposPageUrl(
                        payload.login,
                        payload.page + 1,
                      );
                      setUrl(next);
                      extract(next);
                    }}
                  >
                    {t("starsNextPage")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <SelectionBar
        count={selected.size}
        onClear={clearSelection}
        primaryLabel={t("starSelected")}
        primaryVariant="default"
        onPrimary={() => {
          const targets = notStarred
            .map((r) => r.fullName)
            .filter((id) => selected.has(id));
          if (targets.length === 0) return;
          setConfirmTargets(targets);
          setConfirmOpen(true);
        }}
      />

      <StarConfirmDialog
        open={confirmOpen}
        count={confirmTargets.length}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void runQueue(confirmTargets)}
      />

      <BulkProgressDialog
        open={progressOpen}
        runId={runId}
        progress={progress}
        result={result}
        cancelling={cancelling}
        concurrency={1}
        action="star"
        onStop={stopQueue}
        onClose={() => {
          setProgressOpen(false);
          setCancelling(false);
        }}
        onRetry={() =>
          void runQueue(retryTargets.length ? retryTargets : queue)
        }
      />
    </div>
  );
}

function RepoRow({
  repo,
  selected,
  pending,
  disabled,
  onToggle,
  onStar,
  onUnstar,
}: {
  repo: HtmlRepo;
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: (value: boolean) => void;
  onStar: () => void;
  onUnstar: () => void;
}) {
  const { t } = useI18n();

  return (
    <li
      className={cn(
        "flex items-start gap-3 py-3",
        selected && "bg-muted/50",
      )}
    >
      {!repo.isStarred ? (
        <Checkbox
          className="mt-1"
          checked={selected}
          disabled={disabled}
          onCheckedChange={(value) => onToggle(Boolean(value))}
          aria-label={`${t("selectAll")} ${repo.fullName}`}
        />
      ) : (
        <span className="mt-1 size-4 shrink-0" aria-hidden="true" />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Star
            className={cn(
              "size-3.5 shrink-0",
              repo.isStarred
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="truncate">{repo.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{repo.fullName}</p>
        {repo.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {repo.description}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCount(repo.stars)} stars
          <span className="mx-1.5">·</span>
          {repo.isStarred
            ? t("starsStatusStarred")
            : t("starsStatusNotStarred")}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {repo.isStarred ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {t("starsStatusStarred")}
          </span>
        ) : null}
        <div className="flex gap-1.5">
          {repo.isStarred ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-sm"
              disabled={disabled || pending}
              onClick={onUnstar}
            >
              {pending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : null}
              {t("starsUnstar")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="rounded-sm"
              disabled={disabled || pending}
              onClick={onStar}
            >
              {pending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Star className="size-3.5" />
              )}
              {t("starsStar")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-sm"
            onClick={() => window.open(repo.url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("starsExploreRepo")}
          </Button>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
