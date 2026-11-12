"use client";
import { AnimatePresence, motion } from "motion/react";
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { Msg } from "@/domain/types";
import { useT } from "@/i18n";
import type { Result } from "@/store/store";
import { cn } from "./primitives";

type ToastTone = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: number): void;
}

let counter = 0;
const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++counter;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), t.tone === "error" ? 6500 : 3800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export function toast(tone: ToastTone, title: string, body?: string) {
  useToasts.getState().push({ tone, title, body });
}

/**
 * Run a store action and report the outcome. Returns true on success.
 *   const run = useAction();
 *   if (run(store.completeX(id), t("x.completed"))) close();
 */
export function useAction() {
  const { tm } = useT();
  return (result: Result, successTitle?: string, successBody?: string): boolean => {
    if (result.ok) {
      if (successTitle) toast("success", successTitle, successBody);
      return true;
    }
    toast("error", tm(result.error as Msg));
    return false;
  };
}

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const tones: Record<ToastTone, string> = {
  success: "text-ok",
  error: "text-danger",
  info: "text-info",
  warning: "text-amber",
};
const bars: Record<ToastTone, string> = { success: "bg-ok", error: "bg-danger", info: "bg-info", warning: "bg-amber" };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const { t } = useT();
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((x) => {
          const Icon = icons[x.tone];
          return (
            <motion.div
              key={x.id}
              layout
              role={x.tone === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              className="pointer-events-auto relative flex w-full max-w-sm items-start gap-2.5 overflow-hidden rounded-md border border-line-2 bg-raised py-2.5 pe-2 ps-4 shadow-pop"
            >
              <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", bars[x.tone])} />
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tones[x.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{x.title}</p>
                {x.body && <p className="mt-0.5 text-[12px] text-ink-2">{x.body}</p>}
              </div>
              <button type="button" onClick={() => dismiss(x.id)} aria-label={t("common.close")} className="rounded-sm p-1 text-ink-3 hover:bg-panel hover:text-ink">
                <X aria-hidden className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
