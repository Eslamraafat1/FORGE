"use client";
/**
 * Shared pieces of the Equipment + Maintenance area: service-date maths, the
 * demo health score, and a few small components used by more than one view.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ExternalLink, MoreHorizontal, Wrench } from "lucide-react";
import type { DowntimeEvent, Machine, MachineStatus, MaintenanceOrder } from "@/domain/types";
import { PM_INTERVAL_DAYS, maintenanceIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, HOUR, startOfDay } from "@/lib/time";
import { useForge } from "@/store/store";
import { Badge, Button, IconButton, Progress, cn, type Tone } from "@/components/ui/primitives";
import { ConfirmDialog, Menu, type MenuItem } from "@/components/ui/overlay";
import { useCan } from "@/components/ui/page";
import { useAction } from "@/components/ui/toast";

export const MACHINE_STATUSES: MachineStatus[] = ["running", "idle", "warning", "maintenance", "offline"];

/* ------------------------------------------------------------------ */
/* Service dates                                                       */
/* ------------------------------------------------------------------ */

/** Whole calendar days from the simulated today to a service date (negative = overdue). */
export function serviceDays(date: number, now: number): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY);
}

export const DUE_SOON_DAYS = 14;
export type ServiceState = "overdue" | "soon" | "ok";

export function serviceState(machine: Pick<Machine, "nextMaintenance">, now: number): ServiceState {
  const d = serviceDays(machine.nextMaintenance, now);
  return d < 0 ? "overdue" : d <= DUE_SOON_DAYS ? "soon" : "ok";
}

export const SERVICE_TONE: Record<ServiceState, Tone> = { overdue: "danger", soon: "warn", ok: "ok" };

/**
 * A maintenance order is overdue when it is still open and either has not
 * started by its scheduled time, or is running past its planned finish.
 */
export function orderIsOverdue(o: MaintenanceOrder, now: number): boolean {
  if (!maintenanceIsOpen(o.status)) return false;
  return o.status === "in_progress" ? o.scheduledDate + o.estimatedHours * HOUR < now : o.scheduledDate < now;
}

/* ------------------------------------------------------------------ */
/* Predictive maintenance indicator (demo calculation)                 */
/* ------------------------------------------------------------------ */

export const HEALTH = {
  /** Points lost when a full service interval has elapsed. */
  serviceWeight: 30,
  serviceCap: 45,
  /** One point is lost for every N minutes of downtime in the window. */
  downtimeMinPerPoint: 20,
  downtimeCap: 35,
  windowDays: 30,
  statusPenalty: { running: 0, idle: 0, warning: 15, maintenance: 10, offline: 20 } satisfies Record<MachineStatus, number>,
  watchBelow: 75,
  serviceBelow: 50,
} as const;

export type HealthBand = "good" | "watch" | "service";

export interface Health {
  score: number;
  band: HealthBand;
  daysSinceService: number;
  servicePenalty: number;
  downtimeMin: number;
  downtimeEvents: number;
  downtimePenalty: number;
  statusPenalty: number;
}

export const HEALTH_TONE: Record<HealthBand, Tone> = { good: "ok", watch: "warn", service: "danger" };

/**
 * Deterministic, rule-based health score (0–100). This is a transparent demo
 * formula — not a trained model and not a prediction:
 *   score = 100 − service penalty − downtime penalty − status penalty
 */
export function machineHealth(machine: Machine, now: number, events: DowntimeEvent[]): Health {
  const daysSinceService = Math.max(0, Math.floor((now - machine.lastMaintenance) / DAY));
  const servicePenalty = Math.min(HEALTH.serviceCap, Math.round((HEALTH.serviceWeight * daysSinceService) / PM_INTERVAL_DAYS));
  const from = now - HEALTH.windowDays * DAY;
  let downtimeMin = 0;
  let downtimeEvents = 0;
  for (const e of events) {
    if (e.machineId === machine.id && e.start >= from && e.start <= now) {
      downtimeMin += e.minutes;
      downtimeEvents++;
    }
  }
  const downtimePenalty = Math.min(HEALTH.downtimeCap, Math.round(downtimeMin / HEALTH.downtimeMinPerPoint));
  const statusPenalty = HEALTH.statusPenalty[machine.status];
  const score = Math.max(0, Math.min(100, 100 - servicePenalty - downtimePenalty - statusPenalty));
  const band: HealthBand = score < HEALTH.serviceBelow ? "service" : score < HEALTH.watchBelow ? "watch" : "good";
  return { score, band, daysSinceService, servicePenalty, downtimeMin, downtimeEvents, downtimePenalty, statusPenalty };
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

/** Anchor styled like a kit Button (for navigation actions). */
export function LinkButton({ href, children, icon: Icon, variant = "secondary", className }: { href: string; children: ReactNode; icon?: LucideIcon; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition-colors duration-100",
        variant === "primary" ? "border-forge bg-forge font-semibold text-forge-ink hover:brightness-110" : "border-line-2 bg-raised text-ink hover:border-ink-3 hover:bg-panel",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.2} />}
      {children}
    </Link>
  );
}

/** Utilisation percent with a compact bar. */
export function UtilBar({ value, label }: { value: number; label: string }) {
  const fmt = useFmt();
  const tone: Tone = value >= 75 ? "ok" : value >= 50 ? "warn" : "danger";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-10 text-end text-ink">{fmt.pct(value / 100, 0)}</span>
      <Progress value={value / 100} tone={tone} label={label} className="w-14" />
    </span>
  );
}

/** "in 4 days" / "Due today" / "6 days overdue" chip for a preventive service date. */
export function ServiceDueBadge({ date, now }: { date: number; now: number }) {
  const { t } = useT();
  const d = serviceDays(date, now);
  if (d < 0) return <Badge tone="danger" dot>{t("maintenance.due.overdue", { n: -d })}</Badge>;
  if (d === 0) return <Badge tone="warn" dot>{t("maintenance.due.today")}</Badge>;
  return <Badge tone={d <= DUE_SOON_DAYS ? "warn" : "neutral"}>{t("maintenance.due.in", { n: d })}</Badge>;
}

/** Marks a predictive order / figure as a rule-based demo calculation. */
export function DemoCalcBadge({ className }: { className?: string }) {
  const { t } = useT();
  return <Badge tone="accent" className={className}>{t("common.demoCalc")}</Badge>;
}

/**
 * Machine status menu. Goes through `setMachineStatus` (the store enforces the
 * rules and cascades to the line and the factory twin). Taking a machine down
 * asks for confirmation because it stops the line.
 */
export function MachineStatusMenu({ machine, variant = "button", withLinks }: { machine: Machine; variant?: "button" | "row"; withLinks?: boolean }) {
  const { t, td, tl } = useT();
  const router = useRouter();
  const canControl = useCan("machine.control");
  const canRequest = useCan("maintenance.manage");
  const setMachineStatus = useForge((s) => s.setMachineStatus);
  const line = useForge((s) => s.lines.find((l) => l.id === machine.lineId));
  const run = useAction();
  const [pending, setPending] = useState<MachineStatus | null>(null);

  const apply = (status: MachineStatus) => run(setMachineStatus(machine.id, status), t("equipment.status.changed", { id: machine.id, status: td(`mstatus.${status}`) }));
  const choose = (status: MachineStatus) => {
    if (status === machine.status) return;
    if (status === "maintenance" || status === "offline") setPending(status);
    else apply(status);
  };

  const items: (MenuItem | null)[] = MACHINE_STATUSES.map((s) => ({
    label: td(`mstatus.${s}`),
    checked: s === machine.status,
    disabled: !canControl,
    onSelect: () => choose(s),
  }));
  if (withLinks) {
    items.push(
      null,
      { label: t("equipment.action.request"), icon: Wrench, disabled: !canRequest, onSelect: () => router.push(`/maintenance?new=1&machine=${encodeURIComponent(machine.id)}`) },
      { label: t("equipment.action.open"), icon: ExternalLink, onSelect: () => router.push(`/equipment/${encodeURIComponent(machine.id)}`) },
    );
  }

  return (
    <>
      <Menu
        label={t("equipment.status.menu", { id: machine.id })}
        items={items}
        trigger={(p) =>
          variant === "row" ? (
            <IconButton icon={MoreHorizontal} label={t("common.more")} size="sm" tooltipSide="top" {...p} />
          ) : (
            <Button iconEnd={ChevronDown} {...p}>
              {t("common.changeStatus")}
            </Button>
          )
        }
      />
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && apply(pending)}
        danger
        title={t("equipment.status.confirmTitle", { id: machine.id, status: pending ? td(`mstatus.${pending}`) : "" })}
        body={t("equipment.status.confirmBody", { machine: tl(machine.name), line: line ? `${line.code} · ${tl(line.name)}` : machine.lineId })}
        confirmLabel={t("equipment.status.confirmAction")}
      />
    </>
  );
}
