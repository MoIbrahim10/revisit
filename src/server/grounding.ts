import { createHash } from "node:crypto";
import { answerSchema } from "../domain/schemas";
import type { Answer, Claim, Criterion, Finding, Source } from "../domain/types";

const number = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const metricPatterns: { metric: Claim["metric"]; unit: string; pattern: RegExp; definition: (quote: string) => string }[] = [
  {
    metric: "paying_customers",
    unit: "organizations",
    pattern: new RegExp(String.raw`\b(?:has|reports|reported|records|recorded|serves)\s+${number}\s+paying\s+(?:organizations|customers)\b`, "i"),
    definition: (quote) => quote.match(/\bpaying\s+(?:organizations|customers)(?:,\s*(?:excluding|including)[^.!?]*)?/i)?.[0] ?? "not specified",
  },
  {
    metric: "teams",
    unit: "teams",
    pattern: new RegExp(String.raw`\b${number}\s+teams\s+(?:use|using|adopted|are\s+using)\b`, "i"),
    definition: () => "not specified",
  },
  {
    metric: "mrr",
    unit: "USD/month",
    pattern: new RegExp(String.raw`(?:\bMRR\b|monthly\s+recurring(?:\s+software\s+subscription)?\s+revenue)[^.!?\n\d]{0,30}(?:is|was|of|:)\s*USD\s*${number}`, "i"),
    definition: (quote) => quote.match(/\b(?:contracted\s+)?monthly\s+recurring(?:\s+software\s+subscription)?\s+revenue(?:\s*\(MRR\))?/i)?.[0] ?? "MRR",
  },
  {
    metric: "retention",
    unit: "%",
    pattern: new RegExp(String.raw`\bretention\b[^.!?\n%]{0,120}?(?:is|was|of|:)\s*${number}\s*%`, "i"),
    definition: (quote) => quote.match(/\b(?:gross|net)?\s*revenue\s+retention(?:\s+for\s+the\s+[^,.!?]+)?/i)?.[0] ?? "retention",
  },
];

function lines(source: Source): { quote: string; start: number }[] {
  const result: { quote: string; start: number }[] = [];
  for (const match of source.body.matchAll(/[^\n]+/g)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const quote = raw.trim();
    if (quote) result.push({ quote, start: (match.index ?? 0) + leading });
  }
  return result;
}

function valueFrom(match: RegExpMatchArray): number {
  const captured = [...match].slice(1).find((part) => part !== undefined && /^\d[\d,]*(?:\.\d+)?$/.test(part));
  return Number(captured!.replaceAll(",", ""));
}

/** High-precision extraction for the product's deliberately bounded metric vocabulary. */
export function extractGroundedClaims(sources: Source[]): Claim[] {
  const claims: Claim[] = [];
  for (const source of sources) {
    for (const { quote, start } of lines(source)) {
      for (const entry of metricPatterns) {
        const match = quote.match(entry.pattern);
        if (!match) continue;
        const value = valueFrom(match);
        const definition = entry.definition(quote);
        const id = `claim-${createHash("sha256").update(JSON.stringify([source.id, entry.metric, value, definition, start])).digest("hex").slice(0, 24)}`;
        claims.push({ id, sourceId: source.id, quote, value, metric: entry.metric, unit: entry.unit, definition, asOf: source.effectiveDate, start, end: start + quote.length });
      }
    }
  }
  return claims;
}

export function evidenceSignature(claims: Pick<Claim, "sourceId" | "metric" | "value">[]): string[] {
  return claims.map(({ sourceId, metric, value }) => `${sourceId}|${metric}|${value}`).sort();
}

export function requestedMetrics(question: string): Set<Claim["metric"]> {
  const normalized = question.toLowerCase();
  const metrics = new Set<Claim["metric"]>();
  if (/customer|paying|organization|count|trigger|traction|changed/.test(normalized)) metrics.add("paying_customers");
  if (/revenue|mrr|subscription/.test(normalized)) metrics.add("mrr");
  if (/retention|churn/.test(normalized)) metrics.add("retention");
  if (/\bteam|user reach|adoption/.test(normalized)) metrics.add("teams");
  return metrics;
}

function uniqueParagraphs(items: Answer["paragraphs"]): Answer["paragraphs"] {
  return [...new Map(items.map((item) => [`${item.text}|${item.claimIds.join(",")}`, item])).values()];
}

export function renderGroundedAnswer(input: {
  question: string;
  claims: Claim[];
  findings: Finding[];
  criteria: Criterion[];
  retrievedSourceIds: string[];
  founderQuestions: Answer["paragraphs"];
}): Answer {
  const normalized = input.question.toLowerCase();
  const metrics = requestedMetrics(input.question);
  const claimById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const paragraphs: Answer["paragraphs"] = [];
  const unknowns: string[] = [];
  const addFinding = (finding: Finding | undefined) => {
    if (finding && finding.claimIds.every((id) => claimById.has(id))) paragraphs.push({ text: finding.detail, claimIds: finding.claimIds });
  };

  if (/founder|what should i ask|next conversation/.test(normalized)) {
    paragraphs.push(...input.founderQuestions.filter((item) => item.claimIds.every((id) => claimById.has(id))));
  }
  if (metrics.has("paying_customers")) {
    if (/changed|since|earlier|previous|last review/.test(normalized)) addFinding(input.findings.find((finding) => finding.kind === "change"));
    const conflict = input.findings.find((finding) => finding.kind === "conflict" && finding.claimIds.some((id) => claimById.get(id)?.metric === "paying_customers"));
    if (conflict) addFinding(conflict);
    else {
      const criterion = input.criteria.find((item) => item.id === "paying-customers" && item.claimIds.every((id) => claimById.has(id)));
      if (criterion?.claimIds.length) paragraphs.push({ text: criterion.explanation, claimIds: criterion.claimIds });
    }
    if (/why|reconcil|disagree|differ/.test(normalized)) unknowns.push("The supplied evidence does not establish why the source statements differ; an account-level reconciliation is still needed.");
  }
  if (metrics.has("mrr")) addFinding(input.findings.find((finding) => finding.id === "revenue-context"));
  if (metrics.has("teams")) addFinding(input.findings.find((finding) => finding.id === "teams-context"));
  if (metrics.has("retention")) {
    for (const claim of input.claims.filter((item) => item.metric === "retention")) {
      paragraphs.push({ text: `The source reports ${claim.value}% retention at ${claim.asOf}.`, claimIds: [claim.id] });
    }
  }
  if (/cash|runway|burn|bank balance/.test(normalized)) unknowns.push("The supplied evidence does not establish cash balance, burn, or runway.");
  if (!paragraphs.length && !unknowns.length) unknowns.push("The supplied evidence does not establish an answer to this question.");
  if (!paragraphs.length && metrics.size) unknowns.push("The requested metric is not established by the supplied evidence.");

  return answerSchema.parse({ paragraphs: uniqueParagraphs(paragraphs), unknowns: [...new Set(unknowns)], mode: "live", retrievedSourceIds: input.retrievedSourceIds });
}

export function answerCoversQuestion(answer: Answer, question: string, claims: Claim[]): boolean {
  const required = requestedMetrics(question);
  const asksUnsupportedFinance = /cash|runway|burn|bank balance/i.test(question);
  const cited = new Set(answer.paragraphs.flatMap((paragraph) => paragraph.claimIds));
  for (const metric of required) {
    const available = claims.filter((claim) => claim.metric === metric);
    if (available.length && !available.some((claim) => cited.has(claim.id))) return false;
  }
  if (asksUnsupportedFinance && !answer.unknowns.some((unknown) => /cash|runway|burn|bank balance/i.test(unknown))) return false;
  if (asksUnsupportedFinance && required.size === 0 && answer.paragraphs.length) return false;
  return true;
}
