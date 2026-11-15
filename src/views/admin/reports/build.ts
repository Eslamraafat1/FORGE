/**
 * Report builders — pure functions, no React.
 *
 * Each builder turns raw store slices + filters into one `Report` structure.
 * The on-screen sheet, the printed page and the CSV export are all rendered
 * from that same structure, so they can never disagree.
 */
import type {
  ForgeData,
  ID,
  InspectionStatus,
  InventoryCategory,
  MaintenanceStatus,
  ProductionLine,
  PurchaseOrderStatus,
  StockStatus,
} from "@/domain/types";
import { poReceivedRatio, poValue, stockStatus, stockValue } from "@/domain/rules";
import { aggregateByLine, aggregateTotal, filterStats, lineLive, networkLive, qualitySummary, sumBy } from "@/store/selectors";
import type { ReportId } from "@/components/shell/nav";
import type { I18n } from "@/i18n";
import type { CsvCell } from "@/lib/csv";
import type { Fmt } from "@/lib/format";
import { DAY, dayKey, shiftAt } from "@/lib/time";

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * How a raw cell value is presented:
 *  text / code — strings · int / decimal — numbers · pct — ratio (0.93)
 *  money / money2 — USD · date / datetime — epoch ms · minutes — duration
 */
export type CellKind = "text" | "code" | "int" | "decimal" | "pct" | "money" | "money2" | "date" | "datetime" | "minutes";
export type ReportValue = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  align: "start" | "end";
  kind: CellKind;
}

export interface ReportRow {
  id: string;
  cells: Record<string, ReportValue>;
}

export interface Report {
  id: ReportId;
  title: string;
  subtitle: string;
  /** Snapshot reports describe "now" and ignore the date range. */
  snapshot: boolean;
  /** Simulated timestamp the report was generated at. */
  generatedAt: number;
  /** Human-readable list of the filters that were applied. */
  filters: { label: string; value: string }[];
  summary: { label: string; value: string }[];
  notes: string[];
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Totals row (same keys as the columns), when a total is meaningful. */
  totals: ReportRow | null;
}

export interface ReportFilters {
  /** Inclusive range, epoch ms (start of first day … end of last day). */
  from: number;
  to: number;
  /** Contextual filters; an empty string means "all". */
  factoryId: string;
  lineId: string;
  category: string;
  status: string;
  supplierId: string;
}

export type ContextFilterKey = "factoryId" | "lineId" | "category" | "status" | "supplierId";

export const EMPTY_CONTEXT: Pick<ReportFilters, ContextFilterKey> = { factoryId: "", lineId: "", category: "", status: "", supplierId: "" };

const STOCK_STATUSES: readonly StockStatus[] = ["healthy", "low", "critical", "out"];
const INSPECTION_STATUSES: readonly InspectionStatus[] = ["scheduled", "in_progress", "passed", "conditional", "failed"];
const MAINT_STATUSES: readonly MaintenanceStatus[] = ["requested", "scheduled", "in_progress", "completed", "cancelled"];
const PO_STATUSES: readonly PurchaseOrderStatus[] = ["draft", "pending", "approved", "ordered", "partial", "received", "cancelled"];
export const INVENTORY_CATEGORIES: readonly InventoryCategory[] = ["raw", "component", "wip", "finished", "packaging", "spare"];

/** Which filters each report understands. Drives both the filter bar and the builders. */
export const REPORT_META: Record<ReportId, { snapshot: boolean; filters: ContextFilterKey[]; statuses?: { prefix: string; values: readonly string[] } }> = {
  production: { snapshot: false, filters: ["factoryId", "lineId"] },
  shift: { snapshot: true, filters: ["factoryId", "lineId"] },
  inventory: { snapshot: true, filters: ["factoryId", "category", "status"], statuses: { prefix: "stock", values: STOCK_STATUSES } },
  quality: { snapshot: false, filters: ["status"], statuses: { prefix: "qstatus", values: INSPECTION_STATUSES } },
  maintenance: { snapshot: false, filters: ["factoryId", "status"], statuses: { prefix: "mntstatus", values: MAINT_STATUSES } },
  downtime: { snapshot: false, filters: ["factoryId", "lineId"] },
  procurement: { snapshot: false, filters: ["supplierId", "status"], statuses: { prefix: "postatus", values: PO_STATUSES } },
};

/** Everything a builder may need from the store. */
export type ReportData = Pick<
  ForgeData,
  | "factories"
  | "products"
  | "lines"
  | "machines"
  | "dailyStats"
  | "downtimeEvents"
  | "items"
  | "warehouses"
  | "suppliers"
  | "purchaseOrders"
  | "inspections"
  | "maintenanceOrders"
  | "team"
>;

/** Localisation + formatting helpers, and the simulated "now". */
export interface ReportCtx {
  t: I18n["t"];
  td: I18n["td"];
  tl: I18n["tl"];
  fmt: Fmt;
  now: number;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const col = (key: string, label: string, kind: CellKind = "text"): ReportColumn => ({
  key,
  label,
  kind,
  align: kind === "text" || kind === "code" || kind === "date" || kind === "datetime" ? "start" : "end",
});

const inRange = (ts: number | undefined, f: ReportFilters) => ts !== undefined && ts >= f.from && ts <= f.to;

function index<T extends { id: ID }>(list: T[]): (id: ID | null | undefined) => T | undefined {
  const m = new Map(list.map((x) => [x.id, x]));
  return (id) => (id ? m.get(id) : undefined);
}

/**
 * Drop filter values that do not apply to the report (e.g. a stock status left
 * over from another report, or a line outside the chosen factory).
 */
export function sanitizeFilters(id: ReportId, f: ReportFilters, lines: ProductionLine[]): ReportFilters {
  const meta = REPORT_META[id];
  const has = (k: ContextFilterKey) => meta.filters.includes(k);
  const factoryId = has("factoryId") ? f.factoryId : "";
  const line = has("lineId") ? lines.find((l) => l.id === f.lineId) : undefined;
  return {
    from: Math.min(f.from, f.to),
    to: Math.max(f.from, f.to),
    factoryId,
    lineId: line && (!factoryId || line.factoryId === factoryId) ? line.id : "",
    category: has("category") ? f.category : "",
    status: has("status") && meta.statuses?.values.includes(f.status) ? f.status : "",
    supplierId: has("supplierId") ? f.supplierId : "",
  };
}

function scopeLines(lines: ProductionLine[], f: ReportFilters): ProductionLine[] {
  return lines.filter((l) => (!f.factoryId || l.factoryId === f.factoryId) && (!f.lineId || l.id === f.lineId));
}

function appliedFilters(id: ReportId, data: Pick<ReportData, "factories" | "lines" | "suppliers">, f: ReportFilters, ctx: ReportCtx): Report["filters"] {
  const meta = REPORT_META[id];
  const all = ctx.t("common.all");
  const out: Report["filters"] = [];
  if (meta.snapshot) out.push({ label: ctx.t("reports.filter.asOf"), value: ctx.fmt.dateTime(ctx.now) });
  else out.push({ label: ctx.t("common.dateRange"), value: `${ctx.fmt.date(f.from)} – ${ctx.fmt.date(f.to)}` });
  for (const key of meta.filters) {
    if (key === "factoryId") {
      const factory = data.factories.find((x) => x.id === f.factoryId);
      out.push({ label: ctx.t("common.factory"), value: factory ? ctx.tl(factory.name) : all });
    } else if (key === "lineId") {
      const line = data.lines.find((x) => x.id === f.lineId);
      out.push({ label: ctx.t("common.line"), value: line ? `${line.code} · ${ctx.tl(line.name)}` : all });
    } else if (key === "category") {
      out.push({ label: ctx.t("common.category"), value: f.category ? ctx.td(`invcat.${f.category}`) : all });
    } else if (key === "status") {
      out.push({ label: ctx.t("common.status"), value: f.status && meta.statuses ? ctx.td(`${meta.statuses.prefix}.${f.status}`) : all });
    } else {
      const supplier = data.suppliers.find((x) => x.id === f.supplierId);
      out.push({ label: ctx.t("common.supplier"), value: supplier ? supplier.name : all });
    }
  }
  return out;
}

function shell(id: ReportId, data: Pick<ReportData, "factories" | "lines" | "suppliers">, f: ReportFilters, ctx: ReportCtx) {
  return {
    id,
    title: ctx.td(`reports.type.${id}`),
    snapshot: REPORT_META[id].snapshot,
    generatedAt: ctx.now,
    filters: appliedFilters(id, data, f, ctx),
  };
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pctOrDash = (v: number | null, ctx: ReportCtx) => (v === null ? ctx.t("common.notAvailable") : ctx.fmt.pct(v));

/* ------------------------------------------------------------------ */
/* 1 · Production Summary                                              */
/* ------------------------------------------------------------------ */

export function buildProductionReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "dailyStats">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, tl, fmt } = ctx;
  const lines = scopeLines(data.lines, f);
  const stats = filterStats(data.dailyStats, { from: f.from, to: f.to, lineIds: lines.map((l) => l.id) });
  const byLine = aggregateByLine(stats, lines);
  const total = aggregateTotal(stats, lines);
  const days = new Set(stats.map((s) => s.date)).size;
  const line = index(lines);

  const cells = (a: (typeof byLine)[number] | typeof total): Record<string, ReportValue> => {
    const ran = a.plannedMin > 0;
    return {
      planned: a.planned,
      actual: a.actual,
      good: a.good,
      rejected: a.rejected,
      attainment: ratio(a.actual, a.planned),
      availability: ran ? a.availability : null,
      performance: ran ? a.performance : null,
      quality: ran ? a.quality : null,
      oee: ran ? a.oee : null,
    };
  };

  return {
    ...shell("production", data, f, ctx),
    subtitle: t("reports.sub.production", { days }),
    notes: [t("reports.note.production"), t("reports.note.oee")],
    summary: [
      { label: t("reports.sum.productionDays"), value: fmt.num(days) },
      { label: t("reports.col.planned"), value: fmt.num(total.planned) },
      { label: t("reports.col.actual"), value: fmt.num(total.actual) },
      { label: t("reports.col.attainment"), value: pctOrDash(ratio(total.actual, total.planned), ctx) },
      { label: t("reports.sum.rejectRate"), value: pctOrDash(ratio(total.rejected, total.actual), ctx) },
      { label: t("common.oee"), value: total.plannedMin > 0 ? fmt.pct(total.oee) : t("common.notAvailable") },
    ],
    columns: [
      col("line", t("reports.col.line"), "code"),
      col("name", t("reports.col.lineName")),
      col("planned", t("reports.col.planned"), "int"),
      col("actual", t("reports.col.actual"), "int"),
      col("good", t("reports.col.good"), "int"),
      col("rejected", t("reports.col.rejected"), "int"),
      col("attainment", t("reports.col.attainment"), "pct"),
      col("availability", t("common.availability"), "pct"),
      col("performance", t("common.performance"), "pct"),
      col("quality", t("common.quality"), "pct"),
      col("oee", t("common.oee"), "pct"),
    ],
    rows: byLine.map((a) => {
      const l = line(a.lineId)!;
      return { id: a.lineId, cells: { line: l.code, name: tl(l.name), ...cells(a) } };
    }),
    totals: lines.length > 1 ? { id: "total", cells: { line: t("common.total"), name: "", ...cells(total) } } : null,
  };
}

/* ------------------------------------------------------------------ */
/* 2 · Shift Performance (live snapshot)                               */
/* ------------------------------------------------------------------ */

export function buildShiftReport(data: Pick<ReportData, "factories" | "lines" | "suppliers">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, tl, fmt, now } = ctx;
  const lines = scopeLines(data.lines, f);
  const shift = shiftAt(now);
  const net = networkLive(lines, now);

  return {
    ...shell("shift", data, f, ctx),
    subtitle: t("reports.sub.shift", { shift: `@shift.${shift.id}`, time: fmt.time(now) }),
    notes: [t("reports.note.shift"), t("reports.note.oee")],
    summary: [
      { label: t("reports.sum.shift"), value: td(`shift.${shift.id}`) },
      { label: t("reports.sum.elapsed"), value: fmt.duration(shift.elapsedMin) },
      { label: t("reports.sum.activeLines"), value: `${fmt.num(net.activeLines)} / ${fmt.num(net.totalLines)}` },
      { label: t("reports.col.output"), value: `${fmt.num(net.output)} / ${fmt.num(net.target)}` },
      { label: t("reports.col.attainment"), value: pctOrDash(ratio(net.output, net.expected), ctx) },
      { label: t("common.oee"), value: lines.length ? fmt.pct(net.oee) : t("common.notAvailable") },
    ],
    columns: [
      col("line", t("reports.col.line"), "code"),
      col("name", t("reports.col.lineName")),
      col("status", t("common.status")),
      col("target", t("reports.col.target"), "int"),
      col("output", t("reports.col.output"), "int"),
      col("expected", t("reports.col.expected"), "int"),
      col("attainment", t("reports.col.attainment"), "pct"),
      col("rate", t("reports.col.rate"), "decimal"),
      col("rejected", t("reports.col.rejected"), "int"),
      col("downtime", t("common.downtime"), "minutes"),
      col("oee", t("common.oee"), "pct"),
    ],
    rows: lines.map((l) => {
      const live = lineLive(l, now);
      return {
        id: l.id,
        cells: {
          line: l.code,
          name: tl(l.name),
          status: td(`lstatus.${l.status}`),
          target: live.target,
          output: live.output,
          expected: Math.round(live.expected),
          attainment: ratio(live.output, live.expected),
          rate: live.rate,
          rejected: live.rejected,
          downtime: live.downtimeMin,
          oee: live.oee,
        },
      };
    }),
    totals:
      lines.length > 1
        ? {
            id: "total",
            cells: {
              line: t("common.total"),
              name: "",
              status: "",
              target: net.target,
              output: net.output,
              expected: Math.round(net.expected),
              attainment: ratio(net.output, net.expected),
              rate: net.rate,
              rejected: net.rejected,
              downtime: net.downtimeMin,
              oee: net.oee,
            },
          }
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* 3 · Inventory Valuation (snapshot)                                  */
/* ------------------------------------------------------------------ */

export function buildInventoryReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "items" | "warehouses">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, tl, fmt } = ctx;
  const warehouse = index(data.warehouses);
  const order = new Map(INVENTORY_CATEGORIES.map((c, i) => [c, i]));
  const items = data.items
    .filter(
      (i) =>
        (!f.factoryId || warehouse(i.warehouseId)?.factoryId === f.factoryId) &&
        (!f.category || i.category === f.category) &&
        (!f.status || stockStatus(i) === f.status),
    )
    .sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0) || a.sku.localeCompare(b.sku));

  const value = items.reduce((s, i) => s + stockValue(i), 0);
  const attention = items.filter((i) => stockStatus(i) !== "healthy").length;
  const byCategory = sumBy(items, (i) => i.category, stockValue);

  return {
    ...shell("inventory", data, f, ctx),
    subtitle: t("reports.sub.inventory", { time: fmt.dateTime(ctx.now) }),
    notes: [t("reports.note.inventory")],
    summary: [
      { label: t("reports.sum.items"), value: fmt.num(items.length) },
      { label: t("reports.sum.totalValue"), value: fmt.money(value) },
      { label: t("reports.sum.belowReorder"), value: fmt.num(attention) },
      ...byCategory.map((c) => ({ label: td(`invcat.${c.key}`), value: `${fmt.money(c.value)} · ${pctOrDash(ratio(c.value, value), ctx)}` })),
    ],
    columns: [
      col("sku", t("common.sku"), "code"),
      col("name", t("common.name")),
      col("category", t("common.category")),
      col("warehouse", t("common.warehouse")),
      col("qty", t("common.quantity"), "decimal"),
      col("unit", t("common.unit")),
      col("unitCost", t("reports.col.unitCost"), "money2"),
      col("value", t("common.value"), "money2"),
      col("status", t("common.status")),
    ],
    rows: items.map((i) => {
      const wh = warehouse(i.warehouseId);
      return {
        id: i.id,
        cells: {
          sku: i.sku,
          name: tl(i.name),
          category: td(`invcat.${i.category}`),
          warehouse: wh ? tl(wh.name) : "",
          qty: i.quantity,
          unit: i.unit,
          unitCost: i.unitCost,
          value: stockValue(i),
          status: td(`stock.${stockStatus(i)}`),
        },
      };
    }),
    totals: items.length ? { id: "total", cells: { sku: t("common.total"), name: "", category: "", warehouse: "", qty: null, unit: "", unitCost: null, value, status: "" } } : null,
  };
}

/* ------------------------------------------------------------------ */
/* 4 · Quality Report                                                  */
/* ------------------------------------------------------------------ */

export function buildQualityReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "inspections" | "products">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, tl, fmt } = ctx;
  const product = index(data.products);
  const rows = data.inspections.filter((q) => inRange(q.date, f) && (!f.status || q.status === f.status)).sort((a, b) => b.date - a.date);
  const sum = qualitySummary(rows);
  const failed = rows.filter((q) => q.status === "failed").length;

  return {
    ...shell("quality", data, f, ctx),
    subtitle: t("reports.sub.quality", { n: rows.length }),
    notes: [t("reports.note.quality")],
    summary: [
      { label: t("reports.sum.inspections"), value: fmt.num(rows.length) },
      { label: t("reports.col.inspected"), value: fmt.num(sum.inspected) },
      { label: t("reports.sum.passRate"), value: pctOrDash(ratio(sum.passed, sum.inspected), ctx) },
      { label: t("reports.col.rejectRate"), value: pctOrDash(ratio(sum.rejected, sum.inspected), ctx) },
      { label: t("reports.sum.failed"), value: fmt.num(failed) },
      { label: t("reports.sum.openIssues"), value: fmt.num(sum.openIssues) },
    ],
    columns: [
      col("id", t("reports.col.inspection"), "code"),
      col("wo", t("common.workOrder"), "code"),
      col("product", t("common.product")),
      col("date", t("common.date"), "date"),
      col("inspected", t("reports.col.inspected"), "int"),
      col("passed", t("reports.col.passed"), "int"),
      col("rejected", t("reports.col.rejected"), "int"),
      col("rejectRate", t("reports.col.rejectRate"), "pct"),
      col("status", t("common.status")),
      col("ca", t("reports.col.correctiveAction")),
    ],
    rows: rows.map((q) => {
      const p = product(q.productId);
      return {
        id: q.id,
        cells: {
          id: q.id,
          wo: q.workOrderId,
          product: p ? tl(p.name) : "",
          date: q.date,
          inspected: q.inspectedQty,
          passed: q.passedQty,
          rejected: q.rejectedQty,
          rejectRate: ratio(q.rejectedQty, q.inspectedQty),
          status: td(`qstatus.${q.status}`),
          ca: q.correctiveAction ? td(`castatus.${q.correctiveAction.status}`) : q.status === "failed" ? t("reports.ca.required") : t("reports.ca.none"),
        },
      };
    }),
    totals: rows.length
      ? {
          id: "total",
          cells: { id: t("common.total"), wo: "", product: "", date: null, inspected: sum.inspected, passed: sum.passed, rejected: sum.rejected, rejectRate: ratio(sum.rejected, sum.inspected), status: "", ca: "" },
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* 5 · Maintenance Report                                              */
/* ------------------------------------------------------------------ */

export function buildMaintenanceReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "maintenanceOrders" | "machines" | "team">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, tl, fmt } = ctx;
  const machine = index(data.machines);
  const member = index(data.team);
  const rows = data.maintenanceOrders
    .filter(
      (o) =>
        (inRange(o.scheduledDate, f) || inRange(o.createdAt, f) || inRange(o.completedAt, f)) &&
        (!f.status || o.status === f.status) &&
        (!f.factoryId || machine(o.machineId)?.factoryId === f.factoryId),
    )
    .sort((a, b) => b.scheduledDate - a.scheduledDate);

  const hours = rows.reduce((s, o) => s + o.estimatedHours, 0);
  const cost = rows.reduce((s, o) => s + o.cost, 0);
  const byStatus = MAINT_STATUSES.map((s) => ({ status: s, n: rows.filter((o) => o.status === s).length })).filter((x) => x.n > 0);

  return {
    ...shell("maintenance", data, f, ctx),
    subtitle: t("reports.sub.maintenance", { n: rows.length }),
    notes: [t("reports.note.maintenance")],
    summary: [
      { label: t("reports.sum.orders"), value: fmt.num(rows.length) },
      ...byStatus.map((x) => ({ label: td(`mntstatus.${x.status}`), value: fmt.num(x.n) })),
      { label: t("reports.sum.totalHours"), value: fmt.num(hours, 1) },
      { label: t("reports.sum.totalCost"), value: fmt.money(cost) },
    ],
    columns: [
      col("id", t("reports.col.order"), "code"),
      col("machine", t("common.machine"), "code"),
      col("type", t("common.type")),
      col("priority", t("common.priority")),
      col("technician", t("common.technician")),
      col("scheduled", t("reports.col.scheduled"), "date"),
      col("status", t("common.status")),
      col("hours", t("reports.col.hours"), "decimal"),
      col("cost", t("common.cost"), "money"),
    ],
    rows: rows.map((o) => {
      const tech = member(o.technicianId);
      return {
        id: o.id,
        cells: {
          id: o.id,
          machine: o.machineId,
          type: td(`mnttype.${o.type}`),
          priority: td(`priority.${o.priority}`),
          technician: tech ? tl(tech.name) : t("common.unassigned"),
          scheduled: o.scheduledDate,
          status: td(`mntstatus.${o.status}`),
          hours: o.estimatedHours,
          cost: o.cost,
        },
      };
    }),
    totals: rows.length ? { id: "total", cells: { id: t("common.total"), machine: "", type: "", priority: "", technician: "", scheduled: null, status: "", hours, cost } } : null,
  };
}

/* ------------------------------------------------------------------ */
/* 6 · Downtime Report                                                 */
/* ------------------------------------------------------------------ */

export function buildDowntimeReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "downtimeEvents">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, tl, fmt } = ctx;
  const lines = scopeLines(data.lines, f);
  const line = index(lines);
  const rows = data.downtimeEvents.filter((e) => inRange(e.start, f) && !!line(e.lineId)).sort((a, b) => b.start - a.start);
  const minutes = rows.reduce((s, e) => s + e.minutes, 0);
  const byCause = sumBy(rows, (e) => e.cause, (e) => e.minutes);

  return {
    ...shell("downtime", data, f, ctx),
    subtitle: t("reports.sub.downtime", { n: rows.length }),
    notes: [t("reports.note.downtime")],
    summary: [
      { label: t("reports.sum.events"), value: fmt.num(rows.length) },
      { label: t("reports.sum.totalDowntime"), value: fmt.duration(minutes) },
      { label: t("reports.sum.avgEvent"), value: rows.length ? fmt.duration(minutes / rows.length) : t("common.notAvailable") },
      ...byCause.map((c) => ({ label: td(`cause.${c.key}`), value: `${fmt.duration(c.value)} · ${pctOrDash(ratio(c.value, minutes), ctx)}` })),
    ],
    columns: [
      col("start", t("reports.col.started"), "datetime"),
      col("line", t("reports.col.line"), "code"),
      col("name", t("reports.col.lineName")),
      col("machine", t("common.machine"), "code"),
      col("cause", t("reports.col.cause")),
      col("minutes", t("reports.col.duration"), "minutes"),
    ],
    rows: rows.map((e) => {
      const l = line(e.lineId)!;
      return { id: e.id, cells: { start: e.start, line: l.code, name: tl(l.name), machine: e.machineId, cause: td(`cause.${e.cause}`), minutes: e.minutes } };
    }),
    totals: rows.length ? { id: "total", cells: { start: null, line: t("common.total"), name: "", machine: "", cause: "", minutes } } : null,
  };
}

/* ------------------------------------------------------------------ */
/* 7 · Procurement Report                                              */
/* ------------------------------------------------------------------ */

export function buildProcurementReport(data: Pick<ReportData, "factories" | "lines" | "suppliers" | "purchaseOrders">, f: ReportFilters, ctx: ReportCtx): Report {
  const { t, td, fmt } = ctx;
  const supplier = index(data.suppliers);
  const rows = data.purchaseOrders
    .filter((po) => (inRange(po.createdAt, f) || inRange(po.expectedDate, f)) && (!f.status || po.status === f.status) && (!f.supplierId || po.supplierId === f.supplierId))
    .sort((a, b) => b.createdAt - a.createdAt);

  const value = rows.reduce((s, po) => s + poValue(po), 0);
  const open = rows.filter((po) => po.status !== "received" && po.status !== "cancelled");
  const openValue = open.reduce((s, po) => s + poValue(po), 0);
  const ordered = rows.reduce((s, po) => s + po.lines.reduce((x, ln) => x + ln.qty, 0), 0);
  const received = rows.reduce((s, po) => s + po.lines.reduce((x, ln) => x + ln.receivedQty, 0), 0);

  return {
    ...shell("procurement", data, f, ctx),
    subtitle: t("reports.sub.procurement", { n: rows.length }),
    notes: [t("reports.note.procurement")],
    summary: [
      { label: t("reports.sum.orders"), value: fmt.num(rows.length) },
      { label: t("reports.sum.totalValue"), value: fmt.money(value) },
      { label: t("reports.sum.openOrders"), value: fmt.num(open.length) },
      { label: t("reports.sum.openValue"), value: fmt.money(openValue) },
      { label: t("reports.sum.pendingApproval"), value: fmt.num(rows.filter((po) => po.status === "pending").length) },
      { label: t("reports.col.received"), value: pctOrDash(ratio(received, ordered), ctx) },
    ],
    columns: [
      col("id", t("reports.col.order"), "code"),
      col("supplier", t("common.supplier")),
      col("status", t("common.status")),
      col("created", t("common.created"), "date"),
      col("expected", t("reports.col.expectedDate"), "date"),
      col("lines", t("reports.col.poLines"), "int"),
      col("value", t("common.value"), "money2"),
      col("received", t("reports.col.received"), "pct"),
    ],
    rows: rows.map((po) => ({
      id: po.id,
      cells: {
        id: po.id,
        supplier: supplier(po.supplierId)?.name ?? "",
        status: td(`postatus.${po.status}`),
        created: po.createdAt,
        expected: po.expectedDate,
        lines: po.lines.length,
        value: poValue(po),
        received: poReceivedRatio(po),
      },
    })),
    totals: rows.length ? { id: "total", cells: { id: t("common.total"), supplier: "", status: "", created: null, expected: null, lines: null, value, received: ratio(received, ordered) } } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function buildReport(id: ReportId, data: ReportData, filters: ReportFilters, ctx: ReportCtx): Report {
  const f = sanitizeFilters(id, filters, data.lines);
  switch (id) {
    case "production":
      return buildProductionReport(data, f, ctx);
    case "shift":
      return buildShiftReport(data, f, ctx);
    case "inventory":
      return buildInventoryReport(data, f, ctx);
    case "quality":
      return buildQualityReport(data, f, ctx);
    case "maintenance":
      return buildMaintenanceReport(data, f, ctx);
    case "downtime":
      return buildDowntimeReport(data, f, ctx);
    case "procurement":
      return buildProcurementReport(data, f, ctx);
  }
}

/* ------------------------------------------------------------------ */
/* Rendering the structure: screen / print and CSV                     */
/* ------------------------------------------------------------------ */

/** Localised display string for a cell (screen and print). */
export function formatCell(value: ReportValue, kind: CellKind, fmt: Fmt, dash = "—"): string {
  if (value === null || value === "") return typeof value === "string" ? "" : dash;
  if (typeof value === "string") return value;
  switch (kind) {
    case "int":
      return fmt.num(value);
    case "decimal":
      return fmt.num(value, Number.isInteger(value) ? 0 : 1);
    case "pct":
      return fmt.pct(value);
    case "money":
      return fmt.money(value);
    case "money2":
      return fmt.money(value, 2);
    case "date":
      return fmt.date(value);
    case "datetime":
      return fmt.dateTime(value);
    case "minutes":
      return fmt.duration(value);
    default:
      return String(value);
  }
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function isoDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dayKey(ts)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Raw, machine-readable value for the CSV (numbers stay numbers, dates are ISO). */
function csvCell(value: ReportValue, kind: CellKind): CsvCell {
  if (value === null) return "";
  if (typeof value === "string") return value;
  switch (kind) {
    case "pct":
      return round(value * 100, 2);
    case "decimal":
    case "money":
    case "money2":
      return round(value, 2);
    case "date":
      return dayKey(value);
    case "datetime":
      return isoDateTime(value);
    default:
      return value;
  }
}

/** Column header for the CSV: the localised label plus the unit the raw number is in. */
function csvHeader(c: ReportColumn, ctx: Pick<ReportCtx, "t">): string {
  if (c.kind === "pct") return `${c.label} (%)`;
  if (c.kind === "money" || c.kind === "money2") return `${c.label} (USD)`;
  if (c.kind === "minutes") return `${c.label} (${ctx.t("common.minutes")})`;
  return c.label;
}

/** All rows (plus the totals row, when present) as CSV headers + cells. */
export function reportToCsv(report: Report, ctx: Pick<ReportCtx, "t">): { headers: string[]; rows: CsvCell[][] } {
  const all = report.totals ? [...report.rows, report.totals] : report.rows;
  return {
    headers: report.columns.map((c) => csvHeader(c, ctx)),
    rows: all.map((r) => report.columns.map((c) => csvCell(r.cells[c.key] ?? null, c.kind))),
  };
}

/** e.g. forge-downtime-report_2026-10-13_2026-11-12.csv */
export function reportFilename(report: Pick<Report, "id" | "snapshot" | "generatedAt">, f: Pick<ReportFilters, "from" | "to">): string {
  const span = report.snapshot ? `snapshot_${isoDateTime(report.generatedAt).replace(" ", "_").replace(":", "")}` : `${dayKey(Math.min(f.from, f.to))}_${dayKey(Math.max(f.from, f.to))}`;
  return `forge-${report.id}-report_${span}.csv`;
}

/** Inclusive day range → filter bounds. */
export function dayRange(fromDay: number, toDay: number): { from: number; to: number } {
  const a = Math.min(fromDay, toDay);
  const b = Math.max(fromDay, toDay);
  return { from: a, to: b + DAY - 1 };
}
