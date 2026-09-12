-- Add run duration columns for crawler auto-stop
ALTER TABLE "crawler_state"
  ADD COLUMN IF NOT EXISTS "run_duration_minutes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crawler_state"
  ADD COLUMN IF NOT EXISTS "run_ends_at" timestamp with time zone;
