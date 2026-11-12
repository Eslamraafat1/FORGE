"use client";
import type {
  AlertStatus,
  InspectionStatus,
  LineStatus,
  MachineStatus,
  MaintenanceStatus,
  MaintenanceType,
  Priority,
  PurchaseOrderStatus,
  Severity,
  ShipmentStatus,
  StockStatus,
  WorkOrderStatus,
} from "@/domain/types";
import { useT } from "@/i18n";
import { Badge, type Tone } from "./primitives";

/**
 * One place that decides how every status in the product looks.
 * Status colour is always paired with a text label (never colour alone).
 */
export const LINE_TONE: Record<LineStatus, Tone> = { running: "ok", idle: "neutral", changeover: "info", maintenance: "warn", stopped: "danger" };
export const MACHINE_TONE: Record<MachineStatus, Tone> = { running: "ok", idle: "neutral", maintenance: "info", warning: "warn", offline: "danger" };
export const WO_TONE: Record<WorkOrderStatus, Tone> = { draft: "neutral", scheduled: "info", in_progress: "accent", paused: "warn", completed: "ok", cancelled: "danger" };
export const PO_TONE: Record<PurchaseOrderStatus, Tone> = { draft: "neutral", pending: "warn", approved: "info", ordered: "accent", partial: "warn", received: "ok", cancelled: "danger" };
export const STOCK_TONE: Record<StockStatus, Tone> = { healthy: "ok", low: "warn", critical: "danger", out: "danger" };
export const INSPECTION_TONE: Record<InspectionStatus, Tone> = { scheduled: "neutral", in_progress: "accent", passed: "ok", failed: "danger", conditional: "warn" };
export const MAINT_TONE: Record<MaintenanceStatus, Tone> = { requested: "warn", scheduled: "info", in_progress: "accent", completed: "ok", cancelled: "neutral" };
export const MAINT_TYPE_TONE: Record<MaintenanceType, Tone> = { preventive: "info", corrective: "warn", predictive: "accent" };
export const PRIORITY_TONE: Record<Priority, Tone> = { low: "neutral", medium: "info", high: "warn", urgent: "danger" };
export const SEVERITY_TONE: Record<Severity, Tone> = { info: "info", warning: "warn", critical: "danger", success: "ok" };
export const ALERT_STATUS_TONE: Record<AlertStatus, Tone> = { open: "danger", acknowledged: "warn", resolved: "ok" };
export const SHIPMENT_TONE: Record<ShipmentStatus, Tone> = { scheduled: "neutral", in_transit: "info", arrived: "ok", loading: "accent", dispatched: "ok", delayed: "danger" };

const KINDS = {
  line: { tone: LINE_TONE, prefix: "lstatus" },
  machine: { tone: MACHINE_TONE, prefix: "mstatus" },
  wo: { tone: WO_TONE, prefix: "wostatus" },
  po: { tone: PO_TONE, prefix: "postatus" },
  stock: { tone: STOCK_TONE, prefix: "stock" },
  inspection: { tone: INSPECTION_TONE, prefix: "qstatus" },
  maintenance: { tone: MAINT_TONE, prefix: "mntstatus" },
  maintenanceType: { tone: MAINT_TYPE_TONE, prefix: "mnttype" },
  priority: { tone: PRIORITY_TONE, prefix: "priority" },
  severity: { tone: SEVERITY_TONE, prefix: "severity" },
  alert: { tone: ALERT_STATUS_TONE, prefix: "astatus" },
  shipment: { tone: SHIPMENT_TONE, prefix: "shipstatus" },
} as const;

export type StatusKind = keyof typeof KINDS;

/** <StatusBadge kind="wo" value={order.status} /> */
export function StatusBadge({ kind, value, className }: { kind: StatusKind; value: string; className?: string }) {
  const { td } = useT();
  const def = KINDS[kind];
  const tone = (def.tone as Record<string, Tone>)[value] ?? "neutral";
  const live = (kind === "line" || kind === "machine") && value === "running";
  const noDot = kind === "priority" || kind === "maintenanceType";
  return (
    <Badge tone={tone} dot={!noDot} pulse={live} className={className}>
      {td(`${def.prefix}.${value}`)}
    </Badge>
  );
}

export function statusTone(kind: StatusKind, value: string): Tone {
  return (KINDS[kind].tone as Record<string, Tone>)[value] ?? "neutral";
}
