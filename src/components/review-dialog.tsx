"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, CheckCheck, CircleAlert, Layers3, LoaderCircle } from "lucide-react";
import type { Decision, DecisionAction } from "@/domain/types";
import Dialog from "./dialog";
import { request } from "./workspace-api";
import { actions } from "./workspace-content";

export default function ReviewDialog({
  snapshotId,
  stale,
  onClose,
  onSave
}: {
  snapshotId: string;
  stale: boolean;
  onClose: () => void;
  onSave: (decision: Decision) => Promise<void>;
}) {
  const [action, setAction] = useState<DecisionAction>("clarify");
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const decision = await request<Decision>("/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          snapshotId,
          action,
          rationale: rationale.trim(),
          idempotencyKey: key.current
        })
      });
      await onSave(decision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return <Dialog title="Record your decision" eyebrow="NEXT STEP" onClose={onClose}>
    <form onSubmit={submit} className="review-form">
      <p className="dialog-description">Save a next step and the reason for it. This review keeps its original evidence.</p>
      {stale && <p className="snapshot-warning">A newer snapshot is available. This decision will remain attached to the snapshot you opened.</p>}
      <fieldset className="decision-options">
        <legend className="field-label">Choose the next step</legend>
        {(Object.entries(actions) as [DecisionAction, typeof actions[DecisionAction]][]).map(([value, item]) => <label key={value} className={action === value ? "selected" : ""}>
          <input type="radio" name="decision" value={value} checked={action === value} onChange={() => setAction(value)} />
          <span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
          {action === value && <Check size={16} />}
        </label>)}
      </fieldset>
      <label className="form-field">
        <span className="field-label">Rationale</span>
        <textarea required minLength={10} maxLength={2000} rows={4} placeholder="What matters, what remains open, and what should happen next?" value={rationale} onChange={event => setRationale(event.target.value)} />
      </label>
      <div className="form-context">
        <Layers3 size={14} />Evidence snapshot {snapshotId.slice(0, 8)}<span>Immutable once saved</span>
      </div>
      {error && <div className="inline-error" role="alert">
        <CircleAlert size={16} />
        <p>{error}</p>
      </div>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button primary" disabled={saving || rationale.trim().length < 10}>
          {saving ? <LoaderCircle className="spin" size={15} /> : <CheckCheck size={15} />}
          {saving ? "Saving decision…" : "Save decision"}
        </button>
      </div>
    </form>
  </Dialog>;
}
