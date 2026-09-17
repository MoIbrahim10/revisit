"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export default function Toast({ notice, onDismiss }: {
  notice: { text: string; error?: boolean } | null;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!notice) {
      setHovered(false);
      setFocused(false);
      return;
    }
    if (notice.error || hovered || focused) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [notice, hovered, focused, onDismiss]);
  return <div aria-live={notice?.error ? "assertive" : "polite"} aria-atomic="true">
    <AnimatePresence initial={false}>
      {notice && <motion.div key={notice.text} className={`toast ${notice.error ? "error" : ""}`} initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }} transition={{ duration: reducedMotion ? 0 : .18 }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
        {notice.error ? <CircleAlert size={19} /> : <CircleCheck size={19} />}
        <p>{notice.text}</p>
        <button className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}><X size={16} /></button>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
