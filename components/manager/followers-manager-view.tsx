"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckSquare, LoaderCircle, Square, UserPlus } from "lucide-react";
import type {
  BulkUnfollowProgress,
  BulkUnfollowResult,
  HtmlFollower,
  HtmlFollowersPayload,
} from "@/types/github";
import { emptyBulkProgress } from "@/types/github";
import { API_ERROR_KEYS } from "@/lib/i18n/core";
import { formatCount } from "@/lib/format";
import { buildFollowersPageUrl } from "@/lib/github/html-followers-url";
import {
  followManySequential,
  followOneUsername,
} from "@/components/app/use-unfollow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/navigation/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { SelectionBar } from "@/components/users/selection-bar";
import { FollowConfirmDialog } from "@/components/dialogs/follow-confirm";
import { BulkProgressDialog } from "@/components/dialogs/bulk-progress";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useGithubData } from "@/components/app/github-data-provider";
import {
  getExploreStore,
  getExploreStoreServerSnapshot,
  setExploreStore,
  subscribeExploreStore,
  updateExploreUsers,
} from "@/components/manager/explore-session-store";
import { cn } from "@/lib/utils";

const BULK_SIZES = [10, 20, 30, 50] as const;

export function FollowersManagerView() {
  const { t } = useI18n();
  const router = useRouter();
  const { addFollowing, data } = useGithubData();
  const explore = useSyncExternalStore(
    subscribeExploreStore,
    getExploreStore,
    getExploreStoreServerSnapshot,
  );
  const { url, payload, users, error } = explore;
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

  const followingLogins = new Set(
    (data?.following ?? []).map((u) => u.login.toLowerCase()),
  );

  function withLocalFollowing(next: HtmlFollower[]): HtmlFollower[] {
    return next.map((user) => ({
      ...user,
      isFollowing:
        user.isFollowing || followingLogins.has(user.username.toLowerCase()),
    }));
  }

  const list = (Array.isArray(users) ? users : []).map((user) => ({
    ...user,
    isFollowing:
      user.isFollowing || followingLogins.has(user.username.toLowerCase()),
  }));
  const notFollowing = list.filter((u) => !u.isFollowing);
  const followingCount = list.length - notFollowing.length;
  const notFollowingCount = notFollowing.length;
  const selectableUsernames = notFollowing.map((u) => u.username);
  const allSelectableSelected =
    selectableUsernames.length > 0 &&
    selectableUsernames.every((username) => selected.has(username));

  function setUrl(next: string) {
    setExploreStore({ url: next });
  }

  function toggle(username: string, value: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (value) {
        next.add(username);
      } else {
        next.delete(username);
      }
      return next;
    });
  }

  function selectFirst(limit: number) {
    const targets = notFollowing.slice(0, limit).map((u) => u.username);
    if (targets.length === 0) {
      toast.message(t("managerNothingToFollow"));
      return;
    }
    setSelected(new Set(targets));
  }

  function selectAllNotFollowing() {
    setSelected(new Set(selectableUsernames));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function extract(targetUrl: string) {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setExploreStore({ error: "validation" });
      return;
    }
    setExploreStore({ error: null });
    setSelected(new Set());
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const response = await fetch("/api/github/html-followers", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: trimmed }),
        });
        const body = (await response.json()) as HtmlFollowersPayload & {
          error?: string;
        };
        if (response.status === 401) {
          router.replace("/login?error=session_expired");
          return;
        }
        if (!response.ok) {
          setExploreStore({
            payload: null,
            users: [],
            error: body.error ?? "failed",
          });
          return;
        }
        setExploreStore({
          payload: body,
          users: withLocalFollowing(
            Array.isArray(body.users) ? body.users : [],
          ),
          url: body.sourceUrl ?? trimmed,
          error: null,
        });
        setSelected(new Set());
      } catch {
        setExploreStore({ error: "network" });
      }
    });
  }

  async function followOne(username: string) {
    if (progressOpen || rowPending) return;
    setRowPending(username);
    try {
      await followOneUsername(username);
      updateExploreUsers((current) =>
        (Array.isArray(current) ? current : []).map((u) =>
          u.username === username ? { ...u, isFollowing: true } : u,
        ),
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(username);
        return next;
      });
      const found = list.find((u) => u.username === username);
      addFollowing([
        {
          login: username,
          id: 0,
          avatarUrl: found?.avatar ?? "",
          htmlUrl: `https://github.com/${username}`,
          name: found?.name ?? null,
          status: "not_following_back",
        },
      ]);
      toast.success(t("toastFollowed", { login: username }));
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

  async function runQueue(usernames: string[]) {
    if (usernames.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;
    setRunId(nextRunId);

    setQueue(usernames);
    setProgress(emptyBulkProgress(usernames.length));
    setResult(null);
    setCancelling(false);
    setProgressOpen(true);

    const bulk = await followManySequential(
      usernames,
      (next) => {
        if (runIdRef.current === nextRunId) {
          setProgress(next);
        }
      },
      controller.signal,
    );

    if (bulk.succeeded.length > 0) {
      const ok = new Set(bulk.succeeded);
      updateExploreUsers((current) =>
        (Array.isArray(current) ? current : []).map((u) =>
          ok.has(u.username) ? { ...u, isFollowing: true } : u,
        ),
      );
      addFollowing(
        bulk.succeeded.map((login) => {
          const found = list.find((u) => u.username === login);
          return {
            login,
            id: 0,
            avatarUrl: found?.avatar ?? "",
            htmlUrl: `https://github.com/${login}`,
            name: found?.name ?? null,
            status: "not_following_back" as const,
          };
        }),
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
          t("toastFollowStopped", {
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
        t("toastFollowedMany", {
          count: bulk.succeeded.length,
          accounts:
            bulk.succeeded.length === 1 ? t("accountOne") : t("accountMany"),
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
        title={t("managerTitle")}
        description={t("managerHint")}
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
          htmlFor="manager-url"
          className="block text-xs text-muted-foreground"
        >
          {t("managerUrlLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id="manager-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("managerUrlPlaceholder")}
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
            {pending ? t("managerExtracting") : t("managerExtract")}
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
            description={t("managerErrorBody")}
          />
        ) : null}

        {!payload && !error && !pending ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {t("managerEmpty")}
          </p>
        ) : null}

        {pending && !payload ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t("managerExtracting")}
          </div>
        ) : null}

        {payload ? (
          <div className="space-y-6">
            <dl className="divide-y divide-border border-y text-sm">
              <Stat
                label={t("managerTotal")}
                value={formatCount(list.length)}
              />
              <Stat
                label={t("managerFollowing")}
                value={formatCount(followingCount)}
              />
              <Stat
                label={t("managerNotFollowing")}
                value={formatCount(notFollowingCount)}
              />
            </dl>

            {payload.maybeUnpersonalized && followingCount === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {t("managerUnpersonalizedNote")}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {BULK_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant="outline"
                  className="rounded-sm"
                  disabled={
                    progressOpen || pending || notFollowingCount === 0
                  }
                  onClick={() => selectFirst(size)}
                >
                  {t("managerFollowN", { count: size })}
                </Button>
              ))}
            </div>

            {notFollowingCount > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  disabled={progressOpen}
                  onClick={
                    allSelectableSelected
                      ? clearSelection
                      : selectAllNotFollowing
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
              {list.map((user) => {
                const isSelected = selected.has(user.username);
                return (
                  <li
                    key={user.username}
                    className={cn(
                      "flex items-center gap-3 py-3",
                      isSelected && "bg-muted/50",
                    )}
                  >
                    {!user.isFollowing ? (
                      <Checkbox
                        checked={isSelected}
                        disabled={progressOpen}
                        onCheckedChange={(value) =>
                          toggle(user.username, Boolean(value))
                        }
                        aria-label={`${t("selectAll")} @${user.username}`}
                      />
                    ) : (
                      <span className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    <Avatar className="size-10">
                      {user.avatar ? (
                        <AvatarImage src={user.avatar} alt="" />
                      ) : null}
                      <AvatarFallback>
                        {user.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <a
                        href={user.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {user.username}
                      </a>
                      {user.name ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.name}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {user.isFollowing
                          ? t("managerStatusFollowing")
                          : t("managerStatusNotFollowing")}
                      </p>
                    </div>
                    {!user.isFollowing ? (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-sm"
                        disabled={
                          progressOpen || rowPending === user.username
                        }
                        onClick={() => void followOne(user.username)}
                      >
                        {rowPending === user.username ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="size-3.5" />
                        )}
                        {t("follow")}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {t("managerFollowedLabel")}
                      </span>
                    )}
                  </li>
                );
              })}
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
                      const prev = buildFollowersPageUrl(
                        payload.login,
                        payload.page - 1,
                      );
                      setUrl(prev);
                      extract(prev);
                    }}
                  >
                    {t("managerPrevPage")}
                  </Button>
                ) : null}
                {payload.hasNextPage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-sm"
                    disabled={pending || progressOpen}
                    onClick={() => {
                      const next = buildFollowersPageUrl(
                        payload.login,
                        payload.page + 1,
                      );
                      setUrl(next);
                      extract(next);
                    }}
                  >
                    {t("managerNextPage")}
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
        primaryLabel={t("followSelected")}
        primaryVariant="default"
        onPrimary={() => {
          const targets = notFollowing
            .map((u) => u.username)
            .filter((username) => selected.has(username));
          if (targets.length === 0) {
            return;
          }
          setConfirmTargets(targets);
          setConfirmOpen(true);
        }}
      />

      <FollowConfirmDialog
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
        action="follow"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
