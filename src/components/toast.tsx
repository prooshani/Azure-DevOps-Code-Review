"use client";

import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";

export type ToastKind = "success" | "error" | "info";
export type ToastItem = { id: string; kind: ToastKind; title: string; body?: string };

const DURATION_MS = 6500;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function push(t: Omit<ToastItem, "id">) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), DURATION_MS + 300);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  return {
    toasts,
    success: (title: string, body?: string) => push({ kind: "success", title, body }),
    error:   (title: string, body?: string) => push({ kind: "error",   title, body }),
    info:    (title: string, body?: string) => push({ kind: "info",    title, body }),
    dismiss,
  };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / DURATION_MS) * 100);
      setProgress(pct);
      if (pct <= 0) clearInterval(tick);
    }, 40);

    const fadeTimer = setTimeout(() => setClosing(true), DURATION_MS - 300);
    return () => { clearInterval(tick); clearTimeout(fadeTimer); };
  }, []);

  const Icon = toast.kind === "success" ? IconCheck : toast.kind === "error" ? IconAlert : IconInfo;

  return (
    <div className={`toast toast-v2 ${toast.kind} ${closing ? "toast-closing" : ""}`}>
      <div className="toast-v2-accent" />
      <div className="toast-v2-icon-wrap">
        <Icon width={18} height={18} />
      </div>
      <div className="toast-v2-body">
        <strong className="toast-v2-title">{toast.title}</strong>
        {toast.body ? <span className="toast-v2-msg">{toast.body}</span> : null}
      </div>
      <button className="toast-v2-close" onClick={onDismiss} aria-label="Dismiss">
        <IconX width={13} height={13} />
      </button>
      <div
        className="toast-v2-progress"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
