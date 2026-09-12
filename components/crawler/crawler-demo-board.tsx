"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { CrawlerLogItem } from "@/components/crawler/crawler-log-display";
import type { CrawlerDemoStats } from "@/components/crawler/crawler-demo-types";
import { EMPTY_DEMO_STATS } from "@/components/crawler/crawler-demo-types";
import styles from "@/components/crawler/crawler-demo-board.module.css";

export type CrawlerDemoWaitingItem = {
  id: number;
  username: string;
  status: string;
};

export type CrawlerDemoBoardProps = {
  elapsedLabel: string;
  running?: boolean;
  currentUsername?: string | null;
  stats?: CrawlerDemoStats;
  logs?: CrawlerLogItem[];
  waitingQueue?: CrawlerDemoWaitingItem[];
};

type BoardAction = "FOLLOWED" | "SKIPPED" | "FAILED" | "QUEUE" | "CURRENT";

function actionClass(action: BoardAction): string {
  switch (action) {
    case "FOLLOWED":
      return styles.actionFollow;
    case "SKIPPED":
      return styles.actionSkip;
    case "QUEUE":
      return styles.actionQueue;
    case "FAILED":
      return styles.actionFail;
    case "CURRENT":
      return styles.actionCurrent;
  }
}

function actionFromLogType(type: string): BoardAction | null {
  if (type === "followed") return "FOLLOWED";
  if (type.startsWith("skipped")) return "SKIPPED";
  if (type === "failed" || type === "error") return "FAILED";
  return null;
}

function splitClock(label: string): string[] {
  const cleaned = label.replace(/[^\d:]/g, "") || "0:00";
  return cleaned.split("");
}

export function CrawlerDemoBoard({
  elapsedLabel,
  running = false,
  currentUsername = null,
  stats = EMPTY_DEMO_STATS,
  logs = [],
  waitingQueue = [],
}: CrawlerDemoBoardProps) {
  const { t } = useI18n();

  const displayRows = useMemo(() => {
    const rows: {
      key: string;
      track: string;
      user: string;
      action: BoardAction;
    }[] = [];

    for (const item of waitingQueue) {
      if (rows.length >= 5) {
        break;
      }
      const isCurrent =
        item.status === "processing" ||
        (currentUsername != null &&
          item.username.toLowerCase() === currentUsername.toLowerCase());
      rows.push({
        key: `q-${item.id}`,
        track: String(rows.length + 1).padStart(2, "0"),
        user: `@${item.username}`,
        action: isCurrent ? "CURRENT" : "QUEUE",
      });
    }

    if (rows.length < 5) {
      for (const log of logs) {
        if (rows.length >= 5) {
          break;
        }
        const action = actionFromLogType(log.type);
        if (!action || !log.username) {
          continue;
        }
        const already = rows.some(
          (r) => r.user.toLowerCase() === `@${log.username}`.toLowerCase(),
        );
        if (already) {
          continue;
        }
        rows.push({
          key: `log-${log.id}`,
          track: String(rows.length + 1).padStart(2, "0"),
          user: `@${log.username}`,
          action,
        });
      }
    }

    return rows;
  }, [waitingQueue, logs, currentUsername]);

  const clockChars = splitClock(elapsedLabel);

  const liveTicker = useMemo(() => {
    if (running && currentUsername) {
      return `${t("crawlerCurrent")} @${currentUsername}`;
    }
    const latest = logs[0];
    if (latest?.message) {
      return latest.message;
    }
    return t("crawlerActivityEmpty");
  }, [running, currentUsername, logs, t]);

  const stampText = useMemo(() => {
    if (running && currentUsername) {
      return "CURRENT";
    }
    const latest = logs[0];
    if (!latest) {
      return null;
    }
    return actionFromLogType(latest.type);
  }, [running, currentUsername, logs]);

  const currentValue = stats.current ? `@${stats.current}` : "—";

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <div className={styles.metalBar}>
          <div className={styles.stationMark}>
            <p className={styles.stationCode}>{t("crawlerDemoBoardCode")}</p>
            <p className={styles.stationName}>{t("crawlerDemoBoardStation")}</p>
          </div>
          <div className={styles.clockBlock} title={t("crawlerRunElapsed")}>
            {clockChars.map((ch, i) =>
              ch === ":" ? (
                <span key={`sep-${i}`} className={styles.clockSep}>
                  :
                </span>
              ) : (
                <span key={`d-${i}-${ch}`} className={styles.clockDigit}>
                  {ch}
                </span>
              ),
            )}
          </div>
        </div>

        <div className={styles.boardBody}>
          <div className={styles.colHead} aria-hidden="true">
            <span>#</span>
            <span>{t("crawlerDemoBoardColUser")}</span>
            <span>{t("crawlerDemoBoardColAction")}</span>
          </div>

          {displayRows.length === 0 ? (
            <p className={styles.emptyBoard}>{t("crawlerWaitingQueueEmpty")}</p>
          ) : (
            <div className={styles.rows}>
              {displayRows.map((row) => (
                <div key={row.key} className={styles.row}>
                  <div className={`${styles.flap} ${styles.flapTrack}`}>
                    <span className={styles.flapFace}>{row.track}</span>
                  </div>
                  <div className={`${styles.flap} ${styles.flapUser}`}>
                    <span className={styles.flapFace}>{row.user}</span>
                  </div>
                  <div className={styles.flap}>
                    <span
                      className={`${styles.flapFace} ${actionClass(row.action)}`}
                    >
                      {row.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.stampRail} aria-hidden="true">
          <div className={styles.lampRow}>
            <span className={`${styles.lamp} ${running ? styles.lampOn : ""}`} />
            <span
              className={`${styles.lamp} ${stampText ? styles.lampOn : ""}`}
            />
            <span className={styles.lamp} />
          </div>
          {stampText ? (
            <span className={`${styles.stamp} ${styles.stampIn}`}>
              {stampText}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerCurrent")}</p>
            <p className={styles.statValue}>{currentValue}</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerQueue")}</p>
            <p className={styles.statValue}>{stats.queue}</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerFollowed")}</p>
            <p className={styles.statValue}>{stats.followed}</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerSkipped")}</p>
            <p className={styles.statValue}>{stats.skipped}</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerFailed")}</p>
            <p className={styles.statValue}>{stats.failed}</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("crawlerDiscovered")}</p>
            <p className={styles.statValue}>{stats.discovered}</p>
          </div>
        </div>

        <div className={styles.footerRow}>
          <div className={styles.footerLeft}>
            <p className={styles.footerLabel}>{t("crawlerDemoBoardGate")}</p>
            <p className={styles.footerStatus}>
              {running ? t("crawlerDemoStatus") : t("crawlerDemoStatusIdle")}
            </p>
          </div>
          <div className={styles.ticker} aria-live="polite">
            <p key={liveTicker} className={styles.tickerText}>
              {liveTicker}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
