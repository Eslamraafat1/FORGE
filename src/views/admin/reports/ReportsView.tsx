"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Boxes, Camera, CalendarRange, Clock, Download, Info, Printer, Rows3, ShieldCheck, ShoppingCart, TimerOff, Wrench } from "lucide-react";
import { REPORT_IDS, type ReportId } from "@/components/shell/nav";
import { Guard, Page, PageHeader } from "@/components/ui/page";
import { Badge, Button, Field, Input, Panel, Segmented, Select, SimBadge, cn } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { HISTORY_DAYS } from "@/data/seed";
import { useT } from "@/i18n";
import { downloadCsv } from "@/lib/csv";
import { useFmt } from "@/lib/format";
import { DAY, HOUR, fromInput, startOfDay, toInputDate } from "@/lib/time";
import { useForge } from "@/store/store";
import { EMPTY_CONTEXT, INVENTORY_CATEGORIES, REPORT_META, buildReport, dayRange, reportFilename, reportToCsv, sanitizeFilters, type ContextFilterKey, type ReportData } from "./build";
import { ReportSheet } from "./ReportSheet";

const ICONS: Record<ReportId, LucideIcon> = {
  production: Rows3,
  shift: Clock,
  inventory: Boxes,
  quality: ShieldCheck,
  maintenance: Wrench,
  downtime: TimerOff,
  procurement: ShoppingCart,
};

const PRESETS = [7, 14, 30, 60] as const;
type PresetValue = "7" | "14" | "30" | "60" | "custom";
type RangeState = { kind: "preset"; days: number } | { kind: "custom"; from: string; to: string };

function isReportId(v: string | null): v is ReportId {
  return !!v && (REPORT_IDS as readonly string[]).includes(v);
}

export function ReportsView() {
  const { t, td, tl, lang } = useT();
  const fmt = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const param = params.get("report");
  const selected: ReportId = isReportId(param) ? param : "production";
  const meta = REPORT_META[selected];

  const now = useForge((s) => s.now);
  const factories = useForge((s) => s.factories);
  const products = useForge((s) => s.products);
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const dailyStats = useForge((s) => s.dailyStats);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const items = useForge((s) => s.items);
  const warehouses = useForge((s) => s.warehouses);
  const suppliers = useForge((s) => s.suppliers);
  const purchaseOrders = useForge((s) => s.purchaseOrders);
  const inspections = useForge((s) => s.inspections);
  const maintenanceOrders = useForge((s) => s.maintenanceOrders);
  const team = useForge((s) => s.team);

  const [range, setRange] = useState<RangeState>({ kind: "preset", days: 30 });
  const [context, setContext] = useState(EMPTY_CONTEXT);

  // Available history: the last HISTORY_DAYS days up to (and including) the simulated today.
  const today = startOfDay(now);
  const minDay = startOfDay(today - HISTORY_DAYS * DAY + 12 * HOUR);

  const span = useMemo(() => {
    if (range.kind === "preset") return dayRange(startOfDay(today - range.days * DAY + 12 * HOUR), today);
    const clamp = (v: string, fallback: number) => {
      const ts = fromInput(v);
      return Number.isFinite(ts) ? Math.min(today, Math.max(minDay, startOfDay(ts))) : fallback;
    };
    return dayRange(clamp(range.from, minDay), clamp(range.to, today));
  }, [range, today, minDay]);

  const filters = useMemo(() => sanitizeFilters(selected, { ...span, ...context }, lines), [selected, span, context, lines]);

  const data: ReportData = useMemo(
    () => ({ factories, products, lines, machines, dailyStats, downtimeEvents, items, warehouses, suppliers, purchaseOrders, inspections, maintenanceOrders, team }),
    [factories, products, lines, machines, dailyStats, downtimeEvents, items, warehouses, suppliers, purchaseOrders, inspections, maintenanceOrders, team],
  );

  const report = useMemo(() => buildReport(selected, data, filters, { t, td, tl, fmt, now }), [selected, data, filters, t, td, tl, fmt, now]);

  const select = (id: ReportId) => {
    setContext(EMPTY_CONTEXT);
    router.replace(`/reports?report=${id}`, { scroll: false });
  };

  const setFilter = (key: ContextFilterKey, value: string) =>
    setContext((c) => (key === "factoryId" ? { ...c, factoryId: value, lineId: "" } : { ...c, [key]: value }));

  const exportCsv = () => {
    const { headers, rows } = reportToCsv(report, { t });
    const file = reportFilename(report, filters);
    downloadCsv(file, headers, rows);
    toast("success", t("reports.exported"), t("reports.exportedBody", { n: report.rows.length, file }));
  };

  const presetValue: PresetValue = range.kind === "preset" ? (String(range.days) as PresetValue) : "custom";
  const fromValue = toInputDate(filters.from);
  const toValue = toInputDate(filters.to);
  const activeContext = meta.filters.filter((k) => filters[k] !== "").length;
  const lineOptions = lines.filter((l) => !filters.factoryId || l.factoryId === filters.factoryId);
  const sheetKey = [selected, filters.from, filters.to, filters.factoryId, filters.lineId, filters.category, filters.status, filters.supplierId, lang].join("|");

  return (
    <Page>
      <div className="no-print">
        <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} meta={<SimBadge />} />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5 print:block">
        {/* Catalogue */}
        <Panel title={t("reports.catalogue")} subtitle={t("reports.catalogueHint")} flush className="no-print self-start">
          <div role="radiogroup" aria-label={t("reports.catalogue")} className="flex flex-col">
            {REPORT_IDS.map((id) => {
              const Icon = ICONS[id];
              const active = id === selected;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => select(id)}
                  className={cn(
                    "relative flex items-start gap-3 border-b border-line/70 px-4 py-3 text-start transition-colors last:border-b-0",
                    active ? "bg-raised" : "hover:bg-raised/60",
                  )}
                >
                  {active && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-forge" />}
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", active ? "text-forge-text" : "text-ink-3")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-[13px] font-semibold", active ? "text-ink" : "text-ink-2")}>{td(`reports.type.${id}`)}</span>
                      {REPORT_META[id].snapshot && (
                        <Badge tone="info" icon={Camera}>
                          {t("reports.badge.snapshot")}
                        </Badge>
                      )}
                    </span>
                    <span className={cn("mt-1 text-[12px] leading-snug text-ink-3", active ? "block" : "hidden lg:block")}>{td(`reports.desc.${id}`)}</span>
                    {active && (
                      <span className="mt-1.5 block text-[11.5px] leading-snug text-ink-2">
                        <span className="label me-1.5">{t("reports.contains")}</span>
                        {td(`reports.contains.${id}`)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Filters + actions */}
          <Panel
            title={t("common.filters")}
            className="no-print"
            actions={
              activeContext > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setContext(EMPTY_CONTEXT)}>
                  {t("common.clearFilters")}
                </Button>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className={cn("flex min-w-0 flex-col gap-1.5", meta.snapshot && "opacity-50")} inert={meta.snapshot}>
                    <span className="text-[12px] font-medium text-ink-2">{t("common.dateRange")}</span>
                    <Segmented<PresetValue>
                      label={t("common.dateRange")}
                      value={presetValue}
                      onChange={(v) => setRange(v === "custom" ? { kind: "custom", from: fromValue, to: toValue } : { kind: "preset", days: Number(v) })}
                      options={[
                        ...PRESETS.map((d) => ({ value: String(d) as PresetValue, label: td(`common.range.${d}d`) })),
                        { value: "custom" as const, label: t("reports.range.custom"), icon: CalendarRange },
                      ]}
                    />
                  </div>
                  <Field label={t("common.from")} className="w-[150px]">
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        disabled={meta.snapshot}
                        min={toInputDate(minDay)}
                        max={toValue}
                        value={fromValue}
                        onChange={(e) => e.target.value && setRange({ kind: "custom", from: e.target.value, to: toValue })}
                      />
                    )}
                  </Field>
                  <Field label={t("common.to")} className="w-[150px]">
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        disabled={meta.snapshot}
                        min={fromValue}
                        max={toInputDate(today)}
                        value={toValue}
                        onChange={(e) => e.target.value && setRange({ kind: "custom", from: fromValue, to: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <p className="flex items-start gap-1.5 text-[11.5px] text-ink-3">
                  <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                  {meta.snapshot ? t("reports.snapshotNote") : t("reports.historyNote", { from: fmt.date(minDay), to: fmt.date(today) })}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {meta.filters.map((key) => {
                  if (key === "factoryId")
                    return (
                      <Field key={key} label={t("common.factory")}>
                        {(p) => (
                          <Select {...p} value={filters.factoryId} onChange={(e) => setFilter(key, e.target.value)}>
                            <option value="">{t("reports.filter.allFactories")}</option>
                            {factories.map((x) => (
                              <option key={x.id} value={x.id}>
                                {tl(x.name)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  if (key === "lineId")
                    return (
                      <Field key={key} label={t("common.line")}>
                        {(p) => (
                          <Select {...p} value={filters.lineId} onChange={(e) => setFilter(key, e.target.value)}>
                            <option value="">{t("reports.filter.allLines")}</option>
                            {lineOptions.map((x) => (
                              <option key={x.id} value={x.id}>
                                {`${x.code} · ${tl(x.name)}`}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  if (key === "category")
                    return (
                      <Field key={key} label={t("common.category")}>
                        {(p) => (
                          <Select {...p} value={filters.category} onChange={(e) => setFilter(key, e.target.value)}>
                            <option value="">{t("reports.filter.allCategories")}</option>
                            {INVENTORY_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {td(`invcat.${c}`)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  if (key === "status")
                    return (
                      <Field key={key} label={t("common.status")}>
                        {(p) => (
                          <Select {...p} value={filters.status} onChange={(e) => setFilter(key, e.target.value)}>
                            <option value="">{t("reports.filter.allStatuses")}</option>
                            {meta.statuses?.values.map((s) => (
                              <option key={s} value={s}>
                                {td(`${meta.statuses!.prefix}.${s}`)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  return (
                    <Field key={key} label={t("common.supplier")}>
                      {(p) => (
                        <Select {...p} value={filters.supplierId} onChange={(e) => setFilter(key, e.target.value)}>
                          <option value="">{t("reports.filter.allSuppliers")}</option>
                          {suppliers.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Guard cap="reports.export">
                    <Button variant="primary" icon={Download} onClick={exportCsv} disabled={report.rows.length === 0}>
                      {t("common.exportCsv")}
                    </Button>
                  </Guard>
                  <Button icon={Printer} onClick={() => window.print()}>
                    {t("common.print")}
                  </Button>
                </div>
                <p className="min-w-0 flex-1 basis-[240px] text-[11.5px] leading-snug text-ink-3">{t("reports.pdfHint")}</p>
              </div>
            </div>
          </Panel>

          <ReportSheet key={sheetKey} report={report} />
        </div>
      </div>
    </Page>
  );
}
