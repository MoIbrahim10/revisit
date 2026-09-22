"use client";

import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, Info, LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import type { Snapshot } from "@/domain/types";
import { EvidenceLink } from "./review-controls";
import { questions } from "./workspace-content";
import type { QuestionState } from "./workspace-types";

export default function QuestionsView({ snapshot, state, runControl, onQuestionChange, onAsk, onOpenClaims }: {
  snapshot: Snapshot | null;
  state: QuestionState;
  runControl: ReactNode;
  onQuestionChange: (question: string) => void;
  onAsk: (question: string) => void;
  onOpenClaims: (ids: string[]) => void;
}) {
  const { question, askedQuestion, answer, asking, answerError, answerSnapshot } = state;
  if (!snapshot) return <section className="panel empty-state">
    <MessageSquareText size={28} />
    <h2>Review the sources first</h2>
    <p>Complete a review to ask questions about its evidence.</p>
    {runControl}
  </section>;
  return <>
    <div className="view-heading">
      <div>
        <h2>Ask the evidence</h2>
        <p>{snapshot?.mode === "live" ? "Answers use only the sources in this review." : "Explore four prepared questions, each with source citations."}</p>
      </div>
      <span className="pill neutral">{snapshot?.mode === "live" ? "Live analysis" : "Demo questions"}</span>
    </div>
    <div className="question-layout">
      <div className="question-list">{questions.map((item, index) => <button key={item.text} className={askedQuestion === item.text ? "selected" : ""} onClick={() => onAsk(item.text)} disabled={asking || !snapshot}>
          <span className="question-index">0{index + 1}</span>
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <ArrowRight size={16} />
        </button>)}</div>
      <section className="panel answer-panel" aria-live="polite" aria-busy={asking}>
        {!askedQuestion ? <div className="empty-state">
          <MessageSquareText size={28} />
          <h3>Start with a question</h3>
          <p>Choose a topic to see a concise answer and the evidence behind it.</p>
        </div> : <>
          <span className="eyebrow">YOUR QUESTION</span>
          <h3>{askedQuestion}</h3>
          {asking && <div className="answer-loading"><LoaderCircle size={19} className="spin" />Reading the evidence…</div>}
          {answerError && <div className="inline-error" role="alert">
            <CircleAlert size={17} />
            <p>{answerError}</p>
            <button className="text-button" onClick={() => onAsk(askedQuestion)}>Try again</button>
          </div>}
          {answer && <div className="answer-content">
            {answerSnapshot !== snapshot?.id && <div className="snapshot-warning">A newer review is available. <button className="text-button" onClick={() => onAsk(askedQuestion)}>Update this answer</button></div>}
            {answer.paragraphs.map((paragraph, index) => <div className="answer-paragraph" key={index}>
              <p>{paragraph.text}</p>
              {answerSnapshot === snapshot?.id && <EvidenceLink claimIds={paragraph.claimIds} onOpen={onOpenClaims} label="Supporting passages" />}
            </div>)}
            {answer.unknowns.length > 0 && <div className="answer-unknowns">
              <h4>Still to clarify</h4>
              <ul>{answer.unknowns.map(item => <li key={item}>{item}</li>)}</ul>
            </div>}
            <div className="answer-provenance"><ShieldCheck size={14} />{answer.retrievedSourceIds.length} supporting sources · {answer.mode === "recorded" ? "Prepared demo response" : "Live response"}</div>
          </div>}
        </>}
        {snapshot?.mode === "live" && <form className="question-form" onSubmit={event => {
          event.preventDefault();
          void onAsk(question);
        }}>
          <label htmlFor="custom-question">Your question</label>
          <div>
            <input id="custom-question" placeholder="Ask about this company’s evidence…" value={question} onChange={event => onQuestionChange(event.target.value)} disabled={asking} minLength={5} maxLength={1000} required />
            <button className="button primary" aria-label="Ask question" disabled={asking || question.trim().length < 5}><ArrowRight size={17} /></button>
          </div>
        </form>}
      </section>
    </div>
    {snapshot?.mode !== "live" && <p className="section-note"><Info size={15} />Free-form questions are available after a live review. These prepared questions work without an API key.</p>}
  </>;
}
