ALTER TABLE "crawler_processed"
  ADD COLUMN IF NOT EXISTS "network_expanded_at" timestamp with time zone;

-- Existing history was already scraped under the old per-follow discover path.
UPDATE "crawler_processed"
SET "network_expanded_at" = "processed_at"
WHERE "network_expanded_at" IS NULL;

CREATE INDEX IF NOT EXISTS "crawler_processed_owner_expand_idx"
  ON "crawler_processed" (
    "owner_github_user_id",
    "network_expanded_at",
    "processed_at"
  );
