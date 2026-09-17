export type Mode = "recorded" | "live";
export type SourceKind = "note" | "deck" | "financial" | "website";
export interface Source {
  id: string;
  companyId: string;
  title: string;
  kind: SourceKind;
  body: string;
  effectiveDate: string;
  capturedAt: string;
  publisherGroup: string;
  locator: string;
  contentHash: string;
}
export interface Company {
  id: string;
  name: string;
  domain: string;
  description: string;
  sector: string;
  stage: string;
  location: string;
}
export interface Baseline {
  date: string;
  action: string;
  rationale: string;
  trigger: string;
  payingCustomers: number;
  sourceId: string;
}
export interface Claim {
  id: string;
  sourceId: string;
  metric: "paying_customers" | "teams" | "mrr" | "retention";
  value: number;
  unit: string;
  asOf: string;
  definition: string;
  quote: string;
  start: number;
  end: number;
}
export interface Finding {
  id: string;
  kind: "change" | "conflict" | "context" | "unknown";
  title: string;
  detail: string;
  claimIds: string[];
}
export interface Criterion {
  id: string;
  label: string;
  status: "met" | "unmet" | "disputed" | "unknown";
  explanation: string;
  claimIds: string[];
}
export interface CitedText {
  text: string;
  claimIds: string[];
}
export interface Assessment {
  headline: string;
  summary: string;
  findings: Finding[];
  criteria: Criterion[];
  founderQuestions: CitedText[];
}
export interface Snapshot extends Assessment {
  id: string;
  companyId: string;
  runId: string;
  createdAt: string;
  mode: Mode;
  claims: Claim[];
  sourceIds: string[];
}
export const STAGES = ["ingest", "extract", "reconcile", "assess", "verify", "publish"] as const;
export type Stage = (typeof STAGES)[number];
export interface StageExecution {
  stage: Stage;
  attempt: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  durationMs: number | null;
  error: string | null;
  model: string | null;
  tokens: number | null;
}
export interface Run {
  id: string;
  status: "queued" | "running" | "retrying" | "completed" | "failed";
  mode: Mode;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  executions: StageExecution[];
  recoveryTest: boolean;
}
export type DecisionAction = "track" | "clarify" | "meeting";
export interface Decision {
  id: string;
  snapshotId: string;
  action: DecisionAction;
  rationale: string;
  createdAt: string;
}
export interface Answer {
  paragraphs: CitedText[];
  unknowns: string[];
  mode: Mode;
  retrievedSourceIds: string[];
}
export interface WorkspaceData {
  company: Company;
  baseline: Baseline;
  sources: Source[];
  snapshot: Snapshot | null;
  runs: Run[];
  decisions: Decision[];
  liveAvailable: boolean;
}
