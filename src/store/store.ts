"use client";
/**
 * FORGE application store — the single source of truth for all demo data.
 *
 * Every mutation goes through an action here. Actions validate their input,
 * apply the change, and run the cascades that keep modules consistent (stock
 * alerts, line/machine status, activity log, notifications). Actions return a
 * Result so the UI can surface validation failures.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActivityEvent,
  Alert,
  Defect,
  EntityRef,
  EventCategory,
  ForgeData,
  ID,
  InventoryItem,
  L10n,
  LineStatus,
  MachineStatus,
  MaintenanceOrder,
  MaintenanceType,
  Msg,
  MovementType,
  Priority,
  PurchaseOrder,
  Role,
  Severity,
  StockStatus,
  TeamMember,
  WorkOrder,
  WorkOrderStatus,
} from "@/domain/types";
import {
  PM_INTERVAL_DAYS,
  PO_TRANSITIONS,
  STOCK_RANK,
  canTransition,
  inspectionOutcome,
  machineIsDown,
  maintenanceIsOpen,
  stockStatus,
} from "@/domain/rules";
import { CURRENT_USER_ID, createSeed } from "@/data/seed";
import { noise } from "@/lib/rng";
import { DAY, DEMO_EPOCH, MIN, SIM_MINUTES_PER_TICK, shiftAt } from "@/lib/time";

export type Result = { ok: true; id?: ID } | { ok: false; error: Msg };
const ok = (id?: ID): Result => ({ ok: true, id });
const fail = (key: string, params?: Msg["params"]): Result => ({ ok: false, error: { key, params } });

export type AdjustReason = "count" | "damage" | "scrap" | "return" | "found" | "correction" | "pending_receipt";

export interface WorkOrderInput {
  productId: ID;
  lineId: ID | null;
  plannedQty: number;
  priority: Priority;
  plannedStart: number;
  plannedEnd: number;
  dueDate: number;
  supervisorId: ID;
  notes?: string;
}

export interface ItemInput {
  sku: string;
  name: L10n;
  category: InventoryItem["category"];
  unit: string;
  warehouseId: ID;
  zoneId: ID;
  reorderLevel: number;
  unitCost: number;
  unitsPerPallet: number;
  supplierId?: ID;
  quantity?: number;
}

export interface PoInput {
  supplierId: ID;
  expectedDate: number;
  lines: { itemId: ID; qty: number }[];
  notes?: string;
}

export interface MaintenanceInput {
  machineId: ID;
  type: MaintenanceType;
  description: string;
  priority: Priority;
  technicianId: ID | null;
  scheduledDate: number;
  estimatedHours: number;
  cost?: number;
}

export interface ForgeState extends ForgeData {
  /** Simulated demo clock (epoch ms). */
  now: number;
  /** Simulation step counter; drives deterministic telemetry. */
  tick: number;
  simRunning: boolean;
  /** Active demo role (interface only — not a security control). */
  role: Role;
  hydrated: boolean;

  setHydrated(): void;
  setRole(role: Role): void;
  setSimRunning(running: boolean): void;
  simTick(): void;
  resetDemo(): void;

  acknowledgeAlert(id: ID): Result;
  assignAlert(id: ID, memberId: ID | null): Result;
  resolveAlert(id: ID): Result;

  markNotificationRead(id: ID): void;
  markAllNotificationsRead(): void;
  clearNotification(id: ID): void;
  clearAllNotifications(): void;

  setLineStatus(id: ID, status: LineStatus): Result;
  setMachineStatus(id: ID, status: MachineStatus): Result;

  createWorkOrder(input: WorkOrderInput): Result;
  updateWorkOrder(id: ID, patch: Partial<WorkOrderInput>): Result;
  scheduleWorkOrder(id: ID, sched: { lineId: ID; plannedStart: number; plannedEnd: number }): Result;
  setWorkOrderStatus(id: ID, to: WorkOrderStatus): Result;
  updateWorkOrderProgress(id: ID, completedQty: number, rejectedQty: number): Result;

  addItem(input: ItemInput): Result;
  updateItem(id: ID, patch: Partial<Omit<ItemInput, "sku" | "quantity">>): Result;
  adjustStock(id: ID, delta: number, reason: AdjustReason, note?: string): Result;

  createPurchaseOrder(input: PoInput): Result;
  updatePurchaseOrder(id: ID, input: PoInput): Result;
  setPurchaseOrderStatus(id: ID, to: "pending" | "approved" | "ordered" | "cancelled", note?: string): Result;
  receivePurchaseOrder(id: ID, received: Record<ID, number>): Result;

  createInspection(input: { workOrderId: ID; inspectorId: ID; date: number; notes?: string }): Result;
  recordInspection(id: ID, input: { inspectedQty: number; defects: Defect[]; notes: string }): Result;
  assignCorrectiveAction(id: ID, input: { description: string; assigneeId: ID; dueDate: number }): Result;
  resolveCorrectiveAction(id: ID): Result;

  createMaintenance(input: MaintenanceInput): Result;
  updateMaintenance(id: ID, patch: Partial<Pick<MaintenanceOrder, "priority" | "technicianId" | "scheduledDate" | "estimatedHours" | "progress">>): Result;
  startMaintenance(id: ID): Result;
  completeMaintenance(id: ID, cost?: number): Result;
  cancelMaintenance(id: ID): Result;

  updateMember(id: ID, patch: Partial<Pick<TeamMember, "role" | "status" | "department" | "factoryId">>): Result;
}

/* ------------------------------------------------------------------ */
/* Working-copy helpers                                                */
/* ------------------------------------------------------------------ */

type W = ForgeData & { now: number; tick: number };
type ListKey = { [K in keyof ForgeData]: ForgeData[K] extends { id: ID }[] ? K : never }[keyof ForgeData];

function patch<K extends ListKey>(w: W, key: K, id: ID, p: Partial<ForgeData[K][number]>) {
  (w[key] as { id: ID }[]) = (w[key] as { id: ID }[]).map((x) => (x.id === id ? { ...x, ...p } : x));
}

function nextId(list: { id: ID }[], prefix: string): ID {
  let max = 0;
  for (const x of list) {
    if (x.id.startsWith(prefix + "-")) {
      const n = Number(x.id.slice(prefix.length + 1));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${max + 1}`;
}

const MAX_ACTIVITY = 400;
const MAX_NOTIFICATIONS = 60;
const MAX_MOVEMENTS = 1200;

function log(
  w: W,
  category: EventCategory,
  severity: Severity,
  msg: Msg,
  entity?: EntityRef,
  opts: { notify?: boolean; actor?: ID | null } = {},
) {
  const ev: ActivityEvent = {
    id: nextId(w.activity, "EV"),
    at: w.now,
    category,
    severity,
    msg,
    entity,
    actorId: opts.actor === null ? undefined : (opts.actor ?? CURRENT_USER_ID),
  };
  w.activity = [ev, ...w.activity].slice(0, MAX_ACTIVITY);
  if (opts.notify) {
    w.notifications = [
      { id: nextId(w.notifications, "NT"), category, severity, msg, entity, at: w.now, read: false },
      ...w.notifications,
    ].slice(0, MAX_NOTIFICATIONS);
  }
}

function raiseAlert(w: W, a: Omit<Alert, "id" | "status" | "createdAt">) {
  const alert: Alert = { ...a, id: nextId(w.alerts, "AL"), status: "open", createdAt: w.now };
  w.alerts = [alert, ...w.alerts];
}

/** Resolve every open alert that points at the given entity (optionally one category). */
function resolveAlertsFor(w: W, entity: EntityRef, category?: EventCategory) {
  w.alerts = w.alerts.map((a) =>
    a.status !== "resolved" && a.entity.type === entity.type && a.entity.id === entity.id && (!category || a.category === category)
      ? { ...a, status: "resolved", resolvedAt: w.now }
      : a,
  );
}

/** Apply a stock change, record the movement and keep stock alerts in sync. */
function applyStock(w: W, itemId: ID, delta: number, type: MovementType, reason?: string, ref?: EntityRef, actor: ID | null = CURRENT_USER_ID) {
  const item = w.items.find((i) => i.id === itemId);
  if (!item || delta === 0) return;
  const before: StockStatus = stockStatus(item);
  const quantity = Math.round((item.quantity + delta) * 100) / 100;
  patch(w, "items", itemId, { quantity });
  w.movements = [
    { id: nextId(w.movements, "MV"), itemId, at: w.now, type, qty: delta, balance: quantity, reason, ref, byId: actor ?? CURRENT_USER_ID },
    ...w.movements,
  ].slice(0, MAX_MOVEMENTS);

  const after = stockStatus({ quantity, reorderLevel: item.reorderLevel });
  if (after === before) return;
  const entity: EntityRef = { type: "item", id: itemId };
  if (STOCK_RANK[after] > STOCK_RANK[before]) {
    resolveAlertsFor(w, entity, "inventory");
    const key = after === "out" ? "stockOut" : after === "critical" ? "stockCritical" : "stockLow";
    raiseAlert(w, {
      severity: after === "low" ? "warning" : after === "critical" ? "warning" : "critical",
      category: "inventory",
      title: { key: `alert.${key}.title`, params: { item: item.name } },
      detail: { key: "alert.stock.detail", params: { sku: item.sku, qty: quantity, unit: item.unit, reorder: item.reorderLevel } },
      entity,
    });
    log(w, "inventory", after === "low" ? "warning" : "critical", { key: `evt.${key}`, params: { item: item.name } }, entity, { notify: true, actor: null });
  } else if (after === "healthy") {
    resolveAlertsFor(w, entity, "inventory");
    log(w, "inventory", "success", { key: "evt.stockRecovered", params: { item: item.name } }, entity, { actor: null });
  }
}

/** Complete a work order: backflush materials, receive finished goods, free the line. */
function completeWo(w: W, wo: WorkOrder, actor: ID | null) {
  const product = w.products.find((p) => p.id === wo.productId)!;
  const ref: EntityRef = { type: "workOrder", id: wo.id };
  patch(w, "workOrders", wo.id, { status: "completed", completedAt: w.now });
  for (const b of product.bom) {
    const item = w.items.find((i) => i.id === b.itemId);
    if (!item) continue;
    // Backflush: never drive a component below zero.
    const need = Math.min(Math.max(0, item.quantity), Math.round(b.qtyPerUnit * wo.completedQty * 100) / 100);
    if (need > 0) applyStock(w, item.id, -need, "issue", undefined, ref, actor);
  }
  const fg = w.items.find((i) => i.category === "finished" && i.productId === wo.productId);
  const good = wo.completedQty - wo.rejectedQty;
  if (fg && good > 0) applyStock(w, fg.id, good, "production", undefined, ref, actor);
  if (wo.lineId) {
    const others = w.workOrders.some((o) => o.lineId === wo.lineId && o.status === "in_progress");
    const line = w.lines.find((x) => x.id === wo.lineId);
    if (!others && line?.status === "running") setLine(w, wo.lineId, "idle", actor, false);
  }
  log(w, "production", "success", { key: "evt.woCompleted", params: { id: wo.id, qty: wo.completedQty } }, ref, { notify: true, actor });
}

/** Set a line's status and bring its machines along. Does not touch work orders. */
function setLine(w: W, lineId: ID, status: LineStatus, actor: ID | null, announce = true) {
  const line = w.lines.find((x) => x.id === lineId);
  if (!line || line.status === status) return;
  patch(w, "lines", lineId, { status });
  w.machines = w.machines.map((mc) => {
    if (mc.lineId !== lineId || machineIsDown(mc)) return mc;
    if (status === "running" && mc.status === "idle") return { ...mc, status: "running" as const };
    if (status !== "running" && mc.status === "running") return { ...mc, status: "idle" as const };
    return mc;
  });
  if (announce) {
    const entity: EntityRef = { type: "line", id: lineId };
    if (status === "running") log(w, "production", "info", { key: "evt.lineStarted", params: { line: line.name } }, entity, { actor });
    else log(w, "production", status === "idle" ? "info" : "warning", { key: "evt.lineStatus", params: { line: line.name, status: `@lstatus.${status}` } }, entity, { actor });
  }
}

function pauseActiveOrders(w: W, lineId: ID, actor: ID | null) {
  for (const wo of w.workOrders) {
    if (wo.lineId === lineId && wo.status === "in_progress") {
      patch(w, "workOrders", wo.id, { status: "paused" });
      log(w, "production", "warning", { key: "evt.woPaused", params: { id: wo.id } }, { type: "workOrder", id: wo.id }, { actor });
    }
  }
}

const DATA_KEYS: (keyof ForgeData)[] = [
  "factories", "products", "shifts", "lines", "machines", "workOrders", "downtimeEvents", "dailyStats", "items",
  "movements", "warehouses", "zones", "shipments", "suppliers", "purchaseOrders", "inspections", "maintenanceOrders",
  "team", "alerts", "notifications", "activity",
];
/** Immutable reference/history data: regenerated from the seed, never persisted. */
const STATIC_KEYS: (keyof ForgeData)[] = ["factories", "products", "shifts", "downtimeEvents", "dailyStats", "warehouses", "zones", "suppliers"];

const isInt = (n: number) => Number.isFinite(n) && Math.floor(n) === n;

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useForge = create<ForgeState>()(
  persist(
    (set, get) => {
      /** Run a mutation against a working copy and commit it. */
      const commit = (fn: (w: W) => Result | void): Result => {
        const s = get();
        const w = { now: s.now, tick: s.tick } as W;
        for (const k of DATA_KEYS) (w as unknown as Record<string, unknown>)[k] = s[k];
        const r = fn(w);
        if (r && !r.ok) return r;
        set(w as Partial<ForgeState>);
        return r ?? ok();
      };

      return {
        ...createSeed(),
        now: DEMO_EPOCH,
        tick: 0,
        simRunning: true,
        role: "ops_manager",
        hydrated: false,

        setHydrated: () => set({ hydrated: true }),
        setRole: (role) => set({ role }),
        setSimRunning: (simRunning) => set({ simRunning }),

        resetDemo: () => set({ ...createSeed(), now: DEMO_EPOCH, tick: 0, simRunning: true, role: "ops_manager" }),

        /* ---------------- Simulation ---------------- */
        simTick: () => {
          commit((w) => {
            const prevShift = shiftAt(w.now).id;
            w.now += SIM_MINUTES_PER_TICK * MIN;
            w.tick += 1;
            const shift = shiftAt(w.now);
            if (shift.id !== prevShift) {
              w.lines = w.lines.map((ln) => ({ ...ln, shiftOutput: 0, shiftRejected: 0, shiftDowntimeMin: 0 }));
              log(w, "system", "info", { key: "evt.shiftChanged", params: { shift: `@shift.${shift.id}` } }, undefined, { actor: null });
            }
            for (const line of w.lines) {
              if (line.status !== "running") {
                if (line.status !== "idle") patch(w, "lines", line.id, { shiftDowntimeMin: line.shiftDowntimeMin + SIM_MINUTES_PER_TICK });
                continue;
              }
              let wo = w.workOrders.find((o) => o.lineId === line.id && o.status === "in_progress");
              if (!wo) {
                // Pull the next scheduled order once its window has opened.
                const next = w.workOrders
                  .filter((o) => o.lineId === line.id && o.status === "scheduled" && o.plannedStart <= w.now)
                  .sort((a, b) => a.plannedStart - b.plannedStart)[0];
                if (!next) continue;
                patch(w, "workOrders", next.id, { status: "in_progress", startedAt: w.now });
                log(w, "production", "info", { key: "evt.woStarted", params: { id: next.id, line: line.name } }, { type: "workOrder", id: next.id }, { actor: null });
                wo = { ...next, status: "in_progress" };
              }
              // Deterministic output: ideal rate × a slowly varying efficiency, stochastically rounded by tick.
              const slowMachine = w.machines.some((mc) => mc.lineId === line.id && mc.status === "warning");
              const eff = (slowMachine ? 0.84 : 0.93) + (noise(line.id + "e", Math.floor(w.tick / 10)) - 0.5) * 0.08;
              const ideal = (line.nominalRate * SIM_MINUTES_PER_TICK * eff) / 60;
              let units = Math.floor(ideal + noise(line.id + "u", w.tick));
              units = Math.min(units, wo.plannedQty - wo.completedQty);
              if (units <= 0 && wo.completedQty < wo.plannedQty) continue;
              const rejectRate = line.id === "L-03" ? 0.033 : 0.017;
              let rejects = 0;
              for (let u = 0; u < units; u++) if (noise(line.id + "r" + u, w.tick) < rejectRate) rejects++;
              const completedQty = wo.completedQty + units;
              const rejectedQty = wo.rejectedQty + rejects;
              patch(w, "workOrders", wo.id, { completedQty, rejectedQty });
              const output = line.shiftOutput + units;
              patch(w, "lines", line.id, { shiftOutput: output, shiftRejected: line.shiftRejected + rejects });
              if (line.shiftOutput < line.shiftTarget && output >= line.shiftTarget) {
                log(w, "production", "success", { key: "evt.targetReached", params: { line: line.name } }, { type: "line", id: line.id }, { notify: true, actor: null });
              }
              if (completedQty >= wo.plannedQty) completeWo(w, { ...wo, completedQty, rejectedQty }, null);
            }
          });
        },

        /* ---------------- Alerts ---------------- */
        acknowledgeAlert: (id) =>
          commit((w) => {
            const a = w.alerts.find((x) => x.id === id);
            if (!a) return fail("err.notFound");
            if (a.status !== "open") return fail("err.alertNotOpen");
            patch(w, "alerts", id, { status: "acknowledged", acknowledgedById: CURRENT_USER_ID });
            log(w, "system", "info", { key: "evt.alertAck", params: { id } }, a.entity);
          }),
        assignAlert: (id, memberId) =>
          commit((w) => {
            const a = w.alerts.find((x) => x.id === id);
            if (!a) return fail("err.notFound");
            if (a.status === "resolved") return fail("err.alertResolved");
            patch(w, "alerts", id, { assigneeId: memberId ?? undefined });
            const member = w.team.find((t) => t.id === memberId);
            if (member) log(w, "system", "info", { key: "evt.alertAssigned", params: { id, name: member.name } }, a.entity);
          }),
        resolveAlert: (id) =>
          commit((w) => {
            const a = w.alerts.find((x) => x.id === id);
            if (!a) return fail("err.notFound");
            if (a.status === "resolved") return fail("err.alertResolved");
            patch(w, "alerts", id, { status: "resolved", resolvedAt: w.now, acknowledgedById: a.acknowledgedById ?? CURRENT_USER_ID });
            log(w, "system", "success", { key: "evt.alertResolved", params: { id } }, a.entity);
          }),

        /* ---------------- Notifications ---------------- */
        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })) })),
        clearNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
        clearAllNotifications: () => set({ notifications: [] }),

        /* ---------------- Lines & machines ---------------- */
        setLineStatus: (id, status) =>
          commit((w) => {
            const line = w.lines.find((x) => x.id === id);
            if (!line) return fail("err.notFound");
            if (line.status === status) return ok();
            if (status === "running" && w.machines.some((mc) => mc.lineId === id && machineIsDown(mc))) {
              return fail("err.lineMachinesDown", { line: line.code });
            }
            if (status !== "running") pauseActiveOrders(w, id, CURRENT_USER_ID);
            setLine(w, id, status, CURRENT_USER_ID);
          }),

        setMachineStatus: (id, status) =>
          commit((w) => {
            const mc = w.machines.find((x) => x.id === id);
            if (!mc) return fail("err.notFound");
            if (mc.status === status) return ok();
            const line = w.lines.find((x) => x.id === mc.lineId)!;
            if (status === "running" && line.status !== "running") return fail("err.machineLineNotRunning", { line: line.code });
            patch(w, "machines", id, { status });
            const entity: EntityRef = { type: "machine", id };
            const sev: Severity = status === "running" ? "success" : status === "idle" ? "info" : status === "warning" ? "warning" : "critical";
            log(w, "maintenance", sev, { key: "evt.machineStatus", params: { machine: id, status: `@mstatus.${status}` } }, entity, { notify: status === "maintenance" || status === "offline" });
            if (status === "maintenance" || status === "offline") {
              // A down machine stops its line and pauses the running order.
              if (line.status === "running" || line.status === "idle" || line.status === "changeover") {
                pauseActiveOrders(w, line.id, CURRENT_USER_ID);
                setLine(w, line.id, status === "maintenance" ? "maintenance" : "stopped", CURRENT_USER_ID);
              }
            } else {
              const stillDown = w.machines.some((x) => x.lineId === line.id && machineIsDown(x));
              if (!stillDown && (line.status === "maintenance" || line.status === "stopped")) setLine(w, line.id, "idle", CURRENT_USER_ID);
              if (!stillDown) resolveAlertsFor(w, entity, "maintenance");
            }
          }),

        /* ---------------- Work orders ---------------- */
        createWorkOrder: (input) =>
          commit((w) => {
            if (!isInt(input.plannedQty) || input.plannedQty <= 0) return fail("err.qtyPositive");
            if (!(input.plannedEnd > input.plannedStart)) return fail("err.endAfterStart");
            if (!w.products.some((p) => p.id === input.productId)) return fail("err.notFound");
            const id = nextId(w.workOrders, "WO");
            const wo: WorkOrder = {
              id, ...input, completedQty: 0, rejectedQty: 0,
              status: input.lineId ? "scheduled" : "draft", createdAt: w.now,
            };
            w.workOrders = [...w.workOrders, wo];
            log(w, "production", "info", { key: "evt.woCreated", params: { id } }, { type: "workOrder", id });
            return ok(id);
          }),

        updateWorkOrder: (id, p) =>
          commit((w) => {
            const wo = w.workOrders.find((x) => x.id === id);
            if (!wo) return fail("err.notFound");
            if (wo.status === "completed" || wo.status === "cancelled") return fail("err.woClosed", { id });
            const next = { ...wo, ...p };
            if (!isInt(next.plannedQty) || next.plannedQty <= 0) return fail("err.qtyPositive");
            if (next.plannedQty < wo.completedQty) return fail("err.plannedBelowCompleted", { qty: wo.completedQty });
            if (!(next.plannedEnd > next.plannedStart)) return fail("err.endAfterStart");
            if (p.lineId !== undefined && p.lineId !== wo.lineId && (wo.status === "in_progress" || wo.status === "paused")) return fail("err.woLineLocked");
            if (p.productId && p.productId !== wo.productId && wo.completedQty > 0) return fail("err.woProductLocked");
            if (next.lineId === null && wo.status === "scheduled") next.status = "draft";
            if (next.lineId && wo.status === "draft") next.status = "scheduled";
            w.workOrders = w.workOrders.map((x) => (x.id === id ? next : x));
            log(w, "production", "info", { key: "evt.woUpdated", params: { id } }, { type: "workOrder", id });
          }),

        scheduleWorkOrder: (id, sched) =>
          commit((w) => {
            const wo = w.workOrders.find((x) => x.id === id);
            if (!wo) return fail("err.notFound");
            if (wo.status === "completed" || wo.status === "cancelled") return fail("err.woClosed", { id });
            if (!(sched.plannedEnd > sched.plannedStart)) return fail("err.endAfterStart");
            if (sched.lineId !== wo.lineId && (wo.status === "in_progress" || wo.status === "paused")) return fail("err.woLineLocked");
            if (!w.lines.some((x) => x.id === sched.lineId)) return fail("err.notFound");
            patch(w, "workOrders", id, { ...sched, status: wo.status === "draft" ? "scheduled" : wo.status });
            log(w, "production", "info", { key: "evt.woScheduled", params: { id, line: sched.lineId } }, { type: "workOrder", id });
          }),

        setWorkOrderStatus: (id, to) =>
          commit((w) => {
            const wo = w.workOrders.find((x) => x.id === id);
            if (!wo) return fail("err.notFound");
            if (!canTransition(wo.status, to)) return fail("err.woTransition", { from: `@wostatus.${wo.status}`, to: `@wostatus.${to}` });
            const ref: EntityRef = { type: "workOrder", id };
            if (to === "scheduled" && !wo.lineId) return fail("err.woNeedsLine");
            if (to === "in_progress") {
              if (!wo.lineId) return fail("err.woNeedsLine");
              const line = w.lines.find((x) => x.id === wo.lineId)!;
              if (w.workOrders.some((o) => o.id !== id && o.lineId === wo.lineId && o.status === "in_progress")) return fail("err.lineBusy", { line: line.code });
              if (w.machines.some((mc) => mc.lineId === line.id && machineIsDown(mc))) return fail("err.lineMachinesDown", { line: line.code });
              const resumed = wo.status === "paused";
              patch(w, "workOrders", id, { status: "in_progress", startedAt: wo.startedAt ?? w.now });
              setLine(w, line.id, "running", CURRENT_USER_ID, false);
              if (line.productId !== wo.productId) patch(w, "lines", line.id, { productId: wo.productId });
              log(w, "production", "info", { key: resumed ? "evt.woResumed" : "evt.woStarted", params: { id, line: line.name } }, ref);
              return;
            }
            if (to === "completed") {
              if (wo.completedQty <= 0) return fail("err.woNothingProduced");
              completeWo(w, wo, CURRENT_USER_ID);
              return;
            }
            patch(w, "workOrders", id, { status: to });
            if ((to === "paused" || to === "cancelled") && wo.status === "in_progress" && wo.lineId) {
              setLine(w, wo.lineId, "idle", CURRENT_USER_ID, false);
            }
            const key = to === "paused" ? "evt.woPaused" : to === "cancelled" ? "evt.woCancelled" : to === "draft" ? "evt.woUnscheduled" : "evt.woScheduled";
            log(w, "production", to === "cancelled" || to === "paused" ? "warning" : "info", { key, params: { id, line: wo.lineId ?? "—" } }, ref, { notify: to === "cancelled" });
          }),

        updateWorkOrderProgress: (id, completedQty, rejectedQty) =>
          commit((w) => {
            const wo = w.workOrders.find((x) => x.id === id);
            if (!wo) return fail("err.notFound");
            if (wo.status !== "in_progress" && wo.status !== "paused") return fail("err.woNotActive");
            if (!isInt(completedQty) || !isInt(rejectedQty) || completedQty < 0 || rejectedQty < 0) return fail("err.qtyInteger");
            if (completedQty > wo.plannedQty) return fail("err.completedAbovePlanned", { qty: wo.plannedQty });
            if (rejectedQty > completedQty) return fail("err.rejectedAboveCompleted");
            const dOut = completedQty - wo.completedQty;
            const dRej = rejectedQty - wo.rejectedQty;
            patch(w, "workOrders", id, { completedQty, rejectedQty });
            const line = w.lines.find((x) => x.id === wo.lineId);
            if (line) {
              // Keep the live shift counters consistent with the order.
              patch(w, "lines", line.id, {
                shiftOutput: Math.max(0, line.shiftOutput + dOut),
                shiftRejected: Math.max(0, line.shiftRejected + dRej),
              });
            }
            log(w, "production", "info", { key: "evt.woProgress", params: { id, qty: completedQty, total: wo.plannedQty } }, { type: "workOrder", id });
          }),

        /* ---------------- Inventory ---------------- */
        addItem: (input) =>
          commit((w) => {
            const sku = input.sku.trim().toUpperCase();
            if (!sku) return fail("err.required");
            if (w.items.some((i) => i.sku === sku)) return fail("err.skuExists", { sku });
            if (input.unitCost < 0 || input.reorderLevel < 0 || input.unitsPerPallet <= 0) return fail("err.nonNegative");
            const qty = input.quantity ?? 0;
            if (qty < 0) return fail("err.nonNegative");
            const item: InventoryItem = { ...input, id: sku, sku, quantity: 0 };
            w.items = [...w.items, item];
            const entity: EntityRef = { type: "item", id: sku };
            log(w, "inventory", "info", { key: "evt.itemCreated", params: { item: item.name } }, entity);
            if (qty > 0) applyStock(w, sku, qty, "count", "Opening balance");
            return ok(sku);
          }),

        updateItem: (id, p) =>
          commit((w) => {
            const item = w.items.find((i) => i.id === id);
            if (!item) return fail("err.notFound");
            const next = { ...item, ...p };
            if (next.unitCost < 0 || next.reorderLevel < 0 || next.unitsPerPallet <= 0) return fail("err.nonNegative");
            const before = stockStatus(item);
            w.items = w.items.map((i) => (i.id === id ? next : i));
            const entity: EntityRef = { type: "item", id };
            log(w, "inventory", "info", { key: "evt.itemUpdated", params: { item: next.name } }, entity);
            // A changed reorder level can move the item across a threshold.
            const after = stockStatus(next);
            if (after !== before) {
              resolveAlertsFor(w, entity, "inventory");
              if (after !== "healthy") {
                const key = after === "out" ? "stockOut" : after === "critical" ? "stockCritical" : "stockLow";
                raiseAlert(w, {
                  severity: after === "out" ? "critical" : "warning", category: "inventory",
                  title: { key: `alert.${key}.title`, params: { item: next.name } },
                  detail: { key: "alert.stock.detail", params: { sku: next.sku, qty: next.quantity, unit: next.unit, reorder: next.reorderLevel } },
                  entity,
                });
              }
            }
          }),

        adjustStock: (id, delta, reason, note) =>
          commit((w) => {
            const item = w.items.find((i) => i.id === id);
            if (!item) return fail("err.notFound");
            if (!Number.isFinite(delta) || delta === 0) return fail("err.adjustZero");
            // Negative on-hand is only allowed for consumption booked ahead of a pending receipt.
            if (item.quantity + delta < 0 && reason !== "pending_receipt") {
              return fail("err.stockNegative", { qty: item.quantity, unit: item.unit });
            }
            const type: MovementType = reason === "count" ? "count" : reason === "scrap" || reason === "damage" ? "scrap" : "adjustment";
            applyStock(w, id, delta, type, note ? `${reason}: ${note}` : reason);
            log(w, "inventory", "info", { key: "evt.stockAdjusted", params: { item: item.name, qty: delta > 0 ? `+${delta}` : String(delta), unit: item.unit } }, { type: "item", id });
          }),

        /* ---------------- Procurement ---------------- */
        createPurchaseOrder: (input) =>
          commit((w) => {
            const v = validatePo(w, input);
            if (v) return v;
            const id = nextId(w.purchaseOrders, "PO");
            const po: PurchaseOrder = {
              id, supplierId: input.supplierId, status: "draft", createdAt: w.now, expectedDate: input.expectedDate,
              requestedById: CURRENT_USER_ID, notes: input.notes,
              lines: input.lines.map((ln) => ({ itemId: ln.itemId, qty: ln.qty, receivedQty: 0, unitCost: w.items.find((i) => i.id === ln.itemId)!.unitCost })),
            };
            w.purchaseOrders = [po, ...w.purchaseOrders];
            log(w, "procurement", "info", { key: "evt.poCreated", params: { id } }, { type: "po", id });
            return ok(id);
          }),

        updatePurchaseOrder: (id, input) =>
          commit((w) => {
            const po = w.purchaseOrders.find((x) => x.id === id);
            if (!po) return fail("err.notFound");
            if (po.status !== "draft") return fail("err.poNotDraft");
            const v = validatePo(w, input);
            if (v) return v;
            patch(w, "purchaseOrders", id, {
              supplierId: input.supplierId, expectedDate: input.expectedDate, notes: input.notes,
              lines: input.lines.map((ln) => ({ itemId: ln.itemId, qty: ln.qty, receivedQty: 0, unitCost: w.items.find((i) => i.id === ln.itemId)!.unitCost })),
            });
            log(w, "procurement", "info", { key: "evt.poUpdated", params: { id } }, { type: "po", id });
          }),

        setPurchaseOrderStatus: (id, to, note) =>
          commit((w) => {
            const po = w.purchaseOrders.find((x) => x.id === id);
            if (!po) return fail("err.notFound");
            if (!PO_TRANSITIONS[po.status].includes(to)) return fail("err.poTransition", { from: `@postatus.${po.status}`, to: `@postatus.${to}` });
            const rejected = to === "cancelled" && po.status === "pending";
            patch(w, "purchaseOrders", id, {
              status: to,
              approvedById: to === "approved" ? CURRENT_USER_ID : po.approvedById,
              notes: note ? [po.notes, note].filter(Boolean).join(" · ") : po.notes,
            });
            const key = to === "pending" ? "evt.poSubmitted" : to === "approved" ? "evt.poApproved" : to === "ordered" ? "evt.poOrdered" : rejected ? "evt.poRejected" : "evt.poCancelled";
            log(w, "procurement", to === "approved" ? "success" : to === "cancelled" ? "warning" : "info", { key, params: { id } }, { type: "po", id }, { notify: to === "approved" || rejected });
          }),

        receivePurchaseOrder: (id, received) =>
          commit((w) => {
            const po = w.purchaseOrders.find((x) => x.id === id);
            if (!po) return fail("err.notFound");
            if (po.status !== "ordered" && po.status !== "partial") return fail("err.poNotReceivable");
            let total = 0;
            for (const ln of po.lines) {
              const q = received[ln.itemId] ?? 0;
              if (!Number.isFinite(q) || q < 0) return fail("err.nonNegative");
              if (q > ln.qty - ln.receivedQty) return fail("err.receiveAboveOutstanding", { sku: ln.itemId, qty: ln.qty - ln.receivedQty });
              total += q;
            }
            if (total <= 0) return fail("err.receiveNothing");
            const lines = po.lines.map((ln) => ({ ...ln, receivedQty: ln.receivedQty + (received[ln.itemId] ?? 0) }));
            const done = lines.every((ln) => ln.receivedQty >= ln.qty);
            patch(w, "purchaseOrders", id, { lines, status: done ? "received" : "partial" });
            const ref: EntityRef = { type: "po", id };
            for (const ln of po.lines) {
              const q = received[ln.itemId] ?? 0;
              if (q > 0) applyStock(w, ln.itemId, q, "receipt", undefined, ref);
            }
            log(w, "procurement", "success", { key: done ? "evt.poReceived" : "evt.poPartial", params: { id } }, ref, { notify: true });
          }),

        /* ---------------- Quality ---------------- */
        createInspection: (input) =>
          commit((w) => {
            const wo = w.workOrders.find((x) => x.id === input.workOrderId);
            if (!wo) return fail("err.notFound");
            if (wo.status === "cancelled" || wo.status === "draft") return fail("err.inspWoInvalid");
            const id = nextId(w.inspections, "QI");
            w.inspections = [
              { id, workOrderId: wo.id, productId: wo.productId, inspectorId: input.inspectorId, date: input.date, inspectedQty: 0, passedQty: 0, rejectedQty: 0, defects: [], status: "scheduled", notes: input.notes ?? "" },
              ...w.inspections,
            ];
            log(w, "quality", "info", { key: "evt.inspCreated", params: { id, wo: wo.id } }, { type: "inspection", id });
            return ok(id);
          }),

        recordInspection: (id, input) =>
          commit((w) => {
            const qi = w.inspections.find((x) => x.id === id);
            if (!qi) return fail("err.notFound");
            const wo = w.workOrders.find((x) => x.id === qi.workOrderId);
            if (!isInt(input.inspectedQty) || input.inspectedQty <= 0) return fail("err.qtyPositive");
            if (wo && input.inspectedQty > wo.completedQty) return fail("err.inspAboveProduced", { qty: wo.completedQty });
            const defects = input.defects.filter((d) => d.qty > 0);
            if (defects.some((d) => !isInt(d.qty))) return fail("err.qtyInteger");
            const rejectedQty = defects.reduce((s, d) => s + d.qty, 0);
            if (rejectedQty > input.inspectedQty) return fail("err.rejectedAboveInspected");
            const outcome = inspectionOutcome(input.inspectedQty, rejectedQty);
            patch(w, "inspections", id, {
              inspectedQty: input.inspectedQty, rejectedQty, passedQty: input.inspectedQty - rejectedQty,
              defects, notes: input.notes, status: outcome, date: w.now,
            });
            const ref: EntityRef = { type: "inspection", id };
            if (wo) {
              // The order's reject count can never be below what inspections have found.
              const found = w.inspections.filter((x) => x.workOrderId === wo.id).reduce((s, x) => s + x.rejectedQty, 0);
              if (found > wo.rejectedQty) patch(w, "workOrders", wo.id, { rejectedQty: Math.min(found, wo.completedQty) });
            }
            if (outcome === "failed") {
              raiseAlert(w, {
                severity: "warning", category: "quality",
                title: { key: "alert.qualityFail.title", params: { id } },
                detail: { key: "alert.qualityFail.detail", params: { id } },
                entity: ref,
              });
              log(w, "quality", "critical", { key: "evt.inspFailed", params: { id, wo: qi.workOrderId } }, ref, { notify: true });
            } else {
              log(w, "quality", outcome === "passed" ? "success" : "warning", { key: outcome === "passed" ? "evt.inspPassed" : "evt.inspConditional", params: { id, wo: qi.workOrderId } }, ref);
            }
          }),

        assignCorrectiveAction: (id, input) =>
          commit((w) => {
            const qi = w.inspections.find((x) => x.id === id);
            if (!qi) return fail("err.notFound");
            if (!input.description.trim()) return fail("err.required");
            const member = w.team.find((t) => t.id === input.assigneeId);
            if (!member) return fail("err.notFound");
            patch(w, "inspections", id, { correctiveAction: { ...input, status: "open" } });
            log(w, "quality", "info", { key: "evt.caAssigned", params: { id, name: member.name } }, { type: "inspection", id });
          }),

        resolveCorrectiveAction: (id) =>
          commit((w) => {
            const qi = w.inspections.find((x) => x.id === id);
            if (!qi?.correctiveAction) return fail("err.notFound");
            if (qi.correctiveAction.status === "resolved") return ok();
            patch(w, "inspections", id, { correctiveAction: { ...qi.correctiveAction, status: "resolved", resolvedAt: w.now } });
            const ref: EntityRef = { type: "inspection", id };
            resolveAlertsFor(w, ref, "quality");
            log(w, "quality", "success", { key: "evt.caResolved", params: { id } }, ref);
          }),

        /* ---------------- Maintenance ---------------- */
        createMaintenance: (input) =>
          commit((w) => {
            const mc = w.machines.find((x) => x.id === input.machineId);
            if (!mc) return fail("err.notFound");
            if (!input.description.trim()) return fail("err.required");
            if (!(input.estimatedHours > 0)) return fail("err.hoursPositive");
            const id = nextId(w.maintenanceOrders, "MO");
            const order: MaintenanceOrder = {
              id, machineId: mc.id, type: input.type, description: { en: input.description, ar: input.description },
              priority: input.priority, technicianId: input.technicianId, scheduledDate: input.scheduledDate,
              estimatedHours: input.estimatedHours, status: input.technicianId ? "scheduled" : "requested",
              progress: 0, cost: input.cost ?? 0, createdAt: w.now,
            };
            w.maintenanceOrders = [order, ...w.maintenanceOrders];
            log(w, "maintenance", "info", { key: "evt.maintCreated", params: { id, machine: mc.id } }, { type: "maintenance", id });
            return ok(id);
          }),

        updateMaintenance: (id, p) =>
          commit((w) => {
            const order = w.maintenanceOrders.find((x) => x.id === id);
            if (!order) return fail("err.notFound");
            if (!maintenanceIsOpen(order.status)) return fail("err.maintClosed");
            if (p.progress !== undefined) {
              if (order.status !== "in_progress") return fail("err.maintNotStarted");
              if (p.progress < 0 || p.progress > 100) return fail("err.progressRange");
            }
            if (p.estimatedHours !== undefined && !(p.estimatedHours > 0)) return fail("err.hoursPositive");
            const next = { ...order, ...p };
            if (next.technicianId && order.status === "requested") next.status = "scheduled";
            if (!next.technicianId && order.status === "scheduled") next.status = "requested";
            w.maintenanceOrders = w.maintenanceOrders.map((x) => (x.id === id ? next : x));
            const ref: EntityRef = { type: "maintenance", id };
            if (p.technicianId && p.technicianId !== order.technicianId) {
              const member = w.team.find((t) => t.id === p.technicianId);
              if (member) log(w, "maintenance", "info", { key: "evt.maintAssigned", params: { id, name: member.name } }, ref);
            } else if (p.scheduledDate !== undefined && p.scheduledDate !== order.scheduledDate) {
              log(w, "maintenance", "info", { key: "evt.maintScheduled", params: { id } }, ref);
            } else {
              log(w, "maintenance", "info", { key: "evt.maintUpdated", params: { id } }, ref);
            }
          }),

        startMaintenance: (id) =>
          commit((w) => {
            const order = w.maintenanceOrders.find((x) => x.id === id);
            if (!order) return fail("err.notFound");
            if (order.status !== "scheduled") return fail(order.status === "requested" ? "err.maintNeedsTech" : "err.maintClosed");
            patch(w, "maintenanceOrders", id, { status: "in_progress", progress: Math.max(order.progress, 5) });
            log(w, "maintenance", "info", { key: "evt.maintStarted", params: { id, machine: order.machineId } }, { type: "maintenance", id });
            // Taking the machine down cascades to its line and running order.
            const mc = w.machines.find((x) => x.id === order.machineId)!;
            if (mc.status !== "maintenance") {
              patch(w, "machines", mc.id, { status: "maintenance" });
              log(w, "maintenance", "warning", { key: "evt.machineStatus", params: { machine: mc.id, status: "@mstatus.maintenance" } }, { type: "machine", id: mc.id }, { notify: true });
              const line = w.lines.find((x) => x.id === mc.lineId)!;
              if (line.status !== "maintenance") {
                pauseActiveOrders(w, line.id, CURRENT_USER_ID);
                setLine(w, line.id, "maintenance", CURRENT_USER_ID);
              }
            }
          }),

        completeMaintenance: (id, cost) =>
          commit((w) => {
            const order = w.maintenanceOrders.find((x) => x.id === id);
            if (!order) return fail("err.notFound");
            if (order.status !== "in_progress") return fail("err.maintNotStarted");
            if (cost !== undefined && cost < 0) return fail("err.nonNegative");
            patch(w, "maintenanceOrders", id, { status: "completed", progress: 100, completedAt: w.now, cost: cost ?? order.cost });
            const mc = w.machines.find((x) => x.id === order.machineId)!;
            const mref: EntityRef = { type: "machine", id: mc.id };
            const otherOpen = w.maintenanceOrders.some((o) => o.id !== id && o.machineId === mc.id && o.status === "in_progress");
            patch(w, "machines", mc.id, {
              status: otherOpen ? mc.status : "idle",
              lastMaintenance: w.now,
              nextMaintenance: w.now + PM_INTERVAL_DAYS * DAY,
            });
            if (!otherOpen) {
              resolveAlertsFor(w, mref, "maintenance");
              const line = w.lines.find((x) => x.id === mc.lineId)!;
              const stillDown = w.machines.some((x) => x.lineId === line.id && machineIsDown(x));
              if (!stillDown && (line.status === "maintenance" || line.status === "stopped")) setLine(w, line.id, "idle", CURRENT_USER_ID);
            }
            log(w, "maintenance", "success", { key: "evt.maintCompleted", params: { id, machine: mc.id } }, { type: "maintenance", id }, { notify: true });
          }),

        cancelMaintenance: (id) =>
          commit((w) => {
            const order = w.maintenanceOrders.find((x) => x.id === id);
            if (!order) return fail("err.notFound");
            if (order.status !== "requested" && order.status !== "scheduled") return fail("err.maintClosed");
            patch(w, "maintenanceOrders", id, { status: "cancelled" });
            log(w, "maintenance", "warning", { key: "evt.maintCancelled", params: { id } }, { type: "maintenance", id });
          }),

        /* ---------------- Team ---------------- */
        updateMember: (id, p) =>
          commit((w) => {
            const member = w.team.find((t) => t.id === id);
            if (!member) return fail("err.notFound");
            patch(w, "team", id, p);
            log(w, "system", "info", { key: "evt.memberUpdated", params: { name: member.name } }, { type: "member", id });
          }),
      };
    },
    {
      name: "forge-demo-state",
      version: 1,
      skipHydration: true,
      partialize: (s) => {
        const out: Record<string, unknown> = { now: s.now, tick: s.tick, simRunning: s.simRunning, role: s.role };
        for (const k of DATA_KEYS) if (!STATIC_KEYS.includes(k)) out[k] = s[k];
        return out as unknown as ForgeState;
      },
    },
  ),
);

function validatePo(w: W, input: PoInput): Result | null {
  if (!w.suppliers.some((s) => s.id === input.supplierId)) return fail("err.poSupplier");
  if (input.lines.length === 0) return fail("err.poNoLines");
  const seen = new Set<ID>();
  for (const ln of input.lines) {
    if (!w.items.some((i) => i.id === ln.itemId)) return fail("err.notFound");
    if (seen.has(ln.itemId)) return fail("err.poDuplicateLine", { sku: ln.itemId });
    seen.add(ln.itemId);
    if (!(ln.qty > 0)) return fail("err.qtyPositive");
  }
  if (!Number.isFinite(input.expectedDate)) return fail("err.dateRequired");
  return null;
}

/** Convenience: the signed-in demo user. */
export function useCurrentUser(): TeamMember {
  return useForge((s) => s.team.find((t) => t.id === CURRENT_USER_ID)!);
}
