import type { Answer, Claim } from "@/domain/types";
import type { views } from "./workspace-content";

export type WorkspaceView = (typeof views)[number];

export interface WorkspaceNotice {
  text: string;
  error?: boolean;
}

export interface EvidenceSelection {
  sourceIds: string[];
  claimIds: string[];
  claims: Claim[];
}

export interface QuestionState {
  question: string;
  askedQuestion: string;
  answer: Answer | null;
  asking: boolean;
  answerError: string | null;
  answerSnapshot: string | null;
}
