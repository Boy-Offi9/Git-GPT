export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Skip during `next build` collect / compile phases.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-development-build"
  ) {
    return;
  }
  if (process.env.CRAWLER_WORKER_IN_PROCESS === "0") {
    return;
  }
  if (!process.env.DATABASE_URL) {
    return;
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.warn(
      "[crawler] in-process worker skipped — SESSION_SECRET missing or short",
    );
    return;
  }

  const { runCrawlerWorkerLoop } = await import("@/lib/crawler/worker-loop");
  void runCrawlerWorkerLoop().catch((error) => {
    console.error("[crawler] in-process worker crashed", error);
  });
}
