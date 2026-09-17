# Verification notes

Verified locally on 17 September 2026 with Node.js 24.21.0, PostgreSQL 18.2, and the exact dependencies in `package-lock.json`.

## Automated checks

| Command | Result | Coverage |
| --- | --- | --- |
| `npm test` | 35 passed | 16 domain tests and 19 offline SDK transport tests |
| `npm run test:integration` | 12 passed | Actual PostgreSQL and pg-boss using the isolated `revisit_test` database |
| `npm run typecheck` | Passed | TypeScript checking across application, worker, scripts, and tests |
| `npm run build` | Passed | Next.js production compilation, type checking, and route generation |

The tests check provenance, quotation offsets, unsupported numeric claims, different metric definitions, historical versus same-period comparisons, structured response parsing, refusal handling, transient versus permanent provider errors, transactional enqueue rollback, frozen run inputs, resume checkpoints, advisory-lock contention, terminal queue failure recovery, publication idempotency, cross-company constraints, and decisions tied to their reviewed snapshots.

Offline model tests use the actual SDK parser with injected HTTP responses. They establish adapter behavior under those responses, not model quality or compatibility with a credentialed provider account.

The two added regressions verify that custom sources cannot break a recorded review, and that duplicate text with conflicting metadata returns a clear error while identical submissions remain idempotent.

## Browser and HTTP checks

- Loaded the production build and inspected the desktop layout and a narrow viewport. The narrow layout had no horizontal document overflow; the evidence drawer stayed within the viewport.
- Reloaded the final production build and found no captured browser console warnings or errors.
- Opened both sides of the 24-versus-30 disagreement. Exact quotes, dates, and source relationships were visible. Escape closed the dialog and restored focus to its trigger.
- Asked the suggested 25-customer question. The answer cited both conflicting counts and kept the trigger unresolved.
- Saved a clarification decision, refreshed, and found the unchanged rationale in decision history.
- Exercised handoff export and inspected the JSON response: `revisit-handoff-v1`, `delivery: unsent`, fictional-data flag, the saved decision, and its original snapshot with six claims.
- Ran the recovery demonstration through the UI. Extraction attempt one failed; attempt two completed automatically. Ingestion remained at one attempt and the remaining stages completed. The inspector showed both extraction attempts.
- Confirmed that this newer successful run did not change the snapshot attached to the earlier saved decision.
- Started the development server and received HTTP 200 from `/api/workspace`. The tool sandbox caused file-watcher errors; running the same server outside that sandbox resolved them without a polling workaround.

After the interface redesign, manually verified source search and its empty state, saving a custom source, completing a recorded review with that source excluded, saving another decision, tab Arrow/Home/End keys, the founder-question shortcut, and modal Escape/focus restoration. Dialogs lock background scrolling. The review and source-library layouts had no horizontal overflow at the browser's measured 433 CSS-pixel narrow viewport, with equal-width review cards. The fake workspace switcher and profile affordances were removed; navigation now has one set of five tabs. Recorded mode presents its supported questions directly instead of accepting arbitrary text it cannot answer.

The subsequent spacing pass uses one equal-column grid for all four review cards. Browser measurements confirmed matching card widths, matching heights within each row, and top-card footers at the same vertical position with equal 70px heights. The expanded assessment now separates a summary from a two-column findings grid. Type checking and the production build passed after these changes.

After the Motion and Vercel AI SDK migration, verified checklist and assessment expansion, quick open/close reversals, keyboard activation, evidence-drawer pointer close and Escape, focus restoration, and background scroll unlocking. Collapsed disclosure content has zero height, `aria-hidden`, and `inert`. The keyless founder-question flow still returned its cited response, and no browser warnings or errors were captured. Reduced-motion handling is implemented but was not separately emulated in the browser. Provider transport tests cover all three endpoint selections, strict schemas, credential isolation, sanitized errors, and disabled SDK retries; they make no external inference calls.

The notification polish pass removes the header workspace label and places progress/success feedback in a fixed stack. A real recorded review completed through the browser: the review panel stayed at exactly 340.56px from the viewport top before enqueue, while queued, and after the completion toast appeared. Question cards use equal-height rows with a stronger selected state. Production build and TypeScript checks passed.

These are focused manual browser checks, not an automated cross-browser, screen-reader, or load-testing suite.

## Boundaries

The credentialed live-model path has not been executed. Recorded mode is the verified reviewer path and requires no API key. Custom source text and unsupported questions require live mode; the application does not substitute fixture answers for arbitrary input. Added custom sources remain stored for live analysis; recorded reviews explicitly freeze only the four curated sources and still validate their unchanged contents.

This is a local, single-company demonstration with fictional information. It has no authentication, public hosting, multi-tenant authorization, production migration system, PDF/OCR processing, or external CRM writes. Quote validation establishes source fidelity and limited consistency, not the truth of the underlying company statements. Human review remains necessary.
