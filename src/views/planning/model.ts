/**
 * Planning workspace — pure layout and scheduling maths.
 * No React and no store access: everything is a function of its arguments,
 * so the views can memoise it.
 */
import type { ID, Priority, ProductionLine, WorkOrder } from "@/domain/types";
import { woConflicts, woIsOpen, woProgress } from "@/domain/rules";
import { HOUR, MIN, DAY, type ShiftId } from "@/lib/time";

export type Scale = "day" | "week";
export type Grouping = "line" | "order";
export type ColorMode = "status" | "product";

/** Geometry shared by the Gantt rows (px). */
export const HEADER_W = 176;
export const LANE_H = 40;
export const BAR_H = 34;
export const ROW_PAD = 5;
/** Minimum width of the time track so ticks stay legible (px). */
export const TRACK_MIN_W: Record<Scale, number> = { day: 936, week: 980 };

/** Pointer / keyboard step. */
export const SNAP: Record<Scale, number> = { day: 30 * MIN, week: 2 * HOUR };
/** Shift + arrow step. */
export const BIG_STEP: Record<Scale, number> = { day: 2 * HOUR, week: DAY };

export const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export interface TimeRange {
  start: number;
  end: number;
  span: number;
  scale: Scale;
  days: number;
}

export function makeRange(dayStart: number, scale: Scale): TimeRange {
  const days = scale === "day" ? 1 : 7;
  const end = addDays(dayStart, days);
  return { start: dayStart, end, span: end - dayStart, scale, days };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Position of a timestamp along the range, 0–1 (unclamped). */
export function frac(range: TimeRange, ts: number): number {
  return (ts - range.start) / range.span;
}

/* ------------------------------------------------------------------ */
/* Axis                                                                */
/* ------------------------------------------------------------------ */

export interface Segment {
  key: string;
  start: number;
  end: number;
  /** Percent from the inline start of the track. */
  left: number;
  /** Percent of the track. */
  width: number;
}

export interface ShiftSegment extends Segment {
  id: ShiftId;
}

/** Shift A 06–14, B 14–22, C 22–06, clipped to the range. */
export function shiftSegments(range: TimeRange): ShiftSegment[] {
  const out: ShiftSegment[] = [];
  for (let i = -1; i < range.days; i++) {
    const day = addDays(range.start, i);
    const defs: [ShiftId, number, number][] = [
      ["A", 6, 14],
      ["B", 14, 22],
      ["C", 22, 30],
    ];
    for (const [id, from, to] of defs) {
      const start = Math.max(range.start, day + from * HOUR);
      const end = Math.min(range.end, day + to * HOUR);
      if (end <= start) continue;
      out.push({ key: `${id}-${start}`, id, start, end, left: round(frac(range, start) * 100), width: round(((end - start) / range.span) * 100) });
    }
  }
  return out;
}

export function daySegments(range: TimeRange): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < range.days; i++) {
    const start = addDays(range.start, i);
    const end = addDays(range.start, i + 1);
    out.push({ key: String(start), start, end, left: round(frac(range, start) * 100), width: round(((end - start) / range.span) * 100) });
  }
  return out;
}

export interface Tick {
  ts: number;
  left: number;
  /** Shift boundary (day view) or day boundary (week view). */
  major: boolean;
}

export function ticks(range: TimeRange): Tick[] {
  const out: Tick[] = [];
  if (range.scale === "day") {
    for (let h = 0; h <= 24; h++) {
      const ts = range.start + h * HOUR;
      out.push({ ts, left: round(frac(range, ts) * 100), major: h === 6 || h === 14 || h === 22 });
    }
  } else {
    for (let i = 0; i <= range.days; i++) {
      const day = addDays(range.start, i);
      out.push({ ts: day, left: round(frac(range, day) * 100), major: true });
      if (i === range.days) break;
      for (const h of [6, 14, 22]) {
        const ts = day + h * HOUR;
        out.push({ ts, left: round(frac(range, ts) * 100), major: false });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export function isStarted(wo: WorkOrder): boolean {
  return wo.status === "in_progress" || wo.status === "paused";
}

/** Can the planned window still be changed? */
export function isMovable(wo: WorkOrder): boolean {
  return woIsOpen(wo);
}

/** Planned end falls after the due date. */
export function isLate(wo: WorkOrder): boolean {
  return woIsOpen(wo) && wo.plannedEnd > wo.dueDate;
}

/** Orders that occupy a line on the timeline. */
export function isPlaced(wo: WorkOrder): boolean {
  return wo.status !== "cancelled" && !!wo.lineId;
}

export function overlapsRange(wo: WorkOrder, range: Pick<TimeRange, "start" | "end">): boolean {
  return wo.plannedStart < range.end && wo.plannedEnd > range.start;
}

export function isUnscheduled(wo: WorkOrder): boolean {
  return wo.status === "draft" && !wo.lineId;
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

export interface Conflict {
  key: string;
  lineId: ID;
  a: WorkOrder;
  b: WorkOrder;
  /** Overlapping window. */
  from: number;
  to: number;
  /** Suggested resolution: `move` starts when `keep` ends. */
  move: WorkOrder;
  keep: WorkOrder;
  newStart: number;
  newEnd: number;
}

function pickMove(a: WorkOrder, b: WorkOrder): [move: WorkOrder, keep: WorkOrder] {
  // An order that is already running stays where it is.
  if (isStarted(a) !== isStarted(b)) return isStarted(a) ? [b, a] : [a, b];
  const ra = PRIORITY_RANK[a.priority];
  const rb = PRIORITY_RANK[b.priority];
  if (ra !== rb) return ra < rb ? [a, b] : [b, a];
  // Same priority: the later order gives way.
  if (a.plannedStart !== b.plannedStart) return a.plannedStart > b.plannedStart ? [a, b] : [b, a];
  return a.id > b.id ? [a, b] : [b, a];
}

/** Every pair of open orders that overlap on the same line. */
export function findConflicts(workOrders: WorkOrder[]): Conflict[] {
  const byLine = new Map<ID, WorkOrder[]>();
  for (const wo of workOrders) {
    if (!wo.lineId || !woIsOpen(wo) || wo.status === "draft") continue;
    const list = byLine.get(wo.lineId);
    if (list) list.push(wo);
    else byLine.set(wo.lineId, [wo]);
  }
  const out: Conflict[] = [];
  for (const [lineId, list] of byLine) {
    list.sort((x, y) => x.plannedStart - y.plannedStart || x.id.localeCompare(y.id));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (b.plannedStart >= a.plannedEnd) break;
        if (!woConflicts(a, b)) continue;
        const [move, keep] = pickMove(a, b);
        const newStart = keep.plannedEnd;
        out.push({
          key: `${a.id}|${b.id}`,
          lineId,
          a,
          b,
          from: Math.max(a.plannedStart, b.plannedStart),
          to: Math.min(a.plannedEnd, b.plannedEnd),
          move,
          keep,
          newStart,
          newEnd: newStart + (move.plannedEnd - move.plannedStart),
        });
      }
    }
  }
  return out.sort((x, y) => x.from - y.from || x.key.localeCompare(y.key));
}

export function conflictIdSet(conflicts: Conflict[]): Set<ID> {
  const s = new Set<ID>();
  for (const c of conflicts) {
    s.add(c.a.id);
    s.add(c.b.id);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Row layout                                                          */
/* ------------------------------------------------------------------ */

export interface BarLayout {
  wo: WorkOrder;
  /** Percent from the inline start of the track (clipped to the range). */
  left: number;
  width: number;
  clipStart: boolean;
  clipEnd: boolean;
  lane: number;
  conflict: boolean;
  late: boolean;
  /** Progress fill as a share of the visible bar, or null when not running. */
  fill: number | null;
}

export interface RowLayout {
  key: string;
  lineId: ID | null;
  bars: BarLayout[];
  lanes: number;
}

function makeBar(wo: WorkOrder, range: TimeRange, conflictIds: Set<ID>): BarLayout {
  const start = Math.max(wo.plannedStart, range.start);
  const end = Math.min(wo.plannedEnd, range.end);
  let fill: number | null = null;
  if (isStarted(wo)) {
    const point = wo.plannedStart + woProgress(wo) * (wo.plannedEnd - wo.plannedStart);
    fill = Math.round(clamp01((point - start) / Math.max(1, end - start)) * 200) / 200;
  }
  return {
    wo,
    left: round(frac(range, start) * 100),
    width: round(((end - start) / range.span) * 100),
    clipStart: wo.plannedStart < range.start,
    clipEnd: wo.plannedEnd > range.end,
    lane: 0,
    conflict: conflictIds.has(wo.id),
    late: isLate(wo),
    fill,
  };
}

/** Greedy interval packing: overlapping bars are stacked into sub-lanes. */
function packLanes(bars: BarLayout[]): number {
  bars.sort((x, y) => x.wo.plannedStart - y.wo.plannedStart || x.wo.id.localeCompare(y.wo.id));
  const laneEnd: number[] = [];
  for (const bar of bars) {
    let lane = laneEnd.findIndex((end) => end <= bar.wo.plannedStart);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = bar.wo.plannedEnd;
    bar.lane = lane;
  }
  return Math.max(1, laneEnd.length);
}

export function visibleOrders(workOrders: WorkOrder[], range: TimeRange): WorkOrder[] {
  return workOrders.filter((wo) => isPlaced(wo) && overlapsRange(wo, range));
}

/** One row per production line. */
export function layoutByLine(visible: WorkOrder[], lineIds: ID[], range: TimeRange, conflictIds: Set<ID>): RowLayout[] {
  return lineIds.map((lineId) => {
    const bars = visible.filter((wo) => wo.lineId === lineId).map((wo) => makeBar(wo, range, conflictIds));
    return { key: lineId, lineId, bars, lanes: packLanes(bars) };
  });
}

/** One row per work order, sorted by planned start. */
export function layoutByOrder(visible: WorkOrder[], range: TimeRange, conflictIds: Set<ID>): RowLayout[] {
  return [...visible]
    .sort((x, y) => x.plannedStart - y.plannedStart || x.id.localeCompare(y.id))
    .map((wo) => ({ key: wo.id, lineId: wo.lineId, bars: [makeBar(wo, range, conflictIds)], lanes: 1 }));
}

export function rowHeight(lanes: number): number {
  return lanes * LANE_H - (LANE_H - BAR_H) + ROW_PAD * 2;
}

/* ------------------------------------------------------------------ */
/* Capacity                                                            */
/* ------------------------------------------------------------------ */

export interface LineLoad {
  lineId: ID;
  /** Scheduled hours inside the range (overlapping orders count twice). */
  scheduledH: number;
  availableH: number;
  /** scheduledH / availableH — above 1 means the line is overbooked. */
  ratio: number;
}

/**
 * Capacity utilisation for the visible range.
 *   utilisation = scheduled hours ÷ available hours, available = range hours.
 * Draft and cancelled orders do not reserve capacity.
 */
export function capacity(workOrders: WorkOrder[], lines: Pick<ProductionLine, "id">[], range: TimeRange): { lines: LineLoad[]; overall: number; scheduledH: number; availableH: number } {
  const availableH = range.span / HOUR;
  const hours = new Map<ID, number>(lines.map((l) => [l.id, 0]));
  for (const wo of workOrders) {
    if (!wo.lineId || wo.status === "cancelled" || wo.status === "draft" || !hours.has(wo.lineId)) continue;
    const overlap = Math.min(wo.plannedEnd, range.end) - Math.max(wo.plannedStart, range.start);
    if (overlap > 0) hours.set(wo.lineId, hours.get(wo.lineId)! + overlap / HOUR);
  }
  const loads = lines.map((l) => {
    const scheduledH = Math.round(hours.get(l.id)! * 10) / 10;
    return { lineId: l.id, scheduledH, availableH, ratio: availableH > 0 ? scheduledH / availableH : 0 };
  });
  const scheduledH = loads.reduce((s, l) => s + l.scheduledH, 0);
  const total = availableH * lines.length;
  return { lines: loads, overall: total > 0 ? scheduledH / total : 0, scheduledH, availableH: total };
}
