import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forkActionLog, forkChecks } from "@/lib/db/schema";
import type { ForkCheck } from "@/types/cleanup";

export async function getCachedForkChecks(
  ownerGithubUserId: number,
): Promise<Record<string, ForkCheck>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(forkChecks)
    .where(eq(forkChecks.ownerGithubUserId, ownerGithubUserId));

  const result: Record<string, ForkCheck> = {};
  for (const row of rows) {
    result[row.fullName] = {
      fullName: row.fullName,
      parent: row.parent,
      aheadBy: row.aheadBy,
      checkedAt: row.checkedAt.toISOString(),
    };
  }
  return result;
}

export async function saveForkCheck(
  ownerGithubUserId: number,
  check: ForkCheck,
): Promise<void> {
  const db = getDb();
  await db
    .insert(forkChecks)
    .values({
      ownerGithubUserId,
      fullName: check.fullName,
      parent: check.parent,
      aheadBy: check.aheadBy,
      checkedAt: new Date(check.checkedAt),
    })
    .onConflictDoUpdate({
      target: [forkChecks.ownerGithubUserId, forkChecks.fullName],
      set: {
        parent: check.parent,
        aheadBy: check.aheadBy,
        checkedAt: new Date(check.checkedAt),
      },
    });
}

export async function deleteCachedForkCheck(
  ownerGithubUserId: number,
  fullName: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(forkChecks)
    .where(
      and(
        eq(forkChecks.ownerGithubUserId, ownerGithubUserId),
        eq(forkChecks.fullName, fullName),
      ),
    );
}

export async function logForkAction(
  ownerGithubUserId: number,
  fullName: string,
  action: "archive" | "unarchive" | "delete",
): Promise<void> {
  const db = getDb();
  await db.insert(forkActionLog).values({
    ownerGithubUserId,
    fullName,
    action,
  });
}
