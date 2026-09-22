import type { DecisionAction, Run } from "@/domain/types";

export const questions = [{
  label: "What changed?",
  text: "What changed since our last review?",
  detail: "Compare the earlier review with today’s evidence."
}, {
  label: "Is the trigger met?",
  text: "Have they met our 25-customer trigger?",
  detail: "Check the customer threshold."
}, {
  label: "Why do the counts differ?",
  text: "Why do the customer numbers disagree?",
  detail: "Inspect the conflicting claims."
}, {
  label: "What should I ask?",
  text: "What should I ask the founders?",
  detail: "Prepare for the founder conversation."
}];
export const views = ["Review", "Sources", "Questions", "Decisions", "Activity"] as const;
export const actions: Record<DecisionAction, {
  label: string;
  description: string;
  past: string;
}> = {
  track: {
    label: "Continue tracking",
    description: "Keep the company on the watchlist.",
    past: "Continue tracking"
  },
  clarify: {
    label: "Request clarification",
    description: "Resolve the open questions first.",
    past: "Clarification needed"
  },
  meeting: {
    label: "Proceed to meeting",
    description: "Take the next conversation with this context.",
    past: "Proceed to meeting"
  }
};
export const stageLabels = {
  ingest: "Preserve sources",
  extract: "Extract claims",
  reconcile: "Compare evidence",
  assess: "Check criteria",
  verify: "Verify citations",
  publish: "Save review"
};
export const busyStatuses = new Set<Run["status"]>(["queued", "running", "retrying"]);
export const statusLabels = {
  met: "Supported",
  unmet: "Not met",
  disputed: "Unresolved",
  unknown: "Unknown"
};
