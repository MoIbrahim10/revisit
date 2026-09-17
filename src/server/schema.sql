CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY, data jsonb NOT NULL, baseline jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS source_versions (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id),
  title text NOT NULL, content_hash text NOT NULL, body text NOT NULL,
  data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, content_hash), UNIQUE(company_id, id)
);
CREATE TABLE IF NOT EXISTS source_chunks (
  id text PRIMARY KEY, source_id text NOT NULL REFERENCES source_versions(id),
  ordinal integer NOT NULL, body text NOT NULL, start_offset integer NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  UNIQUE(source_id, ordinal)
);
CREATE INDEX IF NOT EXISTS chunks_search ON source_chunks USING gin(search_vector);
CREATE TABLE IF NOT EXISTS analysis_runs (
  id uuid PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id),
  mode text NOT NULL CHECK(mode IN ('recorded','live')),
  status text NOT NULL CHECK(status IN ('queued','running','retrying','completed','failed')),
  idempotency_key text NOT NULL, recovery_test boolean NOT NULL DEFAULT false,
  queue_job_id uuid, baseline_snapshot jsonb,
  error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(company_id, idempotency_key), UNIQUE(id, company_id)
);
CREATE TABLE IF NOT EXISTS run_inputs (
  run_id uuid NOT NULL, company_id text NOT NULL, source_id text NOT NULL,
  PRIMARY KEY(run_id, source_id),
  FOREIGN KEY(run_id, company_id) REFERENCES analysis_runs(id, company_id),
  FOREIGN KEY(company_id, source_id) REFERENCES source_versions(company_id, id)
);
CREATE TABLE IF NOT EXISTS stage_executions (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES analysis_runs(id),
  stage text NOT NULL, attempt integer NOT NULL,
  status text NOT NULL CHECK(status IN ('running','completed','failed')),
  input_hash text NOT NULL, output jsonb, model text, tokens integer,
  error text, started_at timestamptz NOT NULL DEFAULT now(), duration_ms integer,
  schema_version text NOT NULL DEFAULT '1', prompt_version text NOT NULL DEFAULT '1',
  UNIQUE(run_id, stage, attempt)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_stage_success ON stage_executions(run_id, stage) WHERE status='completed';
CREATE TABLE IF NOT EXISTS claims (
  run_id uuid NOT NULL REFERENCES analysis_runs(id), id text NOT NULL,
  source_id text NOT NULL REFERENCES source_versions(id), metric text NOT NULL,
  effective_date date, data jsonb NOT NULL,
  PRIMARY KEY(run_id,id), FOREIGN KEY(run_id,source_id) REFERENCES run_inputs(run_id,source_id)
);
CREATE TABLE IF NOT EXISTS evidence (
  run_id uuid NOT NULL, claim_id text NOT NULL, source_id text NOT NULL,
  quote text NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL,
  PRIMARY KEY(run_id, claim_id), FOREIGN KEY(run_id,claim_id) REFERENCES claims(run_id,id),
  FOREIGN KEY(run_id,source_id) REFERENCES run_inputs(run_id,source_id),
  CHECK(start_offset >= 0 AND end_offset > start_offset)
);
CREATE TABLE IF NOT EXISTS claim_links (
  run_id uuid NOT NULL, from_id text NOT NULL, to_id text NOT NULL, relationship text NOT NULL,
  PRIMARY KEY(run_id,from_id,to_id,relationship),
  FOREIGN KEY(run_id,from_id) REFERENCES claims(run_id,id),
  FOREIGN KEY(run_id,to_id) REFERENCES claims(run_id,id)
);
CREATE TABLE IF NOT EXISTS snapshots (
  id uuid PRIMARY KEY, run_id uuid NOT NULL UNIQUE REFERENCES analysis_runs(id),
  company_id text NOT NULL REFERENCES companies(id), data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,company_id)
);
CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY, company_id text NOT NULL, snapshot_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('track','clarify','meeting')),
  rationale text NOT NULL, thesis_snapshot jsonb NOT NULL, idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,idempotency_key),
  FOREIGN KEY(snapshot_id,company_id) REFERENCES snapshots(id,company_id)
);
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY, snapshot_id uuid NOT NULL REFERENCES snapshots(id),
  question text NOT NULL, answer jsonb NOT NULL, retrieved_source_ids jsonb NOT NULL,
  mode text NOT NULL, model text, tokens integer, duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_company ON snapshots(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_company ON decisions(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS runs_company ON analysis_runs(company_id,created_at DESC);
-- Additive bootstrap upgrades for earlier local demo databases.
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS queue_job_id uuid;
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS baseline_snapshot jsonb;
ALTER TABLE claims ALTER COLUMN effective_date DROP NOT NULL;
