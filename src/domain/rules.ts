/**
 * Pure business rules shared by the store, selectors and views.
 * No React, no state access — everything here is a function of its arguments.
 */
import type {
  InventoryItem,
  LineStatus,
  Machine,
  MaintenanceStatus,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockStatus,
  WorkOrder,
  WorkOrderStatus,
} from "./types";
import { wobble } from "@/lib/rng";

/* Stock ------------------------------------------------------------- */

export function stockStatus(item: Pick<InventoryItem, "quantity" | "reorderLevel">): StockStatus {
  if (item.quantity <= 0) return "out";
  if (item.reorderLevel <= 0) return "healthy";
  if (item.quantity <= item.reorderLevel * 0.5) return "critical";
  if (item.quantity <= item.reorderLevel) return "low";
  return "healthy";
}

export const STOCK_RANK: Record<StockStatus, number> = { healthy: 0, low: 1, critical: 2, out: 3 };

export function stockValue(item: Pick<InventoryItem, "quantity" | "unitCost">): number {
  return Math.max(0, item.quantity) * item.unitCost;
}

export function palletsUsed(item: Pick<InventoryItem, "quantity" | "unitsPerPallet">): number {
  return item.quantity > 0 ? Math.ceil(item.quantity / item.unitsPerPallet) : 0;
}

/* Work orders ------------------------------------------------------- */

export const WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "draft", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WO_TRANSITIONS[from].includes(to);
}

export function woProgress(wo: Pick<WorkOrder, "completedQty" | "plannedQty">): number {
  return wo.plannedQty > 0 ? Math.min(1, wo.completedQty / wo.plannedQty) : 0;
}

export function woIsOpen(wo: WorkOrder): boolean {
  return wo.status !== "completed" && wo.status !== "cancelled";
}

/** Two scheduled windows on the same line overlap. */
export function woConflicts(a: WorkOrder, b: WorkOrder): boolean {
  if (a.id === b.id || !a.lineId || a.lineId !== b.lineId) return false;
  if (!woIsOpen(a) || !woIsOpen(b) || a.status === "draft" || b.status === "draft") return false;
  return a.plannedStart < b.plannedEnd && b.plannedStart < a.plannedEnd;
}

/* Purchase orders --------------------------------------------------- */

export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["approved", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["partial", "received"],
  partial: ["partial", "received"],
  received: [],
  cancelled: [],
};

export function poValue(po: Pick<PurchaseOrder, "lines">): number {
  return po.lines.reduce((s, ln) => s + ln.qty * ln.unitCost, 0);
}

export function poReceivedRatio(po: Pick<PurchaseOrder, "lines">): number {
  const total = po.lines.reduce((s, ln) => s + ln.qty, 0);
  return total > 0 ? po.lines.reduce((s, ln) => s + ln.receivedQty, 0) / total : 0;
}

/* Quality ----------------------------------------------------------- */

/** Release limits used by the demo quality plan. */
export const QUALITY_FAIL_RATE = 0.036;
export const QUALITY_WATCH_RATE = 0.03;

export function inspectionOutcome(inspected: number, rejected: number): "passed" | "conditional" | "failed" {
  const rate = inspected > 0 ? rejected / inspected : 0;
  return rate > QUALITY_FAIL_RATE ? "failed" : rate > QUALITY_WATCH_RATE ? "conditional" : "passed";
}

/* Maintenance ------------------------------------------------------- */

export const PM_INTERVAL_DAYS = 90;

export function maintenanceIsOpen(status: MaintenanceStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}

/* Lines & machines -------------------------------------------------- */

export function lineIsProducing(status: LineStatus): boolean {
  return status === "running";
}

export function machineIsDown(m: Pick<Machine, "status">): boolean {
  return m.status === "maintenance" || m.status === "offline";
}

/* OEE --------------------------------------------------------------- */

export interface OeeInput {
  plannedMin: number;
  downtimeMin: number;
  actual: number;
  rejected: number;
  /** Ideal units per hour. */
  nominalRate: number;
}

export interface Oee {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

/**
 * OEE = Availability × Performance × Quality
 *  Availability = run time / planned production time
 *  Performance  = actual output / (ideal rate × run time)
 *  Quality      = good units / actual output
 * Inputs may be pre-aggregated: pass the summed ideal output via `idealUnits`.
 */
export function computeOee(input: { plannedMin: number; downtimeMin: number; actual: number; rejected: number; idealUnits: number }): Oee {
  const availability = input.plannedMin > 0 ? (input.plannedMin - input.downtimeMin) / input.plannedMin : 0;
  const performance = input.idealUnits > 0 ? Math.min(1, input.actual / input.idealUnits) : 0;
  const quality = input.actual > 0 ? (input.actual - input.rejected) / input.actual : 0;
  return { availability, performance, quality, oee: availability * performance * quality };
}

/* Simulated sensors ------------------------------------------------- */

export const AMBIENT_TEMP = 24;

/**
 * Simulated machine telemetry. A pure function of the machine and the
 * simulation tick — the same tick always yields the same reading.
 * These are demo values, not readings from real equipment.
 */
export function machineTelemetry(m: Machine, tick: number): { temperature: number; speed: number; load: number } {
  const w = wobble(m.id, tick);
  const span = Math.max(1.2, m.baseTemp * 0.03);
  let temperature: number;
  let speed: number;
  let load: number;
  switch (m.status) {
    case "running":
      temperature = m.baseTemp + w * span;
      speed = m.baseSpeed * (0.965 + w * 0.03);
      load = 72 + w * 9;
      break;
    case "warning":
      temperature = m.baseTemp * 1.22 + w * span * 1.4;
      speed = m.baseSpeed * (0.9 + w * 0.05);
      load = 91 + w * 5;
      break;
    case "idle":
      temperature = AMBIENT_TEMP + (m.baseTemp - AMBIENT_TEMP) * 0.22 + w;
      speed = 0;
      load = 4 + Math.abs(w) * 3;
      break;
    default:
      temperature = AMBIENT_TEMP + w * 0.6;
      speed = 0;
      load = 0;
  }
  return {
    temperature: Math.round(temperature * 10) / 10,
    speed: m.baseSpeed >= 100 ? Math.round(speed) : Math.round(speed * 10) / 10,
    load: Math.round(Math.max(0, Math.min(100, load))),
  };
}

/** Warning threshold for a machine's temperature (simulated limit). */
export function tempLimit(m: Pick<Machine, "baseTemp">): number {
  return Math.round(m.baseTemp * 1.15);
}
