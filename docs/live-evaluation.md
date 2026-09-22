# Bounded live evaluation

These completed OpenRouter evaluations used fictional company evidence on September 17 and 22, 2026. No harness run in the table passed every check; a separate UI and worker check completed successfully. These results demonstrate observed behavior and validation failures, not a model benchmark or a production-reliability claim. Prompts and configuration changed between runs, so the rows are not controlled model comparisons.

## Completed results

Each saved run is `.local/live-verification-<run>.json`. These local reports are excluded from version control; this document includes neither credentials nor raw model output.

| Saved run | Requested model | Passed | Failed | Skipped | Model requests |
| --- | --- | ---: | ---: | ---: | ---: |
| `initial-nemotron` | `nvidia/nemotron-3-super-120b-a12b:free` | 7 | 3 | 4 | 7 |
| `nemotron-retry` | `nvidia/nemotron-3-super-120b-a12b:free` | 5 | 4 | 5 | 6 |
| `qwen-preflight` | `qwen/qwen3.8-27b:free` | 0 | 1 | 0 | 0 |
| `nex-mini` | `nex-agi/nex-n2.5-mini:free` | 4 | 4 | 6 | 6 |
| `liquid` | `liquid/lfm-2.5-2.6b:free` | 1 | 4 | 9 | 4 |
| `nex-pro` | `nex-agi/nex-n2.5-pro:free` | 4 | 4 | 6 | 6 |
| `nex-mini-none` | `nex-agi/nex-n2.5-mini:free` | 7 | 3 | 4 | 8 |
| `dots` | `dots-studio/dots-3-note-preview:free` | 2 | 3 | 9 | 4 |

Counts describe harness checks, including catalog preflight and deterministic reconciliation; they are not counts of correct model responses. Failed prerequisites skip dependent checks without substituting recorded results. The Qwen run stopped at the capability preflight and made no inference request. `nex-mini-none` records `promptVersion: live-v3` and `reasoningEffort: none`; `dots` records `live-v3` and `provider-default`. Earlier reports did not record these fields.

## Separate UI and worker check

On September 22, the actual browser UI, PostgreSQL queue, and worker completed a live review using `nex-agi/nex-n2.5-mini:free`, reasoning effort `none`, and `live-v3`. This used the isolated `revisit_livecheck` database and local application on port 3001.

All six stages completed on their first attempt. Extraction took 11,859 ms and reported 1,740 tokens; assessment took 5,039 ms and reported 1,816 tokens. The published snapshot contained all six expected source claims and preserved the unresolved customer-count conflict. A custom browser question about reconciling the counts returned cited historical and current figures, showed three supporting sources, and explicitly left reconciliation unknown.

Trace: run `74ecc693-7277-4593-ac78-a8f0259a4647`; snapshot `dce90d47-92e3-4343-b2a4-364a6fe30cf9`. This verifies one complete product path and a live custom answer. It does not establish repeatability or change the failed harness results above.

## What the failures revealed

- Initial Nemotron extraction recovered all six expected source metrics, but assessment wording copied an uncitable threshold and calculated gap, inserted claim IDs into prose, and changed ISO-date hyphens. Validation rejected it.
- Nemotron also timed out and returned HTTP-success envelopes containing numeric provider error code `503`. Those responses contained no usable choices or token usage.
- Nex mini joined source sentences across a newline, breaking exact quotation matching. Its assessment exhausted the output cap, and its missing-evidence answer placed an uncited limitation in the factual-paragraph array.
- Liquid failed quote/domain checks and encountered rate limiting. Nex pro encountered timeouts, truncated output, and an extraction mismatch in the instruction-injection scenario.
- With reasoning explicitly disabled, Nex mini completed without a recorded truncation or timeout, but still failed numeric grounding and injected-source validation. The configuration change did not produce a fully passing run.
- Dots recovered the original six metrics, then produced a truncated assessment, failed changed-evidence validation, and encountered a provider request rejection. The harness stopped further requests after that rejection.

## Changes included in `live-v3`

Assessment context excludes earlier narrative prose containing computed gaps or decision thresholds. Wording instructions require citation IDs in their dedicated array, exact ISO dates, and source-supported numbers. Extraction instructions require contiguous passages with unchanged line breaks; missing-evidence instructions require an empty factual-paragraph array and explicit unknowns.

Optional OpenRouter reasoning effort controls address models that consume their output budget before producing JSON. The exact observed HTTP-200/numeric-503 envelope is classified as a retryable availability failure. Offline regressions cover these cases; evidence, citation, numeric, and completion validators were not weakened.

The harness retains a hard ceiling of 12 model requests per run, 45-second request timeouts, bounded outputs, no SDK retries, and a verified free-model catalog preflight. It stops further requests on quota, rate-limit, or access failures. Reports retain failures and identify unavailable usage rather than inventing token counts. No application database records are written by the harness.

Reproduce with [the live verification instructions](ai-execution.md#bounded-live-verification) and inspect [the harness](../scripts/verify-live.ts). A successful offline test suite verifies application behavior under controlled responses; it does not replace a completed live evaluation.

The custom answer used 2,342 reported tokens and completed in 5.8 seconds. A clarification decision was then saved through the UI; its JSON export returned HTTP 200, `delivery: unsent`, and the same original live snapshot.
