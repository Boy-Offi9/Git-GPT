export type CrawlerDemoStats = {
  current: string | null;
  queue: string;
  followed: number;
  skipped: number;
  failed: number;
  discovered: number;
};

export const EMPTY_DEMO_STATS: CrawlerDemoStats = {
  current: null,
  queue: "0",
  followed: 0,
  skipped: 0,
  failed: 0,
  discovered: 0,
};
