"use client";
/** Analytics sections: Quality analytics, Inventory analytics and Operational efficiency (OEE). */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { PackageCheck } from "lucide-react";
import type { InventoryCategory, Shipment, StockMovement, WarehouseZone } from "@/domain/types";
import { STOCK_RANK, stockStatus, stockValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, HOUR } from "@/lib/time";
import { delta, inventorySummary, zoneUsage } from "@/store/selectors";
import { ChartPanel, ChartTooltip, MUTED, SERIES, lineColor, useChartProps } from "@/components/charts/kit";
import { Kpi, KpiStrip } from "@/components/ui/page";
import { Code, Delta, EmptyState, LegendItem, Panel, Segmented } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { ratio, type AnalyticsScope } from "./analytics-model";
import { DEFECT_CATS, INV_CATS, Insight, RankPanel, defectColor, invCatColor, useDayLabel, useNarrow, useSeriesToggle, type RankRow } from "./shared";

const vs = (cur: number, prev: number | null | undefined) => (prev === null || prev === undefined ? null : delta(cur, prev));

/* ------------------------------------------------------------------ */
/* Quality analytics                                                   */
/* ------------------------------------------------------------------ */

export function QualitySection({ scope }: { scope: AnalyticsScope }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const day = useDayLabel();
  const narrow = useNarrow();
  const [metric, setMetric] = useState<"defect" | "pass">("defect");
  const { total, prev, byDay, byLine, activeLines, inspections, empty } = scope;

  const defectRate = ratio(total.rejected, total.actual);
  const prevDefect = prev ? ratio(prev.rejected, prev.actual) : null;
  const days = useMemo(() => byDay.map((d) => ({ ts: d.ts, actual: d.actual, rejected: d.rejected, defect: ratio(d.rejected, d.actual), pass: d.quality })), [byDay]);

  const inspected = inspections.reduce((s, q) => s + q.inspectedQty, 0);
  const defectRows = useMemo<RankRow[]>(() => {
    const totals = new Map<string, number>();
    for (const q of inspections) for (const d of q.defects) totals.set(d.category, (totals.get(d.category) ?? 0) + d.qty);
    const all = [...totals.values()].reduce((s, v) => s + v, 0);
    return DEFECT_CATS.filter((c) => (totals.get(c) ?? 0) > 0)
      .map((c) => ({ key: c, text: td(`defect.${c}`), label: td(`defect.${c}`), value: totals.get(c) ?? 0, color: defectColor(c), hint: t("quality.defects.share", { share: fmt.pct(ratio(totals.get(c) ?? 0, all)) }) }))
      .sort((a, b) => b.value - a.value);
  }, [inspections, td, t, fmt]);

  const lineRows = useMemo<RankRow[]>(
    () =>
      byLine
        .map((a) => {
          const line = activeLines.find((l) => l.id === a.lineId)!;
          return {
            key: a.lineId,
            text: `${line.code} · ${tl(line.name)}`,
            label: (
              <Link href={`/production/${line.id}`} className="hover:text-ink hover:underline">
                <Code>{line.code}</Code> · {tl(line.name)}
              </Link>
            ),
            value: ratio(a.rejected, a.actual),
            color: lineColor(a.lineId),
            hint: t("analytics.qual.lineHint", { rejected: fmt.num(a.rejected), actual: fmt.num(a.actual) }),
          };
        })
        .sort((a, b) => b.value - a.value),
    [byLine, activeLines, tl, t, fmt],
  );

  const name = metric === "defect" ? t("analytics.qual.kpi.defect") : t("analytics.qual.kpi.pass");
  const worstDay = days.reduce<(typeof days)[number] | null>((w, d) => (!w || d.defect > w.defect ? d : w), null);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <KpiStrip columns={4}>
        <Kpi label={t("analytics.qual.kpi.pass")} value={total.quality} format={(v) => fmt.pct(v, 2)} delta={vs(total.quality, prev?.quality)} deltaLabel={t("common.vsPrev")} hint={t("analytics.qual.kpi.passHint")} />
        <Kpi label={t("analytics.qual.kpi.defect")} value={defectRate} format={(v) => fmt.pct(v, 2)} delta={vs(defectRate, prevDefect)} deltaGoodWhen="down" deltaLabel={t("common.vsPrev")} hint={t("analytics.qual.kpi.defectHint")} />
        <Kpi label={t("analytics.qual.kpi.rejected")} value={total.rejected} format={fmt.num} unit={t("common.units")} delta={vs(total.rejected, prev?.rejected)} deltaGoodWhen="down" deltaLabel={t("common.vsPrev")} />
        <Kpi label={t("analytics.qual.kpi.inspections")} value={inspections.length} format={fmt.num} hint={t("analytics.qual.kpi.inspectionsHint", { units: fmt.num(inspected) })} href="/quality" />
      </KpiStrip>

      <ChartPanel
        title={t("analytics.qual.trend.title")}
        subtitle={t("analytics.qual.trend.subtitle")}
        height={narrow ? 220 : 280}
        empty={empty}
        actions={<Segmented size="sm" label={t("quality.trend.metric")} value={metric} onChange={setMetric} options={[{ value: "defect", label: t("analytics.qual.kpi.defect") }, { value: "pass", label: t("analytics.qual.kpi.pass") }]} />}
        table={{
          columns: [t("common.date"), t("common.output"), t("quality.col.rejected"), t("analytics.qual.kpi.defect"), t("analytics.qual.kpi.pass")],
          rows: days.map((d) => [fmt.dateShort(d.ts), d.actual, d.rejected, fmt.pct(d.defect, 2), fmt.pct(d.pass, 2)]),
        }}
        footer={worstDay && <Insight>{t("analytics.qual.trend.insight", { date: fmt.dateShort(worstDay.ts), rate: fmt.pct(worstDay.defect, 2), avg: fmt.pct(defectRate, 2) })}</Insight>}
      >
        <LineChart data={days} margin={cp.margin}>
          <CartesianGrid {...cp.grid} />
          <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
          <YAxis
            {...cp.yAxis}
            width={48}
            tickFormatter={(v: number) => fmt.pct(v, 1)}
            domain={metric === "defect" ? [0, (max: number) => Math.ceil(max * 200) / 200] : [(min: number) => Math.floor(min * 200) / 200, 1]}
          />
          <Tooltip
            cursor={cp.cursor}
            content={
              <ChartTooltip
                formatLabel={(l) => day.full(l)}
                formatValue={(v) => fmt.pct(v, 2)}
                footer={(p) => t("analytics.qual.trend.foot", { rejected: fmt.num(Number(p[0]?.payload?.rejected ?? 0)), actual: fmt.num(Number(p[0]?.payload?.actual ?? 0)) })}
              />
            }
          />
          <Line {...cp.series} type="monotone" dataKey={metric} name={name} stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--base)", strokeWidth: 2 }} />
        </LineChart>
      </ChartPanel>

      <div className="grid gap-4 xl:grid-cols-2 lg:gap-5">
        <RankPanel
          title={t("analytics.qual.line.title")}
          subtitle={t("analytics.qual.line.subtitle")}
          rows={lineRows}
          formatValue={(v) => fmt.pct(v, 2)}
          labelHeader={t("common.line")}
          valueHeader={t("quality.col.rejectRate")}
          footer={lineRows.length > 1 && <Insight>{t("analytics.qual.line.insight", { line: lineRows[0].text, rate: fmt.pct(lineRows[0].value, 2), avg: fmt.pct(defectRate, 2) })}</Insight>}
        />
        <RankPanel
          title={t("analytics.qual.defects.title")}
          subtitle={t("analytics.qual.defects.subtitle", { n: fmt.num(inspections.length) })}
          rows={defectRows}
          formatValue={(v) => fmt.num(v)}
          labelHeader={t("quality.col.defectCategory")}
          valueHeader={t("quality.col.rejectedUnits")}
          footer={defectRows.length > 0 && <Insight>{t("analytics.qual.defects.insight")}</Insight>}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory analytics                                                 */
/* ------------------------------------------------------------------ */

const TURNOVER_DAYS = 30;

export function InventorySection({ scope, movements, zones, shipments, now }: { scope: AnalyticsScope; movements: StockMovement[]; zones: WarehouseZone[]; shipments: Shipment[]; now: number }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const { items, factoryItems, warehouses, filters } = scope;
  const category = filters.invCategory;

  const summary = useMemo(() => inventorySummary(items), [items]);

  // The window end moves in whole hours so the sum is not recomputed on every simulation tick.
  const windowEnd = Math.ceil(now / HOUR) * HOUR;
  // Demo turnover: issues to production over the last 30 simulated days, annualised, over current value.
  const issued = useMemo(() => {
    const cost = new Map(items.map((i) => [i.id, i.unitCost]));
    const since = windowEnd - TURNOVER_DAYS * DAY;
    let value = 0;
    for (const m of movements) {
      if (m.type !== "issue" || m.at <= since || m.at > windowEnd) continue;
      const c = cost.get(m.itemId);
      if (c !== undefined) value += Math.abs(m.qty) * c;
    }
    return value;
  }, [items, movements, windowEnd]);
  const annualised = issued * (365 / TURNOVER_DAYS);
  const turnover = ratio(annualised, summary.value);

  const catRows = useMemo<RankRow[]>(() => {
    const total = factoryItems.reduce((s, i) => s + stockValue(i), 0);
    return INV_CATS.map((c) => {
      const list = factoryItems.filter((i) => i.category === c);
      const value = list.reduce((s, i) => s + stockValue(i), 0);
      return {
        key: c,
        text: td(`invcat.${c}`),
        label: td(`invcat.${c}`),
        value,
        color: !category || category === c ? invCatColor(c) : MUTED,
        hint: t("analytics.inv.catHint", { n: fmt.num(list.length), share: fmt.pct(ratio(value, total)) }),
      };
    })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [factoryItems, category, td, t, fmt]);

  const lowItems = useMemo(
    () =>
      items
        .map((i) => ({ item: i, status: stockStatus(i) }))
        .filter((x) => x.status !== "healthy")
        .sort((a, b) => STOCK_RANK[b.status] - STOCK_RANK[a.status] || ratio(a.item.quantity, a.item.reorderLevel) - ratio(b.item.quantity, b.item.reorderLevel)),
    [items],
  );

  const zoneData = useMemo(() => {
    const whIds = new Set(warehouses.map((w) => w.id));
    return zones
      .filter((z) => whIds.has(z.warehouseId) && (!category || z.categories.includes(category as InventoryCategory)))
      .map((z) => ({ zone: z, usage: zoneUsage(z, factoryItems, shipments), wh: warehouses.find((w) => w.id === z.warehouseId)! }));
  }, [zones, warehouses, category, factoryItems, shipments]);

  const zoneRows = useMemo<RankRow[]>(
    () =>
      zoneData
        .map(({ zone, usage, wh }) => ({
          key: zone.id,
          text: `${wh.code} · ${zone.code} ${tl(zone.name)}`,
          label: (
            <Link href={`/warehouse/${wh.id}`} className="hover:text-ink hover:underline">
              <Code>{`${wh.code} · ${zone.code}`}</Code> {tl(zone.name)}
            </Link>
          ),
          value: usage.occupancy,
          color: SERIES[1],
          hint: t("analytics.inv.zoneHint", { used: fmt.num(usage.used), capacity: fmt.num(usage.capacity) }),
        }))
        .sort((a, b) => b.value - a.value),
    [zoneData, tl, t, fmt],
  );

  const whTotals = warehouses
    .map((w) => {
      const zs = zoneData.filter((z) => z.wh.id === w.id);
      const used = zs.reduce((s, z) => s + z.usage.used, 0);
      const capacity = zs.reduce((s, z) => s + z.usage.capacity, 0);
      return { w, used, capacity, n: zs.length };
    })
    .filter((x) => x.n > 0);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <p className="text-[12px] text-ink-3">{t("analytics.inv.scopeNote")}</p>
      <KpiStrip columns={4}>
        <Kpi label={t("analytics.inv.kpi.value")} value={summary.value} format={fmt.compactMoney} hint={category ? td(`invcat.${category}`) : t("analytics.inv.kpi.allCats")} />
        <Kpi label={t("analytics.inv.kpi.skus")} value={summary.count} format={fmt.num} hint={t("analytics.inv.kpi.snapshot")} />
        <Kpi label={t("analytics.inv.kpi.low")} value={summary.attention} format={fmt.num} tone={summary.attention > 0 ? "warn" : undefined} hint={t("analytics.inv.kpi.lowHint", { out: fmt.num(summary.out), critical: fmt.num(summary.critical) })} />
        <Kpi label={t("analytics.inv.kpi.turnover")} value={turnover} format={(v) => `${fmt.num(v, 1)}×`} unit={t("analytics.inv.kpi.perYear")} hint={t("common.demoCalc")} />
      </KpiStrip>

      <div className="grid gap-4 xl:grid-cols-2 lg:gap-5">
        <RankPanel
          title={t("analytics.inv.cat.title")}
          subtitle={t("analytics.inv.cat.subtitle")}
          rows={catRows}
          formatValue={(v) => fmt.money(v)}
          labelHeader={t("common.category")}
          valueHeader={t("common.value")}
          footer={catRows.length > 0 && <Insight>{t("analytics.inv.cat.insight", { category: catRows[0].text, value: fmt.compactMoney(catRows[0].value) })}</Insight>}
        />

        <Panel title={t("analytics.inv.turn.title")} subtitle={t("analytics.inv.turn.subtitle")}>
          {summary.count === 0 ? (
            <EmptyState title={t("common.noData")} hint={t("common.noDataHint")} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="display num text-[34px] text-ink">{`${fmt.num(turnover, 1)}×`}</span>
                <span className="text-[12px] text-ink-3">{t("analytics.inv.kpi.perYear")}</span>
              </div>
              <div className="rounded-md border border-dashed border-line-2 bg-canvas/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <span className="label mb-1 block">{t("analytics.formula")}</span>
                {t("analytics.inv.turn.formula", { days: TURNOVER_DAYS })}
              </div>
              <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
                <Term label={t("analytics.inv.turn.issued", { days: TURNOVER_DAYS })}>{fmt.money(issued)}</Term>
                <Term label={t("analytics.inv.turn.annualised")}>{fmt.money(annualised)}</Term>
                <Term label={t("analytics.inv.turn.value")}>{fmt.money(summary.value)}</Term>
              </dl>
              <p className="text-[11.5px] text-ink-3">{t("analytics.inv.turn.note")}</p>
            </div>
          )}
        </Panel>

        <Panel title={t("analytics.inv.low.title")} subtitle={t("analytics.inv.low.subtitle")} flush actions={lowItems.length > 0 ? <span className="num text-[12px] text-ink-3">{fmt.num(lowItems.length)}</span> : undefined}>
          {lowItems.length === 0 ? (
            <EmptyState icon={PackageCheck} title={t("analytics.inv.low.empty")} hint={t("analytics.inv.low.emptyHint")} />
          ) : (
            <ul className="max-h-[360px] divide-y divide-line/70 overflow-y-auto">
              {lowItems.map(({ item, status }) => (
                <li key={item.id}>
                  <Link href={`/inventory/${item.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{tl(item.name)}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        <Code className="text-[11px]">{item.sku}</Code> · {td(`invcat.${item.category}`)}
                      </p>
                    </div>
                    <div className="num shrink-0 text-end text-[12.5px]">
                      <p className="font-semibold text-ink">
                        {fmt.num(item.quantity)} <span className="font-normal text-ink-3">{item.unit}</span>
                      </p>
                      <p className="text-[11.5px] text-ink-3">{t("analytics.inv.low.reorder", { qty: fmt.num(item.reorderLevel) })}</p>
                    </div>
                    <StatusBadge kind="stock" value={status} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <RankPanel
          title={t("analytics.inv.zone.title")}
          subtitle={t("analytics.inv.zone.subtitle")}
          rows={zoneRows}
          max={1}
          formatValue={(v) => fmt.pct(v, 0)}
          labelHeader={t("common.zone")}
          valueHeader={t("common.utilization")}
          footer={
            whTotals.length > 0 &&
            whTotals.map(({ w, used, capacity }) => (
              <Insight key={w.id}>{t("analytics.inv.zone.insight", { warehouse: `${w.code} · ${tl(w.name)}`, pct: fmt.pct(ratio(used, capacity), 0), used: fmt.num(used), capacity: fmt.num(capacity) })}</Insight>
            ))
          }
        />
      </div>
    </div>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-base px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[14px] font-semibold text-ink">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operational efficiency (OEE)                                        */
/* ------------------------------------------------------------------ */

const OEE_KEYS = ["oee", "availability", "performance", "quality"] as const;
type OeeKey = (typeof OEE_KEYS)[number];
const OEE_COLOR: Record<OeeKey, string> = { oee: SERIES[0], availability: SERIES[1], performance: SERIES[2], quality: SERIES[3] };

function Ring({ value, color, size, label, children }: { value: number; color: string; size: number; label: string; children: ReactNode }) {
  const stroke = Math.round(size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.2,0.7,0.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function OeeSection({ scope }: { scope: AnalyticsScope }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const day = useDayLabel();
  const narrow = useNarrow();
  const { total, prev, byDay, byLine, activeLines, empty } = scope;
  const trendToggle = useSeriesToggle(OEE_KEYS);
  const lineToggle = useSeriesToggle(OEE_KEYS);

  const label: Record<OeeKey, string> = { oee: t("common.oee"), availability: t("common.availability"), performance: t("common.performance"), quality: t("common.quality") };
  const lineData = useMemo(
    () => byLine.map((a) => ({ code: activeLines.find((l) => l.id === a.lineId)?.code ?? a.lineId, name: activeLines.find((l) => l.id === a.lineId)?.name, oee: a.oee, availability: a.availability, performance: a.performance, quality: a.quality })),
    [byLine, activeLines],
  );
  const ranked = [...lineData].sort((a, b) => b.oee - a.oee);
  const runMin = total.plannedMin - total.downtimeMin;
  // The factor furthest from 100% is the main loss.
  const limiting = (["availability", "performance", "quality"] as const).reduce((w, k) => (total[k] < total[w] ? k : w), "availability" as OeeKey);

  const legend = (toggle: ReturnType<typeof useSeriesToggle<OeeKey>>, shape: "line" | "square") =>
    OEE_KEYS.map((k) => <LegendItem key={k} shape={shape} color={OEE_COLOR[k]} label={label[k]} hidden={toggle.isHidden(k)} onToggle={() => toggle.toggle(k)} />);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <Panel title={t("analytics.oee.summary.title")} subtitle={t("analytics.oee.summary.subtitle")}>
        {empty ? (
          <EmptyState title={t("common.noData")} hint={t("common.noDataHint")} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              {OEE_KEYS.map((k) => (
                <div key={k} className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-4">
                  <Ring value={total[k]} color={OEE_COLOR[k]} size={k === "oee" ? (narrow ? 104 : 124) : narrow ? 88 : 104} label={`${label[k]}: ${fmt.pct(total[k])}`}>
                    <span className={k === "oee" ? "display num text-[26px] text-ink" : "display num text-[21px] text-ink"}>{fmt.pct(total[k])}</span>
                  </Ring>
                  <div className="min-w-0 text-center sm:text-start">
                    <div className="label">{label[k]}</div>
                    <Delta value={vs(total[k], prev?.[k])} className="mt-1" />
                    <p className="mt-0.5 text-[11px] text-ink-3">{t("common.vsPrev")}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-line pt-3">
              <Insight>{t("analytics.oee.summary.insight", { factor: label[limiting], pct: fmt.pct(total[limiting]), a: fmt.pct(total.availability), p: fmt.pct(total.performance), q: fmt.pct(total.quality), oee: fmt.pct(total.oee) })}</Insight>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2 lg:gap-5">
        <ChartPanel
          title={t("analytics.oee.trend.title")}
          subtitle={t("analytics.oee.trend.subtitle")}
          height={narrow ? 230 : 290}
          empty={empty}
          legend={legend(trendToggle, "line")}
          table={{ columns: [t("common.date"), ...OEE_KEYS.map((k) => label[k])], rows: byDay.map((d) => [fmt.dateShort(d.ts), ...OEE_KEYS.map((k) => fmt.pct(d[k]))]) }}
        >
          <LineChart data={byDay} margin={cp.margin}>
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.pct(v, 0)} domain={[(min: number) => Math.max(0, Math.floor(min * 20) / 20 - 0.05), 1]} />
            <Tooltip cursor={cp.cursor} content={<ChartTooltip formatLabel={(l) => day.full(l)} formatValue={(v) => fmt.pct(v)} />} />
            {OEE_KEYS.map((k) => (
              <Line key={k} {...cp.series} type="monotone" dataKey={k} name={label[k]} stroke={OEE_COLOR[k]} strokeWidth={k === "oee" ? 2.5 : 1.5} dot={false} activeDot={{ r: 4, stroke: "var(--base)", strokeWidth: 2 }} hide={trendToggle.isHidden(k)} />
            ))}
          </LineChart>
        </ChartPanel>

        <ChartPanel
          title={t("analytics.oee.line.title")}
          subtitle={t("analytics.oee.line.subtitle")}
          height={narrow ? 230 : 290}
          empty={empty}
          legend={legend(lineToggle, "square")}
          table={{ columns: [t("common.line"), ...OEE_KEYS.map((k) => label[k])], rows: lineData.map((d) => [d.code, ...OEE_KEYS.map((k) => fmt.pct(d[k]))]) }}
          footer={
            ranked.length > 1 && (
              <Insight>
                {t("analytics.oee.line.insight", { best: `${ranked[0].code}${ranked[0].name ? ` ${tl(ranked[0].name)}` : ""}`, bestPct: fmt.pct(ranked[0].oee), worst: `${ranked[ranked.length - 1].code}${ranked[ranked.length - 1].name ? ` ${tl(ranked[ranked.length - 1].name!)}` : ""}`, worstPct: fmt.pct(ranked[ranked.length - 1].oee) })}
              </Insight>
            )
          }
        >
          <BarChart data={lineData} margin={cp.margin} barCategoryGap="20%" barGap={2}>
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="code" />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.pct(v, 0)} domain={[0, 1]} />
            <Tooltip cursor={cp.barCursor} content={<ChartTooltip formatValue={(v) => fmt.pct(v)} />} />
            {OEE_KEYS.map((k) => (
              <Bar key={k} {...cp.series} dataKey={k} name={label[k]} fill={OEE_COLOR[k]} radius={[2, 2, 0, 0]} hide={lineToggle.isHidden(k)} maxBarSize={18} />
            ))}
          </BarChart>
        </ChartPanel>
      </div>

      <Panel title={t("analytics.oee.def.title")} subtitle={t("analytics.oee.def.subtitle")}>
        <div className="grid gap-5 lg:grid-cols-2">
          <dl className="space-y-3.5">
            {(["availability", "performance", "quality", "oee"] as const).map((k) => (
              <div key={k} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-[1px]" style={{ background: OEE_COLOR[k] }} />
                <div className="min-w-0">
                  <dt className="text-[13px] font-semibold text-ink">{label[k]}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                    <span className="block font-mono text-[12px] text-ink">{t(`analytics.oee.def.${k}.formula`)}</span>
                    {t(`analytics.oee.def.${k}.note`)}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          <div>
            <p className="label mb-2">{t("analytics.oee.def.inputs")}</p>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
              <Term label={t("analytics.oee.in.planned")}>{fmt.duration(total.plannedMin)}</Term>
              <Term label={t("analytics.oee.in.downtime")}>{fmt.duration(total.downtimeMin)}</Term>
              <Term label={t("analytics.oee.in.run")}>{fmt.duration(runMin)}</Term>
              <Term label={t("analytics.oee.in.ideal")}>{fmt.num(Math.round(total.idealUnits))}</Term>
              <Term label={t("analytics.oee.in.actual")}>{fmt.num(total.actual)}</Term>
              <Term label={t("analytics.oee.in.good")}>{fmt.num(total.good)}</Term>
            </dl>
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">{t("analytics.oee.def.aggregate")}</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
