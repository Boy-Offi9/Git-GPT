import { cn } from "@/lib/utils";

export type CrawlerLogItem = {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  username?: string | null;
  githubUserId?: number | null;
};

/** Shared tones — keep filter chips and log rows aligned. */
export const LOG_TONE = {
  followed: "text-emerald-600 dark:text-emerald-400",
  skipped: "text-sky-600 dark:text-sky-400",
  failed: "text-rose-600 dark:text-rose-400",
  control: "text-muted-foreground",
  problems: "text-amber-600 dark:text-amber-400",
  all: "text-foreground",
} as const;

export function formatLogAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}, ${hh}:${mi}:${ss}`;
}

export function logToneClass(type: string, message: string): string {
  // Failures / hard errors — rose
  if (
    type === "failed" ||
    type === "error" ||
    (type.includes("fail") && type !== "info") ||
    (message.startsWith("✗") && type !== "rate_limited")
  ) {
    return LOG_TONE.failed;
  }
  // Paused / rate limit / time limit — amber
  if (
    type === "rate_limited" ||
    message.startsWith("⏸")
  ) {
    return LOG_TONE.problems;
  }
  // Skips — sky
  if (type.includes("skip") || message.startsWith("↷")) {
    return LOG_TONE.skipped;
  }
  // Successful follows — emerald
  if (
    type === "followed" ||
    message.startsWith("✓") ||
    (type.includes("follow") && !type.includes("skip"))
  ) {
    return LOG_TONE.followed;
  }
  // Start / stop / reset / settings — muted
  if (
    type === "info" ||
    type === "settings" ||
    message.startsWith("●")
  ) {
    return LOG_TONE.control;
  }
  return LOG_TONE.control;
}

export function withLogMark(type: string, message: string): string {
  if (/^[✓↷✗●⏸]/.test(message.trim())) {
    return message;
  }
  if (type === "failed" || type === "error" || type.includes("fail")) {
    return `✗ ${message}`;
  }
  if (type.includes("skip")) {
    return `↷ ${message}`;
  }
  if (type === "followed") {
    return `✓ ${message}`;
  }
  if (type === "rate_limited") {
    return `⏸ ${message}`;
  }
  return `● ${message}`;
}

export function logRowClass(type: string, message: string): string {
  return cn("wrap-break-word leading-relaxed", logToneClass(type, message));
}
