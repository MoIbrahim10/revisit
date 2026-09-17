import { createHash } from "node:crypto";
import type { Baseline, Claim, Company, Source } from "../domain/types";

export const company: Company = {
  id: "18aca7d2-b760-4c91-9d35-4e1084d91701",
  name: "Lattice Harbor",
  domain: "latticeharbor.example",
  description: "Procurement software that helps mid-market finance teams manage purchasing and supplier approvals.",
  sector: "B2B software · Procurement",
  stage: "Seed",
  location: "Austin, Texas",
};

const noteId = "18aca7d2-b760-4c91-9d35-4e1084d91711";
const deckId = "18aca7d2-b760-4c91-9d35-4e1084d91712";
const financeId = "18aca7d2-b760-4c91-9d35-4e1084d91713";
const websiteId = "18aca7d2-b760-4c91-9d35-4e1084d91714";

export const baseline: Baseline = {
  date: "2026-05-12",
  action: "Track",
  rationale: "Promising procurement workflow, but commercial traction is early and recurring revenue needs supporting detail.",
  trigger: "Revisit at 25 paying organizations, excluding trials and pilots, and when recurring revenue is documented.",
  payingCustomers: 12,
  sourceId: noteId,
};

const priorQuote = "As of 2026-04-30, Lattice Harbor has 12 paying organizations, excluding trials and pilots.";
const deckQuote = "As of 2026-06-30, Lattice Harbor has 30 paying organizations, excluding trials and pilots.";
const financeQuote = "As of 2026-06-30, Lattice Harbor has 24 paying organizations, excluding trials and pilots.";
const revenueQuote = "As of 2026-06-30, contracted monthly recurring software subscription revenue (MRR) is USD 50,000.";
const retentionQuote = "As of 2026-06-30, gross revenue retention for the January 2026 customer cohort is 92%.";
const websiteQuote = "As of 2026-06-30, 60 teams use Lattice Harbor to simplify procurement.";

function source(input: Omit<Source, "companyId" | "contentHash">): Source {
  return {
    ...input,
    companyId: company.id,
    contentHash: createHash("sha256").update(input.body).digest("hex"),
  };
}

export const sources: Source[] = [
  source({
    id: noteId,
    title: "Earlier investment review",
    kind: "note",
    effectiveDate: "2026-04-30",
    capturedAt: "2026-05-12T14:30:00.000Z",
    publisherGroup: "Fictional fund · internal analyst",
    locator: "Review note · Commercial traction",
    body: `FICTIONAL DEMO MATERIAL — no real company or fund data.\n\nInvestment review written 12 May 2026\nCompany: Lattice Harbor\nDecision: Track\n\n${priorQuote}\nThe founder supplied this count during our initial conversation; we have not verified it independently.\n\n${baseline.rationale}\n${baseline.trigger}\nPreserve this reason for the next review.`,
  }),
  source({
    id: deckId,
    title: "Founder update · June deck",
    kind: "deck",
    effectiveDate: "2026-06-30",
    capturedAt: "2026-07-02T09:15:00.000Z",
    publisherGroup: "Lattice Harbor · company-authored",
    locator: "Deck excerpt · Slide 7, Traction",
    body: `FICTIONAL DEMO MATERIAL — prepared for this application project.\n\nLattice Harbor — Founder update\nReporting date: 2026-06-30\nSlide 7: Commercial traction\n\n${deckQuote}\nOur procurement workspace helps finance teams organize purchase requests, approvals, and supplier records.\n\nPrepared by the founding team. This deck is not an independent audit.`,
  }),
  source({
    id: financeId,
    title: "Finance extract · June close",
    kind: "financial",
    effectiveDate: "2026-06-30",
    capturedAt: "2026-07-02T10:00:00.000Z",
    publisherGroup: "Lattice Harbor · company-authored",
    locator: "Finance extract · Revenue and customer summary",
    body: `FICTIONAL DEMO MATERIAL — synthetic finance records.\n\nLattice Harbor — June close extract\nReporting date: 2026-06-30\n\n${financeQuote}\n${revenueQuote}\nRevenue excludes one-time implementation fees and services.\n${retentionQuote}\nThe extract does not provide the full cohort calculation or account-level customer reconciliation.\n\nPrepared by the founding team's finance lead. Unaudited; company-authored, like the deck.`,
  }),
  source({
    id: websiteId,
    title: "Website copy · captured July 2",
    kind: "website",
    effectiveDate: "2026-06-30",
    capturedAt: "2026-07-02T11:45:00.000Z",
    publisherGroup: "Lattice Harbor · company-authored",
    locator: "Fictional homepage · Customer headline",
    body: `FICTIONAL DEMO MATERIAL — no website was crawled.\n\nLattice Harbor — procurement, together\n\n${websiteQuote}\nBring purchase requests, supplier records, and finance approvals into one shared workspace.\n\nThe website does not define a team or state whether teams are paying organizations, trials, pilots, or departments.`,
  }),
];

function claim(id: string, sourceId: string, quote: string, value: number, metric: Claim["metric"], unit: string, definition: string): Claim {
  const input = sources.find((item) => item.id === sourceId)!;
  const start = input.body.indexOf(quote);
  if (start < 0) throw new Error("Recorded fixture quote is missing from its source.");
  return { id, sourceId, quote, value, metric, unit, definition, asOf: input.effectiveDate, start, end: start + quote.length };
}

export const recordedClaims: Claim[] = [
  claim("18aca7d2-b760-4c91-9d35-4e1084d91721", noteId, priorQuote, 12, "paying_customers", "organizations", "paying organizations, excluding trials and pilots"),
  claim("18aca7d2-b760-4c91-9d35-4e1084d91722", deckId, deckQuote, 30, "paying_customers", "organizations", "paying organizations, excluding trials and pilots"),
  claim("18aca7d2-b760-4c91-9d35-4e1084d91723", financeId, financeQuote, 24, "paying_customers", "organizations", "paying organizations, excluding trials and pilots"),
  claim("18aca7d2-b760-4c91-9d35-4e1084d91724", financeId, revenueQuote, 50000, "mrr", "USD/month", "contracted monthly recurring software subscription revenue"),
  claim("18aca7d2-b760-4c91-9d35-4e1084d91725", financeId, retentionQuote, 92, "retention", "%", "gross revenue retention for the January 2026 customer cohort"),
  claim("18aca7d2-b760-4c91-9d35-4e1084d91726", websiteId, websiteQuote, 60, "teams", "teams", "not specified"),
];

export const suggestedQuestions = [
  "What changed since our last review?",
  "Have they met our 25-customer trigger?",
  "Why do the customer numbers disagree?",
  "What should I ask the founders?",
];
