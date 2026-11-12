/**
 * Derived metrics. Pure functions over slices of the store — call them inside
 * useMemo with raw store slices (never return fresh objects from a zustand
 * selector).
 */
import type {
  DailyLineStat,
  DowntimeEvent,
  ID,
  InventoryItem,
  Machine,
  ProductionLine,
  QualityInspection,
  Shipment,
  WarehouseZone,
  WorkOrder,
} from "@/domain/types";
import { computeOee, machineIsDown, palletsUsed, stockStatus, stockValue, type Oee } from "@/domain/rules";
import { DAY, shiftAt, startOfDay } from "@/lib/time";

/* ------------------------------------------------------------------ */
/* Live (current shift)                                                */
/* ------------------------------------------------------------------ */

export interface LineLive extends Oee {
  lineId: ID;
  output: number;
  target: number;
  /** Output expected by now if the line were exactly on plan. */
  expected: number;
  /** output / expected */
  attainment: number;
  rejected: number;
  downtimeMin: number;
  /** Units per hour over the productive time so far. */
  rate: number;
}

export function lineLive(line: ProductionLine, now: number): LineLive {
  const shift = shiftAt(now);
  const elapsed = Math.max(1, shift.elapsedMin);
  const runMin = Math.max(0, elapsed - line.shiftDowntimeMin);
  const idealUnits = (line.nominalRate * runMin) / 60;
  const oee = computeOee({ plannedMin: elapsed, downtimeMin: Math.min(elapsed, line.shiftDowntimeMin), actual: line.shiftOutput, rejected: line.shiftRejected, idealUnits });
  const expected = line.shiftTarget * shift.progress;
  return {
    lineId: line.id,
    output: line.shiftOutput,
    target: line.shiftTarget,
    expected,
    attainment: expected > 0 ? line.shiftOutput / expected : 0,
    rejected: line.shiftRejected,
    downtimeMin: line.shiftDowntimeMin,
    rate: runMin > 0 ? (line.shiftOutput / runMin) * 60 : 0,
    ...oee,
  };
}

export interface NetworkLive extends Oee {
  output: number;
  target: number;
  expected: number;
  rejected: number;
  downtimeMin: number;
  activeLines: number;
  totalLines: number;
  /** Units per hour across all lines right now. */
  rate: number;
}

/** Network-wide current-shift figures. OEE is aggregated from raw inputs, not averaged. */
export function networkLive(lines: ProductionLine[], now: number): NetworkLive {
  const shift = shiftAt(now);
  const elapsed = Math.max(1, shift.elapsedMin);
  let output = 0, target = 0, rejected = 0, downtimeMin = 0, idealUnits = 0, rate = 0;
  for (const line of lines) {
    const runMin = Math.max(0, elapsed - line.shiftDowntimeMin);
    output += line.shiftOutput;
    target += line.shiftTarget;
    rejected += line.shiftRejected;
    downtimeMin += Math.min(elapsed, line.shiftDowntimeMin);
    idealUnits += (line.nominalRate * runMin) / 60;
    if (line.status === "running" && runMin > 0) rate += (line.shiftOutput / runMin) * 60;
  }
  const oee = computeOee({ plannedMin: elapsed * lines.length, downtimeMin, actual: output, rejected, idealUnits });
  return {
    output, target, expected: target * shift.progress, rejected, downtimeMin,
    activeLines: lines.filter((x) => x.status === "running").length,
    totalLines: lines.length,
    rate,
    ...oee,
  };
}

export function equipmentAvailability(machines: Machine[]): number {
  return machines.length ? machines.filter((mc) => !machineIsDown(mc)).length / machines.length : 0;
}

/* ------------------------------------------------------------------ */
/* History (daily stats)                                               */
/* ------------------------------------------------------------------ */

export interface DayAgg extends Oee {
  date: string;
  ts: number;
  planned: number;
  actual: number;
  good: number;
  rejected: number;
  plannedMin: number;
  downtimeMin: number;
  idealUnits: number;
}

export interface StatFilter {
  from?: number;
  to?: number;
  lineIds?: ID[];
  productId?: ID;
}

export function filterStats(stats: DailyLineStat[], f: StatFilter): DailyLineStat[] {
  return stats.filter(
    (s) =>
      (f.from === undefined || s.ts >= f.from) &&
      (f.to === undefined || s.ts <= f.to) &&
      (!f.lineIds || f.lineIds.includes(s.lineId)) &&
      (!f.productId || s.productId === f.productId),
  );
}

function emptyAgg(date: string, ts: number): DayAgg {
  return { date, ts, planned: 0, actual: 0, good: 0, rejected: 0, plannedMin: 0, downtimeMin: 0, idealUnits: 0, availability: 0, performance: 0, quality: 0, oee: 0 };
}

function addStat(a: DayAgg, s: DailyLineStat, rate: number) {
  a.planned += s.planned;
  a.actual += s.actual;
  a.rejected += s.rejected;
  a.good += s.actual - s.rejected;
  a.plannedMin += s.plannedMin;
  a.downtimeMin += s.downtimeMin;
  a.idealUnits += (rate * (s.plannedMin - s.downtimeMin)) / 60;
}

function finish(a: DayAgg): DayAgg {
  return Object.assign(a, computeOee(a));
}

/** One aggregated row per calendar day, ascending. */
export function aggregateByDay(stats: DailyLineStat[], lines: ProductionLine[]): DayAgg[] {
  const rate = new Map(lines.map((l) => [l.id, l.nominalRate]));
  const byDay = new Map<string, DayAgg>();
  for (const s of stats) {
    let a = byDay.get(s.date);
    if (!a) byDay.set(s.date, (a = emptyAgg(s.date, s.ts)));
    addStat(a, s, rate.get(s.lineId) ?? 0);
  }
  return [...byDay.values()].sort((x, y) => x.ts - y.ts).map(finish);
}

/** One aggregated row per production line. */
export function aggregateByLine(stats: DailyLineStat[], lines: ProductionLine[]): (DayAgg & { lineId: ID })[] {
  const out = new Map<ID, DayAgg & { lineId: ID }>();
  for (const line of lines) out.set(line.id, { ...emptyAgg("", 0), lineId: line.id });
  for (const s of stats) {
    const a = out.get(s.lineId);
    if (a) addStat(a, s, lines.find((l) => l.id === s.lineId)!.nominalRate);
  }
  return [...out.values()].map((a) => finish(a) as DayAgg & { lineId: ID });
}

export function aggregateTotal(stats: DailyLineStat[], lines: ProductionLine[]): DayAgg {
  const rate = new Map(lines.map((l) => [l.id, l.nominalRate]));
  const a = emptyAgg("", 0);
  for (const s of stats) addStat(a, s, rate.get(s.lineId) ?? 0);
  return finish(a);
}

/** Inclusive window of the last `days` completed days before `now`, plus the window before it. */
export function historyWindow(now: number, days: number): { from: number; to: number; prevFrom: number; prevTo: number } {
  const today = startOfDay(now);
  const to = today - 1;
  const from = today - days * DAY;
  return { from, to, prevFrom: from - days * DAY, prevTo: from - 1 };
}

export function downtimeInRange(events: DowntimeEvent[], f: StatFilter): DowntimeEvent[] {
  return events.filter(
    (e) => (f.from === undefined || e.start >= f.from) && (f.to === undefined || e.start <= f.to + DAY) && (!f.lineIds || f.lineIds.includes(e.lineId)),
  );
}

export function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): { key: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
}

/** Relative change, e.g. 0.042 = +4.2%. Null when there is no baseline. */
export function delta(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/* ------------------------------------------------------------------ */
/* Inventory & warehouse                                               */
/* ------------------------------------------------------------------ */

export function inventorySummary(items: InventoryItem[]) {
  let value = 0, low = 0, critical = 0, out = 0;
  for (const i of items) {
    value += stockValue(i);
    const st = stockStatus(i);
    if (st === "low") low++;
    else if (st === "critical") critical++;
    else if (st === "out") out++;
  }
  return { value, low, critical, out, attention: low + critical + out, count: items.length };
}

export interface ZoneUsage {
  zoneId: ID;
  capacity: number;
  used: number;
  free: number;
  occupancy: number;
  value: number;
  itemCount: number;
}

/**
 * Zone occupancy in pallet positions. Storage zones are driven by the items
 * stored there; docks and staging lanes by the shipments physically on site.
 */
export function zoneUsage(zone: WarehouseZone, items: InventoryItem[], shipments: Shipment[]): ZoneUsage {
  const here = items.filter((i) => i.zoneId === zone.id);
  let used = here.reduce((s, i) => s + palletsUsed(i), 0);
  if (here.length === 0 && (zone.kind === "dock" || zone.kind === "staging")) {
    const onSite = shipments.filter((sh) => sh.warehouseId === zone.warehouseId && (sh.status === "arrived" || sh.status === "loading"));
    const wantsInbound = zone.kind === "dock";
    used = onSite
      .filter((sh) => (zone.kind === "staging" ? sh.direction === "outbound" : wantsInbound))
      .reduce((s, sh) => s + sh.pallets, 0);
  }
  used = Math.min(used, zone.capacity);
  return {
    zoneId: zone.id,
    capacity: zone.capacity,
    used,
    free: zone.capacity - used,
    occupancy: zone.capacity > 0 ? used / zone.capacity : 0,
    value: here.reduce((s, i) => s + stockValue(i), 0),
    itemCount: here.length,
  };
}

/* ------------------------------------------------------------------ */
/* Quality                                                             */
/* ------------------------------------------------------------------ */

export function qualitySummary(inspections: QualityInspection[]) {
  let inspected = 0, passed = 0, rejected = 0, openIssues = 0;
  for (const q of inspections) {
    inspected += q.inspectedQty;
    passed += q.passedQty;
    rejected += q.rejectedQty;
    if (q.correctiveAction?.status === "open" || (q.status === "failed" && !q.correctiveAction)) openIssues++;
  }
  return { inspected, passed, rejected, openIssues, passRate: inspected ? passed / inspected : 0, defectRate: inspected ? rejected / inspected : 0 };
}

/* ------------------------------------------------------------------ */
/* Work orders                                                         */
/* ------------------------------------------------------------------ */

export function workOrderCounts(orders: WorkOrder[]) {
  const c = { draft: 0, scheduled: 0, in_progress: 0, paused: 0, completed: 0, cancelled: 0 };
  for (const o of orders) c[o.status]++;
  return c;
}

/** Orders completed inside [from, to]. */
export function completedBetween(orders: WorkOrder[], from: number, to: number): WorkOrder[] {
  return orders.filter((o) => o.status === "completed" && (o.completedAt ?? 0) >= from && (o.completedAt ?? 0) <= to);
}
