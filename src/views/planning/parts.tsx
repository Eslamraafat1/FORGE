"use client";
import { useSyncExternalStore } from "react";
import type { ID, Priority, WorkOrderStatus } from "@/domain/types";
import { useT } from "@/i18n";
import { PRIORITY_TONE } from "@/components/ui/status";
import { cn, toneText } from "@/components/ui/primitives";
import { SERIES } from "@/components/charts/kit";
import { PRIORITY_RANK } from "./model";

/** Planner status palette. In-progress is green so orange stays reserved for selection / drag. */
export const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft: "var(--ink-3)",
  scheduled: "var(--info)",
  in_progress: "var(--ok)",
  paused: "var(--amber)",
  completed: "var(--c-muted)",
  cancelled: "var(--danger)",
};

/** Statuses that appear on the timeline, in legend order. */
export const TIMELINE_STATUSES: WorkOrderStatus[] = ["scheduled", "in_progress", "paused", "completed", "draft"];

export function productColor(productId: ID): string {
  const n = Number(productId.replace(/\D/g, "")) || 1;
  return SERIES[(n - 1) % SERIES.length];
}

/** Priority as a 4-step level meter (shape, not colour alone). Pair it with the label. */
export function PriorityMark({ priority, className }: { priority: Priority; className?: string }) {
  const rank = PRIORITY_RANK[priority];
  return (
    <svg aria-hidden viewBox="0 0 11 10" className={cn("h-2.5 w-[11px] shrink-0", toneText[PRIORITY_TONE[priority]], className)}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 3} y={7.5 - i * 2.5} width={2} height={2.5 + i * 2.5} fill="currentColor" opacity={i <= rank ? 1 : 0.22} />
      ))}
    </svg>
  );
}

export function PriorityLabel({ priority, className }: { priority: Priority; className?: string }) {
  const { td } = useT();
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <PriorityMark priority={priority} />
      <span>{td(`priority.${priority}`)}</span>
    </span>
  );
}

const MOBILE_QUERY = "(max-width: 767.98px)";
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True below the md breakpoint (agenda layout). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}
