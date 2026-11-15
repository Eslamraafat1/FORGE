/**
 * Analytics scope: applies the global filters once and hands every section the
 * same filtered history, so figures agree across tabs. Pure — no React.
 */
import type { DailyLineStat, DowntimeEvent, ID, InventoryCategory, InventoryItem, ProductionLine, QualityInspection, Warehouse, WorkOrder } from "@/domain/types";
import { aggregateByDay, aggregateByLine, aggregateTotal, downtimeInRange, filterStats, historyWindow, type DayAgg } from "@/store/selectors";

export type RangeDays = 7 | 14 | 30 | 60;

export interface AnalyticsFilters {
  days: RangeDays;
  factoryId: ID | "";
  lineId: ID | "";
  productId: ID | "";
  invCategory: InventoryCategory | "";
}

export const DEFAULT_FILTERS: AnalyticsFilters = { days: 30, factoryId: "", lineId: "", productId: "", invCategory: "" };

export interface AnalyticsScope {
  filters: AnalyticsFilters;
  from: number;
  to: number;
  /** Lines selected by the factory / line filters. */
  lines: ProductionLine[];
  /** Selected lines that actually have history rows in the window (after the product filter). */
  activeLines: ProductionLine[];
  stats: DailyLineStat[];
  byDay: DayAgg[];
  byLine: (DayAgg & { lineId: ID })[];
  total: DayAgg;
  /** Totals of the previous equal period; null when the history does not reach that far. */
  prev: DayAgg | null;
  events: DowntimeEvent[];
  prevEvents: DowntimeEvent[] | null;
  inspections: QualityInspection[];
  items: InventoryItem[];
  /** Items in the factory scope, before the category filter. */
  factoryItems: InventoryItem[];
  warehouses: Warehouse[];
  empty: boolean;
}

export function buildScope(input: {
  filters: AnalyticsFilters;
  now: number;
  lines: ProductionLine[];
  dailyStats: DailyLineStat[];
  downtimeEvents: DowntimeEvent[];
  inspections: QualityInspection[];
  workOrders: WorkOrder[];
  items: InventoryItem[];
  warehouses: Warehouse[];
}): AnalyticsScope {
  const { filters: f, lines } = input;
  const win = historyWindow(input.now, f.days);
  const scoped = lines.filter((l) => (!f.factoryId || l.factoryId === f.factoryId) && (!f.lineId || l.id === f.lineId));
  const lineIds = scoped.map((l) => l.id);
  const productId = f.productId || undefined;

  const stats = filterStats(input.dailyStats, { from: win.from, to: win.to, lineIds, productId });
  const prevStats = filterStats(input.dailyStats, { from: win.prevFrom, to: win.prevTo, lineIds, productId });
  const withData = new Set(stats.map((s) => s.lineId));
  const activeLines = scoped.filter((l) => withData.has(l.id));
  const activeIds = activeLines.map((l) => l.id);

  // downtimeInRange is inclusive of the day after `to`; clamp to the window so periods never overlap.
  const eventsIn = (from: number, to: number, ids: ID[]) => downtimeInRange(input.downtimeEvents, { from, to, lineIds: ids }).filter((e) => e.start <= to);
  const prevIds = [...new Set(prevStats.map((s) => s.lineId))];

  const woLine = new Map(input.workOrders.map((w) => [w.id, w.lineId]));
  const inspections = input.inspections.filter((q) => {
    if (q.inspectedQty <= 0 || q.date < win.from || q.date > win.to) return false;
    if (productId && q.productId !== productId) return false;
    if (!f.factoryId && !f.lineId) return true;
    const lineId = woLine.get(q.workOrderId);
    return !!lineId && lineIds.includes(lineId);
  });

  const warehouses = input.warehouses.filter((w) => !f.factoryId || w.factoryId === f.factoryId);
  const whIds = new Set(warehouses.map((w) => w.id));
  const factoryItems = input.items.filter((i) => whIds.has(i.warehouseId));
  const items = f.invCategory ? factoryItems.filter((i) => i.category === f.invCategory) : factoryItems;

  return {
    filters: f,
    from: win.from,
    to: win.to,
    lines: scoped,
    activeLines,
    stats,
    byDay: aggregateByDay(stats, lines),
    byLine: aggregateByLine(stats, activeLines),
    total: aggregateTotal(stats, lines),
    prev: prevStats.length > 0 ? aggregateTotal(prevStats, lines) : null,
    events: eventsIn(win.from, win.to, activeIds),
    prevEvents: prevStats.length > 0 ? eventsIn(win.prevFrom, win.prevTo, prevIds) : null,
    inspections,
    items,
    factoryItems,
    warehouses,
    empty: stats.length === 0,
  };
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
