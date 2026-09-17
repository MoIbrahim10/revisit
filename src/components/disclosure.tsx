"use client";

import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";

export default function Disclosure({ title, detail, className, children }: {
  title: ReactNode;
  detail?: string;
  className: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion || keyboard ? 0 : .2;
  return <section className={className} data-open={open}>
    <button className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={event => {
      setKeyboard(event.detail === 0);
      setOpen(value => !value);
    }}>
      <span>{title}</span>
      <span>{detail}<ChevronRight size={detail ? 16 : 13} /></span>
    </button>
    <motion.div id={id} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration, ease: [.23, 1, .32, 1] }} inert={!open} aria-hidden={!open} style={{ overflow: "hidden" }}>
      {children}
    </motion.div>
  </section>;
}
