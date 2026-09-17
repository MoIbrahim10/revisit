# Three-minute reviewer walkthrough

Start with `npm ci` and `npm run demo`; open the workspace. Use the supplied source pack and recorded mode for a reproducible walkthrough. Live credentials are optional.

## 0:00 — The decision

“An investor tracked Lattice Harbor when it had 12 paying organizations. The team wanted to revisit at 25 and after seeing recurring-revenue detail. New documents arrived. The useful question is whether those documents change the earlier decision.”

Show the original rationale, the comparison, and the two criteria. Revenue documentation is present but company-reported. The customer trigger is unresolved.

## 0:35 — The disagreement

Open **Compare passages** beneath the customer chart.

“The deck says 30, while the finance extract says 24, for the same period and definition. The website's 60 teams is a different measure. The system preserves these distinctions instead of picking the largest figure.”

Point out the exact quotations and common publisher. Two company-authored sources are not independent confirmation. Close with Escape.

## 1:10 — Contextual questions

Open **Questions** and choose **Is the trigger met?** or **What should I ask?**

“The answer uses this snapshot and includes both sides of the disagreement. Recorded mode is explicit: the persistence, retrieval, comparison, and evidence checks are real, while extraction uses a curated fixture. A separate structured-output adapter supports live inference.”

## 1:45 — Preserve the review

Choose **Record decision**, select clarification, and explain the account reconciliation needed. Saving opens **Decisions**; **Download decision** exports the handoff.

“The review is bound to exactly what the analyst saw. A later analysis cannot rewrite its evidence. The export is an unsent handoff containing that decision and snapshot.”

## 2:15 — Show recovery

Open **Activity**, expand **Developer tools**, then choose **Test recovery**. Inspect the two extraction attempts after automatic retry.

“This intentionally interrupts the first extraction attempt. PostgreSQL-backed work resumes from completed stages. Attempts and errors remain visible, and publishing the snapshot and completing the run happen in one transaction.”

## Engineering discussion

- **Why this product?** Loop3's public work emphasizes historical context, source reconciliation, and useful workflows around investment systems. Revisit connects those concerns to one analyst decision.
- **Why a bounded workflow?** Extraction and phrasing benefit from a model. Dates, thresholds, provenance, retries, and publication should remain inspectable application rules.
- **Why PostgreSQL and pg-boss?** The corpus fits full-text retrieval, and the queue can share the enqueue transaction. There is no measured need here for a vector database or another service.
- **What is the strongest invariant?** Every published snapshot has validated evidence and a frozen source manifest; each saved decision retains its original snapshot.
- **What would come next?** Evaluate the live adapter on a representative labeled corpus, then address deployment and authorization for a defined user model. Add integrations only after that workflow is validated with users.

Avoid describing this as a Loop3 product, an Affinity integration, independently verified investment research, or a production deployment. The data is fictional and the live provider has not been evaluated.
