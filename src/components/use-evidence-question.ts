"use client";

import { useState } from "react";
import type { Answer, Snapshot } from "@/domain/types";
import { request } from "./workspace-api";
import type { QuestionState } from "./workspace-types";

export function useEvidenceQuestion(snapshot: Snapshot | null) {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answerSnapshot, setAnswerSnapshot] = useState<string | null>(null);

  async function ask(text: string) {
    if (!snapshot || text.trim().length < 5 || asking) return;
    const snapshotId = snapshot.id;
    setAskedQuestion(text.trim());
    setAnswer(null);
    setAnswerError(null);
    setAsking(true);
    setAnswerSnapshot(snapshotId);
    try {
      setAnswer(await request<Answer>("/api/questions", {
        method: "POST",
        body: JSON.stringify({ question: text.trim(), snapshotId }),
      }));
      setQuestion("");
    } catch (error) {
      setAnswerError(error instanceof Error ? error.message : "This question could not be answered.");
    } finally {
      setAsking(false);
    }
  }

  const state: QuestionState = { question, askedQuestion, answer, asking, answerError, answerSnapshot };
  return { state, setQuestion, ask };
}
