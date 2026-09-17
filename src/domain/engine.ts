import { recordedClaims, sources as fixtureSources, suggestedQuestions } from "../fixtures/lattice";
import { answerSchema, assessmentSchema, extractionSchema } from "./schemas";
import type { Answer, Assessment, Baseline, Claim, Criterion, Finding, Snapshot, Source } from "./types";

const CUSTOMER_DEFINITION = "paying organizations excluding trials and pilots";
const units: Record<Claim["metric"], string> = {
  paying_customers: "organizations", teams: "teams", mrr: "USD/month", retention: "%",
};
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const knownDefinition = (claim: Claim) => !/^(?:unknown|undefined|unspecified|not specified)$/.test(normalize(claim.definition));
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const comparable = (a: Claim, b: Claim) => a.metric === b.metric && a.unit === b.unit && knownDefinition(a) && knownDefinition(b) && normalize(a.definition) === normalize(b.definition);
const ids = (claims: Claim[]) => [...new Set(claims.map((claim) => claim.id))];
const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}.`);
}

function numberInMetric(claim: Claim): number | undefined {
  const patterns: Record<Claim["metric"], RegExp> = {
    paying_customers: /\b(\d[\d,]*(?:\.\d+)?)\s+paying\s+(?:organizations|customers)\b/i,
    teams: /\b(\d[\d,]*(?:\.\d+)?)\s+teams\b/i,
    mrr: /(?:\bMRR\b|monthly recurring (?:software subscription )?revenue)[^.!?\n\d]{0,20}USD\s*(\d[\d,]*(?:\.\d+)?)/i,
    retention: /\bretention\b[^.!?\n%]{0,120}?(\d[\d,]*(?:\.\d+)?)\s*%/i,
  };
  const match = claim.quote.match(patterns[claim.metric]);
  return match ? Number(match[1].replaceAll(",", "")) : undefined;
}

/** Checks source support for this bounded metric vocabulary, not business truth. */
export function validateClaims(claims: Claim[], sources: Source[]): void {
  extractionSchema.parse({ claims });
  assertUnique(sources.map((source) => source.id), "source ID");
  assertUnique(claims.map((claim) => claim.id), "claim ID");
  if (new Set(sources.map((source) => source.companyId)).size > 1) throw new Error("Sources cross company scope.");
  const byId = new Map(sources.map((source) => [source.id, source]));
  for (const claim of claims) {
    const source = byId.get(claim.sourceId);
    if (!source) throw new Error(`Unknown source for claim ${claim.id}.`);
    if (claim.end <= claim.start || source.body.slice(claim.start, claim.end) !== claim.quote || claim.end > source.body.length) {
      throw new Error(`Quote offsets do not match source for claim ${claim.id}.`);
    }
    if (claim.unit !== units[claim.metric]) throw new Error(`Unsupported unit for claim ${claim.id}.`);
    if (numberInMetric(claim) !== claim.value) throw new Error(`Numeric value is not supported by the metric passage for claim ${claim.id}.`);
    if ((claim.metric === "paying_customers" || claim.metric === "teams") && !Number.isInteger(claim.value)) throw new Error("Customer and team counts must be integers.");
    if (knownDefinition(claim) && !normalize(claim.quote).includes(normalize(claim.definition))) throw new Error(`Definition is not supported by the passage for claim ${claim.id}.`);
    if (claim.asOf && claim.asOf !== source.effectiveDate) throw new Error(`Effective date differs from the source for claim ${claim.id}.`);
    const quotedDates = claim.quote.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    if (claim.asOf && quotedDates && !quotedDates.includes(claim.asOf)) throw new Error(`Effective date is not supported by the passage for claim ${claim.id}.`);
  }
}

function latest(claims: Claim[]): Claim[] {
  const dated = claims.filter((claim) => validDate(claim.asOf));
  const date = dated.map((claim) => claim.asOf).sort().at(-1);
  return dated.filter((claim) => claim.asOf === date);
}

function customerCriterion(claims: Claim[], definition: string): Criterion {
  const candidates = claims.filter((claim) => claim.metric === "paying_customers" && claim.unit === "organizations" && knownDefinition(claim) && normalize(claim.definition) === definition);
  const current = latest(candidates);
  const base = { id: "paying-customers", label: "At least 25 paying organizations", claimIds: ids(current) };
  if (!current.length || candidates.some((claim) => !validDate(claim.asOf))) {
    return { ...base, status: "unknown", claimIds: ids(candidates), explanation: "A dated, consistently defined paying-organization count is needed to evaluate the trigger." };
  }
  const values = [...new Set(current.map((claim) => claim.value))].sort((a, b) => a - b);
  if (values.length > 1) return { ...base, status: "disputed", explanation: `Same-date sources report ${values.map(format).join(" and ")} paying organizations at ${current[0].asOf}. The threshold cannot be treated as resolved until these counts are reconciled.` };
  const status = values[0] >= 25 ? "met" : "unmet";
  return { ...base, status, explanation: `The latest comparable source count is ${format(values[0])} paying organizations at ${current[0].asOf}, ${status === "met" ? "meeting" : "below"} the 25-organization trigger. This is source-reported, not independently verified.` };
}

export function reconcile(claims: Claim[], baseline: Baseline): Assessment {
  const ordered = [...claims].sort((a, b) => a.id.localeCompare(b.id));
  const prior = ordered.find((claim) => claim.sourceId === baseline.sourceId && claim.metric === "paying_customers" && claim.value === baseline.payingCustomers);
  const definition = prior && knownDefinition(prior) ? normalize(prior.definition) : CUSTOMER_DEFINITION;
  const findings: Finding[] = [];
  const groups = new Map<string, Claim[]>();
  for (const claim of ordered) {
    if (!validDate(claim.asOf) || !knownDefinition(claim)) continue;
    const key = [claim.metric, claim.unit, claim.asOf, normalize(claim.definition)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  for (const group of groups.values()) {
    const values = [...new Set(group.map((claim) => claim.value))].sort((a, b) => a - b);
    if (values.length < 2) continue;
    findings.push({
      id: `conflict-${group[0].id}`, kind: "conflict",
      title: group[0].metric === "paying_customers" ? "Same date. Same definition. Different counts." : "Comparable source statements disagree",
      detail: `${values.map(format).join(" versus ")} ${group[0].unit} at ${group[0].asOf}, using the same definition. Neither statement overrides the other; request the underlying reconciliation.`,
      claimIds: ids(group),
    });
  }

  const current = latest(ordered.filter((claim) => claim.metric === "paying_customers" && normalize(claim.definition) === definition && knownDefinition(claim) && claim.unit === "organizations"));
  if (prior && validDate(prior.asOf) && current.length && current[0].asOf > prior.asOf && current.some((claim) => claim.value !== prior.value)) {
    const values = [...new Set(current.map((claim) => claim.value))].sort((a, b) => a - b);
    findings.unshift({
      id: "customer-change", kind: "change", title: "Commercial traction has moved since the last review",
      detail: `The earlier note records ${format(prior.value)} paying organizations at ${prior.asOf}. Newer sources report ${values.map(format).join(" and ")} at ${current[0].asOf}.${values.length > 1 ? " These statements describe a later period; the current count remains disputed." : " Different reporting dates make this a historical change, not a contradiction."}`,
      claimIds: ids([prior, ...current]),
    });
  }

  const teams = ordered.filter((claim) => claim.metric === "teams");
  if (teams.length) findings.push({
    id: "teams-context", kind: "context", title: `${teams.map((claim) => format(claim.value)).join(" / ")} teams is a different measure`,
    detail: "A team count does not establish a count of paying organizations. The source does not provide a conversion between these measures; keep it separate from the customer trigger.", claimIds: ids(teams),
  });
  const incompatible = ordered.filter((claim) => claim.metric === "paying_customers" && (normalize(claim.definition) !== definition || !knownDefinition(claim) || claim.unit !== "organizations" || !validDate(claim.asOf)));
  if (incompatible.length) findings.push({
    id: "customer-comparability", kind: "unknown", title: "Some customer statements cannot be compared",
    detail: "Missing dates, missing definitions, or different units and customer definitions prevent a direct comparison. These statements are not counted as contradictions or used to establish the trigger.", claimIds: ids(incompatible),
  });

  const revenue = latest(ordered.filter((claim) => claim.metric === "mrr" && claim.unit === "USD/month" && knownDefinition(claim)));
  const revenueValues = [...new Set(revenue.map((claim) => claim.value))];
  const revenueStatus = !revenue.length ? "unknown" : revenueValues.length > 1 ? "disputed" : revenue[0].value > 0 ? "met" : "unmet";
  const revenueCriterion: Criterion = {
    id: "recurring-revenue", label: "Recurring revenue is documented", status: revenueStatus, claimIds: ids(revenue),
    explanation: !revenue.length ? "No dated statement of recurring revenue with a defined USD monthly measure is available."
      : revenueStatus === "disputed" ? "Current recurring-revenue statements differ. Request a reconciled schedule before treating the amount as established."
      : `The source documents USD ${format(revenue[0].value)} in monthly recurring revenue at ${revenue[0].asOf}. ${revenue[0].value > 0 ? "The documentation criterion is met; the underlying revenue has not been independently verified." : "A zero balance does not substantiate positive recurring revenue."}`,
  };
  if (revenue.length) findings.push({
    id: "revenue-context", kind: "context", title: "Recurring revenue has source detail",
    detail: revenueCriterion.explanation, claimIds: ids(revenue),
  });

  const customers = customerCriterion(ordered, definition);
  const criteria = [customers, revenueCriterion];
  const allMet = criteria.every((criterion) => criterion.status === "met");
  const conflict = findings.find((finding) => finding.kind === "conflict" && finding.claimIds.some((id) => ordered.find((claim) => claim.id === id)?.metric === "paying_customers"));
  const conflictClaims = conflict ? ordered.filter((claim) => conflict.claimIds.includes(claim.id)) : [];
  const countDifference = conflictClaims.length ? Math.max(...conflictClaims.map((claim) => claim.value)) - Math.min(...conflictClaims.map((claim) => claim.value)) : 0;
  const retention = latest(ordered.filter((claim) => claim.metric === "retention"));
  const founderQuestions = [
    conflict ? { text: `Can you reconcile the ${format(countDifference)}-organization difference between the same-date paying-customer statements, with an account-level list and trial/pilot exclusions?`, claimIds: conflict.claimIds }
      : { text: "Can you provide the current paying-organization register, reporting date, and trial/pilot exclusions so we can check the 25-customer trigger?", claimIds: customers.claimIds },
    revenue.length ? { text: "Can you tie the reported monthly recurring revenue to active subscription contracts and clarify exclusions, cancellations, and one-time fees?", claimIds: ids(revenue) }
      : { text: "Can you provide a dated recurring-revenue schedule tied to active subscription contracts?", claimIds: [] },
    retention.length ? { text: `How was the reported ${retention.map((claim) => `${format(claim.value)}%`).join(" / ")} retention calculated: what are the cohort denominator, observation window, and treatment of contraction?`, claimIds: ids(retention) }
      : { text: "What retention evidence is available, including the cohort definition and observation window?", claimIds: [] },
  ];
  const assessment: Assessment = {
    headline: allMet ? "The documented revisit criteria are met" : customers.status === "disputed" ? `${findings.some((finding) => finding.kind === "change") ? "Traction has changed. " : ""}The customer trigger is still unresolved.` : "New context for the next review",
    summary: allMet ? "Current source statements meet both saved criteria. Review the supporting evidence and decide whether to arrange a meeting; source support does not independently verify business performance."
      : `${customers.explanation} ${revenueCriterion.explanation} Keep the investment decision with the reviewer.`,
    findings, criteria, founderQuestions,
  };
  validateAssessment(assessment, ordered);
  return assessment;
}

export function validateAssessment(assessment: Assessment, claims: Claim[]): void {
  const parsed = assessmentSchema.parse({ headline: assessment.headline, summary: assessment.summary, findings: assessment.findings, criteria: assessment.criteria, founderQuestions: assessment.founderQuestions });
  assertUnique(claims.map((claim) => claim.id), "claim ID");
  assertUnique(parsed.findings.map((finding) => finding.id), "finding ID");
  assertUnique(parsed.criteria.map((criterion) => criterion.id), "criterion ID");
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  for (const item of [...parsed.findings, ...parsed.criteria, ...parsed.founderQuestions]) {
    assertUnique(item.claimIds, "citation");
    for (const id of item.claimIds) if (!byId.has(id)) throw new Error(`Assessment references unknown claim ${id}.`);
  }
  for (const finding of parsed.findings) {
    const cited = finding.claimIds.map((id) => byId.get(id)!);
    if (finding.kind !== "unknown" && !cited.length) throw new Error("A material finding needs evidence.");
    if (finding.kind === "conflict" && !cited.some((a) => cited.some((b) => a.id !== b.id && comparable(a, b) && validDate(a.asOf) && a.asOf === b.asOf && a.value !== b.value))) throw new Error("Conflict citations are not comparable contradictory statements.");
    if (finding.kind === "change" && !cited.some((a) => cited.some((b) => a.id !== b.id && comparable(a, b) && validDate(a.asOf) && validDate(b.asOf) && a.asOf !== b.asOf && a.value !== b.value))) throw new Error("Change citations do not establish a historical change.");
  }
  for (const criterion of parsed.criteria) if (criterion.status !== "unknown" && !criterion.claimIds.length) throw new Error("A resolved or disputed criterion needs evidence.");
  if (/\b(?:trust|confidence|certainty|reliability)(?:\s+score)?\s*(?:of|is|:|=)?\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%\s*(?:trust|confiden|certain|reliable)/i.test(JSON.stringify(parsed))) throw new Error("Evidence support must not be presented as a trust percentage.");
}

export function extractRecorded(sources: Source[]): Claim[] {
  if (sources.length !== fixtureSources.length || new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error("Recorded analysis is available only for the unchanged fictional source pack. Use live mode for new or edited sources.");
  for (const source of sources) {
    const expected = fixtureSources.find((item) => item.id === source.id);
    if (!expected || (Object.keys(expected) as (keyof Source)[]).some((key) => source[key] !== expected[key])) throw new Error("Recorded analysis cannot process an unknown or modified source. Use live mode for this input.");
  }
  const claims = structuredClone(recordedClaims);
  validateClaims(claims, sources);
  return claims;
}

export function answerRecorded(question: string, snapshot: Snapshot): Answer {
  const intent = suggestedQuestions.findIndex((suggestion) => normalize(suggestion) === normalize(question));
  const unknown = (message: string): Answer => ({ paragraphs: [], unknowns: [message], mode: "recorded", retrievedSourceIds: [] });
  if (intent < 0) return unknown("This question is outside the recorded demo. Choose a suggested question or use live mode; no answer was inferred from unrelated fixture text.");
  validateAssessment(snapshot, snapshot.claims);
  const byId = new Map(snapshot.claims.map((claim) => [claim.id, claim]));
  if (snapshot.claims.some((claim) => !snapshot.sourceIds.includes(claim.sourceId))) throw new Error("Snapshot claims reference sources outside its frozen manifest.");
  let paragraphs: Answer["paragraphs"];
  const unknowns: string[] = [];
  if (intent === 0) {
    paragraphs = snapshot.findings.filter((finding) => finding.kind === "change" || finding.id === "revenue-context").map((finding) => ({ text: finding.detail, claimIds: finding.claimIds }));
    if (!paragraphs.length) return unknown("This snapshot does not contain comparable historical evidence to establish what changed.");
  } else if (intent === 1) {
    const criterion = snapshot.criteria.find((item) => item.id === "paying-customers");
    if (!criterion) return unknown("This snapshot does not evaluate the 25-customer trigger.");
    paragraphs = [{ text: criterion.explanation, claimIds: criterion.claimIds }];
    if (criterion.status === "unknown" || criterion.status === "disputed") unknowns.push("Whether the paying-customer trigger is satisfied remains unresolved.");
  } else if (intent === 2) {
    const relevant = snapshot.findings.filter((finding) => finding.kind === "conflict" && finding.claimIds.some((id) => byId.get(id)?.metric === "paying_customers") || finding.id === "teams-context");
    if (!relevant.length) return unknown("No customer-count disagreement is established by this snapshot.");
    paragraphs = relevant.map((finding) => ({ text: finding.detail, claimIds: finding.claimIds }));
    unknowns.push("The sources do not explain the cause of the disagreement. A billing cutoff, pilot classification, or reporting error would be a hypothesis, not an established explanation.");
  } else {
    paragraphs = snapshot.founderQuestions;
  }
  const retrievedSourceIds = [...new Set(paragraphs.flatMap((paragraph) => paragraph.claimIds.map((id) => byId.get(id)!.sourceId)))];
  return answerSchema.parse({ paragraphs, unknowns, mode: "recorded", retrievedSourceIds });
}
