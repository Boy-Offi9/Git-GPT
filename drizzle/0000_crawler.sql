/**
 * SQL migration for crawler tables (Neon / PostgreSQL).
 * Apply with: npm run db:push   OR   psql "$DATABASE_URL" -f drizzle/0000_crawler.sql
 */
CREATE TABLE IF NOT EXISTS "crawler_state" (
  "owner_github_user_id" bigint PRIMARY KEY NOT NULL,
  "status" varchar(32) DEFAULT 'idle' NOT NULL,
  "current_username" varchar(39),
  "current_github_user_id" bigint,
  "delay_seconds" integer DEFAULT 30 NOT NULL,
  "queue_limit" integer DEFAULT 50 NOT NULL,
  "last_activity_at" timestamp with time zone,
  "last_error" text,
  "token_cipher" text,
  "worker_id" varchar(64),
  "worker_lease_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crawler_queue" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_github_user_id" bigint NOT NULL,
  "github_user_id" bigint NOT NULL,
  "username" varchar(39) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "crawler_queue_owner_user_uidx"
  ON "crawler_queue" ("owner_github_user_id", "github_user_id");
CREATE INDEX IF NOT EXISTS "crawler_queue_owner_status_discovered_idx"
  ON "crawler_queue" ("owner_github_user_id", "status", "discovered_at");

CREATE TABLE IF NOT EXISTS "crawler_processed" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_github_user_id" bigint NOT NULL,
  "github_user_id" bigint NOT NULL,
  "username" varchar(39) NOT NULL,
  "result" varchar(64) NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "network_expanded_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "crawler_processed_owner_user_uidx"
  ON "crawler_processed" ("owner_github_user_id", "github_user_id");
CREATE INDEX IF NOT EXISTS "crawler_processed_owner_expand_idx"
  ON "crawler_processed" (
    "owner_github_user_id",
    "network_expanded_at",
    "processed_at"
  );

CREATE TABLE IF NOT EXISTS "crawler_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_github_user_id" bigint NOT NULL,
  "type" varchar(32) NOT NULL,
  "github_user_id" bigint,
  "username" varchar(39),
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "crawler_logs_owner_created_idx"
  ON "crawler_logs" ("owner_github_user_id", "created_at");
