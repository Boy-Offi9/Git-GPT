import { stalenessLevel } from "@/lib/cleanup/filters";
import { relativeTimeValue } from "@/lib/format";
import { useI18n } from "@/components/i18n/i18n-provider";

/** One color per staleness level: fresh (emerald) through dormant (destructive). */
const LEVEL_COLORS = [
  "bg-emerald-500",
  "bg-emerald-400",
  "bg-amber-500",
  "bg-orange-500",
  "bg-destructive",
] as const;

/** Five rising bars. The more that are lit (and the redder), the longer since the last push. */
export function StalenessGauge({
  pushedAt,
  now,
}: {
  pushedAt: string | null;
  now: number;
}) {
  const { t } = useI18n();
  const level = stalenessLevel(pushedAt, now);
  const age = pushedAt
    ? (() => {
        const value = relativeTimeValue(Date.parse(pushedAt), now);
        return value.justNow ? "just now" : value.relative;
      })()
    : t("cleanupNeverPushed");
  const label = pushedAt ? t("cleanupLastPush", { age }) : t("cleanupNeverPushed");

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span role="img" aria-label={label} className="flex items-end gap-[2px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-[1px] ${i <= level ? LEVEL_COLORS[level] : "bg-border"}`}
            style={{ height: 5 + i * 2.5 }}
          />
        ))}
      </span>
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        {age}
      </span>
    </span>
  );
}
