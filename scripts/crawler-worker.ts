import { config } from "dotenv";
import { resolve } from "node:path";

// Local only — never override Railway/host env vars.
if (process.env.NODE_ENV !== "production") {
  config({ path: resolve(process.cwd(), ".env.local"), override: false });
  config({ override: false });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error(
      "SESSION_SECRET (>=32 chars) is required to decrypt crawler tokens",
    );
    process.exit(1);
  }
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
    process.exit(1);
  }

  // Prove encrypt/decrypt works with this process's SESSION_SECRET.
  const { encryptJson, decryptJson } = await import("@/lib/auth/crypto");
  const probe = { ok: true as const, n: Date.now() };
  const cipher = await encryptJson(probe);
  const roundTrip = await decryptJson<typeof probe>(cipher);
  if (!roundTrip?.ok || roundTrip.n !== probe.n) {
    console.error("SESSION_SECRET encrypt/decrypt round-trip failed");
    process.exit(1);
  }

  const { runCrawlerWorkerLoop } = await import("@/lib/crawler/worker-loop");
  await runCrawlerWorkerLoop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
