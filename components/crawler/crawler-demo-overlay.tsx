"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/i18n-provider";
import { CrawlerDemoRadar } from "@/components/crawler/crawler-demo-radar";
import { CrawlerDemoBoard } from "@/components/crawler/crawler-demo-board";
import type { CrawlerDemoWaitingItem } from "@/components/crawler/crawler-demo-board";
import type { CrawlerLogItem } from "@/components/crawler/crawler-log-display";
import type { CrawlerDemoStats } from "@/components/crawler/crawler-demo-types";
import { EMPTY_DEMO_STATS } from "@/components/crawler/crawler-demo-types";
import styles from "@/components/crawler/crawler-demo-overlay.module.css";

export type CrawlerDemoMode = "radar" | "board";

type CrawlerDemoOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Same elapsed label as the status bar (e.g. `3:42`). */
  elapsedLabel: string;
  running?: boolean;
  currentUsername?: string | null;
  stats?: CrawlerDemoStats;
  logs?: CrawlerLogItem[];
  waitingQueue?: CrawlerDemoWaitingItem[];
};

export function CrawlerDemoOverlay({
  open,
  onOpenChange,
  elapsedLabel,
  running = false,
  currentUsername = null,
  stats = EMPTY_DEMO_STATS,
  logs = [],
  waitingQueue = [],
}: CrawlerDemoOverlayProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<CrawlerDemoMode>("radar");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) {
    return null;
  }

  const isRadar = mode === "radar";

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-label={t("crawlerDemoClose")}
        onClick={() => onOpenChange(false)}
      />

      <div
        className={`${styles.panel} ${isRadar ? styles.panelRadar : styles.panelBoard}`}
      >
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div>
              <p id={titleId} className={styles.title}>
                {isRadar ? t("crawlerDemoTitleRadar") : t("crawlerDemoTitleBoard")}
              </p>
              <p className={styles.hint}>
                {isRadar ? t("crawlerDemoHintRadar") : t("crawlerDemoHintBoard")}
              </p>
            </div>
            <div className={styles.modes} role="tablist" aria-label={t("crawlerDemoModes")}>
              <button
                type="button"
                role="tab"
                aria-selected={isRadar}
                className={`${styles.modeBtn} ${isRadar ? styles.modeBtnActiveRadar : ""}`}
                onClick={() => setMode("radar")}
              >
                {t("crawlerDemoModeRadar")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isRadar}
                className={`${styles.modeBtn} ${!isRadar ? styles.modeBtnActiveBoard : ""}`}
                onClick={() => setMode("board")}
              >
                {t("crawlerDemoModeBoard")}
              </button>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`size-8 rounded-sm hover:bg-white/10 ${styles.close}`}
            aria-label={t("crawlerDemoClose")}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        {isRadar ? (
          <CrawlerDemoRadar
            elapsedLabel={elapsedLabel}
            running={running}
            currentUsername={currentUsername}
            stats={stats}
            logs={logs}
          />
        ) : (
          <CrawlerDemoBoard
            elapsedLabel={elapsedLabel}
            running={running}
            currentUsername={currentUsername}
            stats={stats}
            logs={logs}
            waitingQueue={waitingQueue}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
