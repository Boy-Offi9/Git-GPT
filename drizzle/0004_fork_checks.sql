CREATE TABLE IF NOT EXISTS "fork_checks" (
  "id" serial PRIMARY KEY,
  "owner_github_user_id" bigint NOT NULL,
  "full_name" varchar(200) NOT NULL,
  "parent" varchar(200),
  "ahead_by" integer,
  "checked_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "fork_checks_owner_full_name_uidx"
  ON "fork_checks" ("owner_github_user_id", "full_name");

CREATE INDEX IF NOT EXISTS "fork_checks_owner_checked_idx"
  ON "fork_checks" ("owner_github_user_id", "checked_at");

CREATE TABLE IF NOT EXISTS "fork_action_log" (
  "id" serial PRIMARY KEY,
  "owner_github_user_id" bigint NOT NULL,
  "full_name" varchar(200) NOT NULL,
  "action" varchar(16) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fork_action_log_owner_created_idx"
  ON "fork_action_log" ("owner_github_user_id", "created_at");
