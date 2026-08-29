CREATE SCHEMA IF NOT EXISTS sch_repo_scanner;

CREATE TABLE IF NOT EXISTS sch_repo_scanner.jobs (
  id           uuid         PRIMARY KEY,
  status       varchar(16)  NOT NULL,
  source_kind  varchar(8)   NOT NULL,
  source_name  varchar(512) NOT NULL,
  source_bytes bigint        NOT NULL,
  progress     int          NOT NULL DEFAULT 0,
  step         varchar(16),
  error        text,
  result       jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON sch_repo_scanner.jobs (status);
