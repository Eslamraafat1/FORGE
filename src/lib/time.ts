/**
 * Demo clock. The whole dataset is anchored to a fixed moment so every figure
 * is reproducible. The simulation advances this clock; it never reads the real
 * wall clock for business data.
 */
export const DEMO_EPOCH = new Date(2026, 10, 12, 9, 42, 0, 0).getTime();

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Simulated minutes added to the demo clock per simulation tick. */
export const SIM_MINUTES_PER_TICK = 1;
/** Real milliseconds between simulation ticks. */
export const SIM_INTERVAL_MS = 3000;

export const SHIFT_HOURS = 8;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type ShiftId = "A" | "B" | "C";

/** Shift A 06–14, B 14–22, C 22–06. */
export function shiftAt(ts: number): { id: ShiftId; start: number; end: number; elapsedMin: number; progress: number } {
  const d = new Date(ts);
  const h = d.getHours();
  const sod = startOfDay(ts);
  let id: ShiftId;
  let start: number;
  if (h >= 6 && h < 14) {
    id = "A";
    start = sod + 6 * HOUR;
  } else if (h >= 14 && h < 22) {
    id = "B";
    start = sod + 14 * HOUR;
  } else {
    id = "C";
    start = h >= 22 ? sod + 22 * HOUR : sod - 2 * HOUR;
  }
  const end = start + SHIFT_HOURS * HOUR;
  const elapsedMin = Math.max(0, Math.round((ts - start) / MIN));
  return { id, start, end, elapsedMin, progress: Math.min(1, elapsedMin / (SHIFT_HOURS * 60)) };
}

/** <input type="datetime-local"> value for a timestamp, in local time. */
export function toInputDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toInputDate(ts: number): string {
  return toInputDateTime(ts).slice(0, 10);
}

export function fromInput(value: string): number {
  if (!value) return NaN;
  // Date-only strings would be parsed as UTC; force local midnight.
  return new Date(value.length === 10 ? `${value}T00:00` : value).getTime();
}
