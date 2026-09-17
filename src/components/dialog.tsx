"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAnimate, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  drawer = false
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
}) {
  const [ref, animate] = useAnimate<HTMLDialogElement>();
  const reducedMotion = useReducedMotion();
  const closing = useRef(false);
  const mounted = useRef(false);
  async function dismiss(pointer: boolean) {
    if (closing.current) return;
    closing.current = true;
    if (pointer && !reducedMotion) {
      await animate(ref.current, { opacity: 0, transform: drawer ? "translateX(16px)" : "translateY(8px)" }, { duration: .12, ease: "easeOut" });
    }
    if (mounted.current) onClose();
  }
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    mounted.current = true;
    const keyboard = previousFocus?.matches(":focus-visible");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !keyboard) {
      void animate(dialog, { opacity: [0, 1], transform: [drawer ? "translateX(24px)" : "translateY(12px)", "translate(0px, 0px)"] }, { duration: .22, ease: [.23, 1, .32, 1] });
    }
    return () => {
      mounted.current = false;
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return <dialog ref={ref} className={drawer ? "dialog source-drawer" : "dialog"} aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault();
    onClose();
  }} onClick={event => {
    if (event.target === event.currentTarget) void dismiss(event.detail > 0);
  }}>
    <div className="dialog-inner">
      <header className="dialog-header">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="dialog-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={event => { void dismiss(event.detail > 0); }} aria-label="Close dialog" autoFocus>
          <X size={19} />
        </button>
      </header>
      {children}
    </div>
  </dialog>;
}
