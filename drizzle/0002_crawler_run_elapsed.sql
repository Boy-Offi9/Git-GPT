-- Track live / frozen run elapsed time for the status bar
ALTER TABLE "crawler_state"
  ADD COLUMN IF NOT EXISTS "run_started_at" timestamp with time zone;
ALTER TABLE "crawler_state"
  ADD COLUMN IF NOT EXISTS "run_elapsed_ms" integer DEFAULT 0 NOT NULL;
