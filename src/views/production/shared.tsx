"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LineStatus, Machine, Priority, WorkOrder, WorkOrderStatus } from "@/domain/types";
import { woIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { MACHINE_TONE } from "@/components/ui/status";
import { Tooltip, cn, toneBg, toneText, type Tone } from "@/components/ui/primitives";

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
export const LINE_STATUSES: LineStatus[] = ["running", "idle", "changeover", "maintenance", "stopped"];
export const WO_STATUSES: WorkOrderStatus[] = ["draft", "scheduled", "in_progress", "paused", "completed", "cancelled"];
export const WO_STATUS_RANK: Record<WorkOrderStatus, number> = { in_progress: 0, paused: 1, scheduled: 2, draft: 3, completed: 4, cancelled: 5 };

/** State colour for an OEE-like ratio (demo thresholds). */
export function oeeTone(v: number): Tone {
  return v >= 0.8 ? "ok" : v >= 0.65 ? "warn" : "danger";
}

/** State colour for output versus the plan-by-now. */
export function attainmentTone(a: number): Tone {
  return a >= 0.97 ? "ok" : a >= 0.9 ? "warn" : "danger";
}

/** An open order whose due time has passed on the simulated clock. */
export function woIsLate(wo: WorkOrder, now: number): boolean {
  return woIsOpen(wo) && wo.dueDate < now;
}

/** A completed order that finished after its due time. */
export function woFinishedLate(wo: WorkOrder): boolean {
  return wo.status === "completed" && (wo.completedAt ?? 0) > wo.dueDate;
}

/** Section heading used above tables and blocks that are not Panels. */
export function SectionTitle({ title, hint, actions, className }: { title: string; hint?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Inline figure: micro-label over a tabular number. */
export function Figure({ label, value, unit, hint, tone, className }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("num text-[17px] font-semibold leading-none", tone ? toneText[tone] : "text-ink")}>{value}</span>
        {unit && <span className="text-[11.5px] text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

/** The machines of a line in station order as linked status marks. */
export function MachineDots({ machines }: { machines: Machine[] }) {
  const { td } = useT();
  return (
    <span className="inline-flex items-center gap-1">
      {machines.map((m) => {
        const label = `${m.id} · ${td(`mstatus.${m.status}`)}`;
        return (
          <Tooltip key={m.id} label={label} side="top">
            <Link
              href={`/equipment/${m.id}`}
              aria-label={label}
              className="flex size-[18px] items-center justify-center rounded-sm border border-line-2 bg-canvas hover:border-ink-3"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2",
                  toneBg[MACHINE_TONE[m.status]],
                  // Shape doubles the colour: running = square, anything else = distinct mark.
                  m.status === "running" ? "rounded-[1px]" : m.status === "idle" ? "rounded-[1px] opacity-45" : "rounded-full",
                )}
              />
            </Link>
          </Tooltip>
        );
      })}
    </span>
  );
}
