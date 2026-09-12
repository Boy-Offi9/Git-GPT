"use client";

import { useMemo } from "react";
import { Bot, Server, Zap } from "lucide-react";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { CrawlerLogItem } from "@/components/crawler/crawler-log-display";
import type { CrawlerDemoStats } from "@/components/crawler/crawler-demo-types";
import { EMPTY_DEMO_STATS } from "@/components/crawler/crawler-demo-types";
import styles from "@/components/crawler/crawler-demo-radar.module.css";

export type CrawlerDemoRadarProps = {
  elapsedLabel: string;
  running?: boolean;
  currentUsername?: string | null;
  stats?: CrawlerDemoStats;
  /** Real activity lines from the crawler (newest first). */
  logs?: CrawlerLogItem[];
};

const NODES = [
  { x: 14, y: 24, delay: "0s", label: "API", barDelay: ["0s", "0.15s", "0.3s"] },
  { x: 86, y: 20, delay: "0.35s", label: "Worker", barDelay: ["0.1s", "0.25s", "0.4s"] },
  { x: 12, y: 76, delay: "0.7s", label: "Queue", barDelay: ["0.2s", "0.05s", "0.35s"] },
  { x: 88, y: 74, delay: "1.05s", label: "DB", barDelay: ["0.3s", "0.1s", "0.2s"] },
  { x: 50, y: 10, delay: "0.2s", label: "GitHub", barDelay: ["0.05s", "0.2s", "0.4s"] },
] as const;

export function CrawlerDemoRadar({
  elapsedLabel,
  running = false,
  currentUsername = null,
  stats = EMPTY_DEMO_STATS,
  logs = [],
}: CrawlerDemoRadarProps) {
  const { t } = useI18n();

  const visibleLogs = useMemo(() => {
    const candidates: { text: string; key: string }[] = [];

    if (running && currentUsername) {
      candidates.push({
        text: `${t("crawlerCurrent")} @${currentUsername}`,
        key: `current-${currentUsername}`,
      });
    }

    for (const log of logs) {
      if (candidates.length >= 2) {
        break;
      }
      if (
        currentUsername &&
        log.message.includes(`@${currentUsername}`) &&
        candidates.some((c) => c.key.startsWith("current-"))
      ) {
        continue;
      }
      candidates.push({
        text: log.message,
        key: `log-${log.id}`,
      });
    }

    if (candidates.length === 0) {
      return [
        {
          text: t("crawlerActivityEmpty"),
          muted: false,
          key: "empty",
        },
      ];
    }

    if (candidates.length === 1) {
      return [{ ...candidates[0], muted: false }];
    }

    return [
      { ...candidates[1], muted: true },
      { ...candidates[0], muted: false },
    ];
  }, [logs, running, currentUsername, t]);

  const currentValue = stats.current ? `@${stats.current}` : "—";

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <div className={styles.grid} />
        <div className={`${styles.orbit} ${styles.orbitA}`}>
          <span className={styles.orbitDot} />
        </div>
        <div className={`${styles.orbit} ${styles.orbitB}`}>
          <span className={styles.orbitDot} />
        </div>

        <svg
          className={styles.svg}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {NODES.map((node, i) => (
            <g key={`g-${node.label}`}>
              <line
                x1="50"
                y1="50"
                x2={node.x}
                y2={node.y}
                className={styles.link}
                style={{ animationDelay: `${i * 0.2}s` }}
              />
              <circle
                r="1.05"
                className={styles.packet}
                style={{
                  offsetPath: `path('M 50 50 L ${node.x} ${node.y}')`,
                  animationDelay: `${i * 0.28}s`,
                }}
              />
              <circle
                r="0.65"
                className={`${styles.packet} ${styles.packetBack}`}
                style={{
                  offsetPath: `path('M 50 50 L ${node.x} ${node.y}')`,
                  animationDelay: `${0.85 + i * 0.2}s`,
                }}
              />
            </g>
          ))}
        </svg>

        {NODES.map((node) => (
          <div
            key={node.label}
            className={styles.node}
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              animationDelay: node.delay,
            }}
          >
            <span className={styles.nodeIcon}>
              <Server className="size-4" />
              <span className={styles.nodeBars} aria-hidden="true">
                {node.barDelay.map((d) => (
                  <span
                    key={d}
                    className={styles.nodeBar}
                    style={{ animationDelay: d }}
                  />
                ))}
              </span>
            </span>
            <span className={styles.nodeLabel}>{node.label}</span>
          </div>
        ))}

        <div className={styles.radar} aria-hidden="true">
          <span className={styles.radarRing} />
          <span className={`${styles.radarRing} ${styles.radarRing2}`} />
          <span className={`${styles.radarRing} ${styles.radarRing3}`} />
          <span className={styles.radarCrossH} />
          <span className={styles.radarCrossV} />
          <span className={styles.radarSweep} />
          <span className={styles.radarSweepEdge} />
        </div>

        <div className={styles.core}>
          <Bot className="size-7" />
          <span className={styles.coreLive}>
            <Zap className="size-2.5" />
            {running ? "live" : "idle"}
          </span>
        </div>

        <div className={styles.vignette} />
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

        <div className={styles.statusRow}>
          <div className={styles.statusLeft}>
            <span className={styles.pingWrap}>
              <span className={styles.pingOuter} />
              <span className={styles.pingInner} />
            </span>
            <p className={styles.statusText}>
              {running ? t("crawlerDemoStatus") : t("crawlerDemoStatusIdle")}
            </p>
          </div>
          <p className={styles.runtimeSolo} title={t("crawlerRunElapsed")}>
            {elapsedLabel}
          </p>
        </div>
        <div className={styles.logStream} aria-live="polite">
          {visibleLogs.map((line) => (
            <p
              key={line.key}
              className={
                line.muted
                  ? `${styles.logLine} ${styles.logMuted}`
                  : styles.logLine
              }
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
