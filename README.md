# Revisit

**We tracked this company for a reason. Does the new evidence change that decision?**

Revisit is a focused investment-research demo built for a Loop3 engineering application. It connects an earlier review to new source material, preserves conflicting claims, and helps an analyst record a defensible next action.

The fictional company reports **30 paying organizations in its deck**, **24 in its finance extract**, and **60 teams on its website**. The earlier review says to revisit at **25 paying organizations**. Revisit shows why the first two figures conflict, why the third is a different measure, and why the trigger remains unresolved.

## Run locally

Prerequisites: Node.js 22.12+ and PostgreSQL 18 tools (`initdb`, `pg_ctl`, `psql`) on your PATH. No model API key, paid data subscription, or cloud account is needed.

```sh
npm ci
npm run demo
```

Open [localhost:3000](http://127.0.0.1:3000). The command initializes an isolated database under `.local/postgres`, seeds fictional sources, validates the first snapshot, then starts the web application and background worker. PostgreSQL uses a project-local Unix socket, without a TCP listener. Existing demo data is preserved on subsequent runs. Stop the web application and worker with Ctrl+C; the local PostgreSQL instance remains available.

To stop that specific local database:

```sh
pg_ctl -D .local/postgres -m fast stop
```

For separate terminals, run `npm run db:setup`, then `npm run worker` and `npm run dev`. Production compilation is `npm run build`; `npm start` still requires the database and separate worker. The application binds to the loopback interface by default.

## Three-minute walkthrough

1. Read the original Track rationale and compare it with current evidence.
2. Open the customer-count disagreement and inspect the exact source passages.
3. Ask a suggested question about the revisit trigger or founder follow-up.
4. Record a decision and export its unsent handoff. Refresh to confirm persistence.
5. Open Activity → Developer tools and exercise recovery: the first extraction attempt fails, then resumes from the saved ingestion step.

## What is real, and what is simulated

| Capability | Implementation |
| --- | --- |
| Database, queue, worker, run progress, retries, review history | Real PostgreSQL persistence and pg-boss execution |
| Claim normalization, temporal comparison, trigger evaluation, citation checks | Deterministic application code |
| Recorded inference | Hand-authored extraction fixtures; contextual answers and assessments derived from validated claims. No model call occurs. |
| Live inference | Optional Vercel AI SDK adapter for OpenRouter, NVIDIA, or OpenAI; requires server-provided credentials and an explicit model supporting structured outputs |
| Company, documents, figures, analyst history | Entirely fictional |
| CRM handoff | Downloadable internal JSON format, explicitly unsent; no Affinity integration |
| Website/deck/finance ingestion | Pasted text and curated excerpts; no crawler, PDF parser, or OCR |

Recorded mode only analyzes the unchanged source pack and answers its four suggested questions. Other questions return an explicit limitation. Added custom sources are stored for live analysis and excluded from recorded demo runs. A failed new review leaves the last completed snapshot intact.

For live mode, set `AI_PROVIDER` to `openrouter`, `nvidia`, or `openai`, set `AI_MODEL` to an explicit model ID, and supply the matching `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, or `OPENAI_API_KEY` in both the web and worker process environments. Existing `OPENAI_API_KEY` + `OPENAI_MODEL` configuration remains supported when no provider is selected. Supply credentials through your own secret management; no environment or credential files are included.

The selected model must support strict JSON-schema output through Chat Completions. OpenRouter offers free model variants, and NVIDIA offers developer access for prototyping; availability, quotas, and schema support vary by model. No automatic model or paid fallback is selected. A credentialed live review has completed through the application; the broader adversarial suite still has failures. Recorded mode remains the dependable reviewer path. See [measured live results](docs/live-evaluation.md). See [provider setup and limitations](docs/ai-execution.md).

## Engineering decisions

- **One bounded workflow:** ingest → extract → reconcile → assess → verify → publish. The model does not choose tools or write external records.
- **Evidence before prose:** exact quotations, offsets, source versions, dates, definitions, and claim references are validated. Quotation validity does not prove a business claim is true.
- **Temporal correctness:** the April baseline and June statements establish change; different definitions cannot establish a contradiction.
- **Durable processing:** enqueue and the frozen input manifest commit together. Successful stages are checkpoints; publication and completed status share a transaction.
- **Concurrency and recovery:** per-run advisory locks fence competing deliveries; unique constraints prevent duplicate stage results, snapshots, and reviews. Queue terminal-state reconciliation exposes a worker's final interrupted attempt for retry.
- **Small infrastructure footprint:** Next.js, one Node worker, and PostgreSQL. No Redis, vector database, agent framework, or ORM is necessary for this corpus.
- **Inspectable execution:** attempts, stage duration, model identity, token usage when available, prompt/schema versions, and errors are persisted. Recorded runs never invent live token usage.
- **Grounded questions:** source search is scoped to a snapshot; conflicting evidence is included together. Unsupported questions remain unknown.

The application is deliberately a **single-company local demonstrator**, not a multi-tenant investment platform. Authentication, public deployment, and real client data are outside its scope. The original analyst trigger is seeded; new reviews preserve their snapshot, and new runs freeze their baseline context. The metric vocabulary is intentionally bounded. See [AI behavior and limitations](docs/ai-execution.md) for conservative validation rules.

## Verification

```sh
npm test
npm run test:integration
npm run typecheck
npm run build
```

Unit and offline SDK tests require no running services. Integration tests use a separate `revisit_test` database on the local demo PostgreSQL instance; run `npm run db:setup` first. They exercise database constraints, transactional enqueueing, resume behavior, idempotency, and snapshot-bound reviews. They do not call a live model. See [verification notes](docs/verification.md) for measured results and [presenter notes](docs/demo-walkthrough.md) for a short reviewer walkthrough.

## Reviewer entry points

| File | What to inspect |
| --- | --- |
| [Research and plan](docs/loop3-demo-plan.md) | Loop3 research, three concepts, scope, architecture, and deliberate omissions |
| [Domain engine](src/domain/engine.ts) | Comparison rules, provenance checks, explicit unknowns |
| [Workflow](src/server/workflow.ts) | Checkpoints, locking, retries, atomic publication |
| [Schema](src/server/schema.sql) | Relational source/run/claim/evidence/decision constraints |
| [Live adapter](src/server/ai.ts) | Structured model outputs and bounded failure handling |
| [Workspace](src/components/workspace.tsx) | Shared orchestration with separate review, sources, questions, decisions, and activity views |
| [Live verification](scripts/verify-live.ts) | Bounded free-model evaluation with actual evidence, adversarial cases, and failure reports |
| [Tests](tests) | Adversarial evidence checks and execution invariants |

Loop3's published [historical snapshots](https://www.loop3.ai/case-studies/company-and-people-snapshots) and [context article](https://www.loop3.ai/news/the-real-ai-advantage-isn-t-chat-gpt-or-claude-it-s-context) informed the concept. This project is independent and is not a Loop3 product or client-data reproduction.
