"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, Boxes, ClipboardList, Cog, PackageCheck, ShieldCheck } from "lucide-react";
import { CURRENT_USER_ID } from "@/data/seed";
import type { EventCategory } from "@/domain/types";
import { STOCK_RANK, stockStatus } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { DAY, dayKey, shiftAt } from "@/lib/time";
import {
  aggregateByDay,
  aggregateByLine,
  aggregateTotal,
  completedBetween,
  delta,
  downtimeInRange,
  equipmentAvailability,
  filterStats,
  historyWindow,
  inventorySummary,
  lineLive,
  networkLive,
  sumBy,
  workOrderCounts,
} from "@/store/selectors";
import { useForge } from "@/store/store";
import { ChartPanel, ChartTooltip, MUTED, RankBars, SERIES, Sparkline, lineColor, useChartProps } from "@/components/charts/kit";
import { SEVERITY_ICON } from "@/components/shell/NotificationCenter";
import { Kpi, KpiStrip, Page } from "@/components/ui/page";
import { Code, CountUp, Delta, EmptyState, Gauge, LegendItem, Panel, Progress, Segmented, SimBadge, cn, toneText } from "@/components/ui/primitives";
import { LINE_TONE, SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { AlertCenter } from "./AlertCenter";

type Range = 7 | 14 | 30;
const FEED_CATEGORIES: (EventCategory | "all")[] = ["all", "production", "quality", "inventory", "maintenance", "logistics"];

export function OverviewView() {
  const { t, td, tm, tl } = useT();
  const fmt = useFmt();
  const chart = useChartProps();

  const now = useForge((s) => s.now);
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const factories = useForge((s) => s.factories);
  const workOrders = useForge((s) => s.workOrders);
  const items = useForge((s) => s.items);
  const dailyStats = useForge((s) => s.dailyStats);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const activity = useForge((s) => s.activity);
  const products = useForge((s) => s.products);
  const me = useForge((s) => s.team.find((m) => m.id === CURRENT_USER_ID)!);

  const [range, setRange] = useState<Range>(14);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [feedCat, setFeedCat] = useState<EventCategory | "all">("all");
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const shift = shiftAt(now);
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "overview.greeting.morning" : hour < 18 ? "overview.greeting.afternoon" : "overview.greeting.evening";

  const live = useMemo(() => networkLive(lines, now), [lines, now]);
  const availability = useMemo(() => equipmentAvailability(machines), [machines]);
  const inv = useMemo(() => inventorySummary(items), [items]);
  const wo = useMemo(() => workOrderCounts(workOrders), [workOrders]);

  // History is keyed by the calendar day, so it only changes when the day rolls over.
  const today = dayKey(now);
  const hist = useMemo(() => {
    const w = historyWindow(now, range);
    const cur = filterStats(dailyStats, { from: w.from, to: w.to });
    const prev = filterStats(dailyStats, { from: w.prevFrom, to: w.prevTo });
    const days = aggregateByDay(cur, lines);
    const prevDays = aggregateByDay(prev, lines);
    // Align the previous period to the current one from the most recent day backwards.
    const offset = prevDays.length - days.length;
    const rows = days.map((d, i) => ({
      ts: d.ts,
      actual: d.actual,
      planned: d.planned,
      previous: prevDays[i + offset]?.actual ?? null,
      oee: d.oee * 100,
      availability: d.availability * 100,
      performance: d.performance * 100,
      quality: d.quality * 100,
    }));
    const total = aggregateTotal(cur, lines);
    const prevTotal = aggregateTotal(prev, lines);
    const dt = downtimeInRange(downtimeEvents, { from: w.from, to: w.to });
    const prevDt = downtimeInRange(downtimeEvents, { from: w.prevFrom, to: w.prevTo });
    const done = completedBetween(workOrders, w.from, w.to + 1);
    const prevDone = completedBetween(workOrders, w.prevFrom, w.prevTo + 1);
    const doneByDay = days.map((d) => ({ ts: d.ts, orders: done.filter((o) => (o.completedAt ?? 0) >= d.ts && (o.completedAt ?? 0) < d.ts + DAY).length }));
    return {
      rows,
      total,
      prevTotal,
      byLine: aggregateByLine(cur, lines),
      dtMinutes: dt.reduce((s, e) => s + e.minutes, 0),
      prevDtMinutes: prevDt.reduce((s, e) => s + e.minutes, 0),
      dtEvents: dt.length,
      dtByCause: sumBy(dt, (e) => e.cause, (e) => e.minutes),
      done,
      prevDone,
      doneByDay,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, range, dailyStats, downtimeEvents, lines.length, workOrders]);

  const invAlerts = useMemo(
    () =>
      items
        .map((i) => ({ item: i, status: stockStatus(i) }))
        .filter((x) => x.status !== "healthy")
        .sort((a, b) => STOCK_RANK[b.status] - STOCK_RANK[a.status] || a.item.quantity / (a.item.reorderLevel || 1) - b.item.quantity / (b.item.reorderLevel || 1))
        .slice(0, 6),
    [items],
  );
  const feed = useMemo(() => activity.filter((e) => feedCat === "all" || e.category === feedCat).slice(0, 12), [activity, feedCat]);

  const rangeControl = (
    <Segmented
      size="sm"
      label={t("common.dateRange")}
      value={String(range) as "7" | "14" | "30"}
      onChange={(v) => setRange(Number(v) as Range)}
      options={[
        { value: "7", label: t("common.range.7d") },
        { value: "14", label: t("common.range.14d") },
        { value: "30", label: t("common.range.30d") },
      ]}
    />
  );
  const dayTick = (ts: number) => fmt.dateShort(ts);
  const firstName = tl(me.name).split(" ")[0];
  const attainment = live.expected > 0 ? live.output / live.expected : 0;

  return (
    <Page>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="ticks panel grid-bg grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:p-6">
        <div className="flex min-w-0 flex-col justify-between gap-6">
          <div>
            <p className="label flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t("overview.eyebrow")}</span>
              <span aria-hidden>/</span>
              <span>{fmt.date(now)}</span>
              <span aria-hidden>/</span>
              <span>{td(`shift.${shift.id}`)}</span>
            </p>
            <h1 className="display mt-3 text-[40px] text-ink sm:text-[52px]">{t(greeting, { name: firstName })}</h1>
            <p className="mt-2 max-w-xl text-[14px] text-ink-2">{t("overview.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="num text-[12px] text-ink-3">{t("overview.network", { factories: factories.length, lines: lines.length, machines: machines.length })}</span>
            <SimBadge />
          </div>
        </div>

        <div className="min-w-0 border-line lg:border-s lg:ps-6">
          <p className="label">{t("overview.output.label")}</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <CountUp value={live.output} format={(n) => fmt.num(Math.round(n))} className="display text-[60px] text-ink sm:text-[68px]" />
                <span className="text-[13px] text-ink-3">{t("common.units")}</span>
              </div>
              <p className="num mt-1 text-[12.5px] text-ink-2">{t("overview.output.ofTarget", { target: fmt.num(live.target) })}</p>
            </div>
            <Gauge value={live.oee} size={92} stroke={7} tone={live.oee >= 0.75 ? "ok" : live.oee >= 0.6 ? "warn" : "danger"} label={`${t("common.oee")} ${fmt.pct(live.oee)}`}>
              <span className="display num text-[21px] text-ink">{fmt.pct(live.oee, 0)}</span>
              <span className="label !text-[9px]">{t("common.oee")}</span>
            </Gauge>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[11.5px]">
              <span className={cn("num font-semibold", attainment >= 0.98 ? "text-ok" : attainment >= 0.9 ? "text-amber" : "text-danger")}>{t("overview.output.pace", { pct: fmt.pct(attainment, 0) })}</span>
              <span className="num text-ink-3">
                {t("overview.output.rate")}: <span className="font-semibold text-ink">{fmt.num(Math.round(live.rate))}</span> {t("common.perHour")}
              </span>
            </div>
            <Progress value={live.target ? live.output / live.target : 0} marker={shift.progress} thick label={t("overview.output.label")} />
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
              <span>{t("overview.shiftProgress")}</span>
              <span className="num">
                {fmt.time(shift.start)} – {fmt.time(shift.end)} · {fmt.pct(shift.progress, 0)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Pulse */}
      <KpiStrip columns={6}>
        <Kpi
          label={t("overview.kpi.efficiency")}
          icon={Activity}
          value={live.oee * 100}
          format={(n) => fmt.num(n, 1)}
          unit="%"
          hint={t("overview.kpi.efficiencyHint")}
          delta={delta(live.oee, hist.total.oee)}
          deltaLabel={td(`common.range.${range}d`)}
        />
        <Kpi
          label={t("overview.kpi.activeLines")}
          icon={Cog}
          value={live.activeLines}
          format={(n) => `${fmt.num(Math.round(n))} / ${fmt.num(live.totalLines)}`}
          hint={t("overview.kpi.activeLinesHint", { n: live.totalLines - live.activeLines })}
          href="/production"
          visual={
            <span className="flex gap-1" aria-hidden>
              {lines.map((l) => (
                <span key={l.id} className={cn("h-6 w-1.5 rounded-[1px]", l.status === "running" ? "bg-ok" : l.status === "idle" ? "bg-ink-3" : l.status === "changeover" ? "bg-info" : l.status === "maintenance" ? "bg-amber" : "bg-danger")} />
              ))}
            </span>
          }
        />
        <Kpi label={t("overview.kpi.orders")} icon={ClipboardList} value={wo.in_progress} format={(n) => fmt.num(Math.round(n))} hint={t("overview.kpi.ordersHint", { scheduled: wo.scheduled, paused: wo.paused })} href="/work-orders" />
        <Kpi label={t("overview.kpi.inventory")} icon={Boxes} value={inv.value} format={(n) => fmt.compactMoney(n)} hint={t("overview.kpi.inventoryHint", { n: inv.attention })} href="/inventory" />
        <Kpi
          label={t("overview.kpi.quality")}
          icon={ShieldCheck}
          value={live.quality * 100}
          format={(n) => fmt.num(n, 1)}
          unit="%"
          hint={t("overview.kpi.qualityHint", { n: live.rejected })}
          delta={delta(live.quality, hist.total.quality)}
          href="/quality"
        />
        <Kpi
          label={t("overview.kpi.availability")}
          icon={PackageCheck}
          value={availability * 100}
          format={(n) => fmt.num(n, 1)}
          unit="%"
          tone={availability < 0.9 ? "warn" : undefined}
          hint={t("overview.kpi.availabilityHint", { up: Math.round(availability * machines.length), total: machines.length })}
          href="/equipment"
        />
      </KpiStrip>

      {/* ---------------------------------------------------------------- Output trend + line status */}
      <div className="grid gap-4 lg:gap-5 xl:grid-cols-3">
        <ChartPanel
          className="xl:col-span-2"
          title={t("overview.trend.title")}
          subtitle={t("overview.trend.subtitle")}
          actions={rangeControl}
          height={280}
          empty={hist.rows.length === 0}
          legend={
            <>
              <LegendItem color={SERIES[0]} label={t("overview.trend.actual")} hidden={hidden.actual} onToggle={() => toggle("actual")} />
              <LegendItem color={MUTED} shape="dash" label={t("overview.trend.planned")} hidden={hidden.planned} onToggle={() => toggle("planned")} />
              <LegendItem color={SERIES[1]} shape="line" label={t("overview.trend.previous")} hidden={hidden.previous} onToggle={() => toggle("previous")} />
            </>
          }
          table={{
            columns: [t("common.date"), t("overview.trend.actual"), t("overview.trend.planned"), t("overview.trend.previous")],
            rows: hist.rows.map((r) => [fmt.dateShort(r.ts), r.actual, r.planned, r.previous ?? "—"]),
          }}
          footer={
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <div>
                <p className="label">{t("overview.trend.total")}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="display num text-[22px] text-ink">{fmt.num(hist.total.actual)}</span>
                  <Delta value={delta(hist.total.actual, hist.prevTotal.actual)} label={t("common.vsPrev")} />
                </p>
              </div>
              <div>
                <p className="label">{t("overview.trend.attainment")}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="display num text-[22px] text-ink">{fmt.pct(hist.total.planned ? hist.total.actual / hist.total.planned : 0)}</span>
                  <span className="text-[11.5px] text-ink-3">{t("common.vsTarget")}</span>
                </p>
              </div>
            </div>
          }
        >
          <ComposedChart data={hist.rows} margin={chart.margin} barCategoryGap="28%">
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis tickFormatter={(v: number) => fmt.compact(v)} {...chart.yAxis} />
            <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} unit={t("common.units")} />} />
            {!hidden.actual && <Bar dataKey="actual" name={t("overview.trend.actual")} fill={SERIES[0]} radius={[2, 2, 0, 0]} maxBarSize={22} {...chart.series} />}
            {!hidden.planned && <Line dataKey="planned" name={t("overview.trend.planned")} stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} type="step" {...chart.series} />}
            {!hidden.previous && <Line dataKey="previous" name={t("overview.trend.previous")} stroke={SERIES[1]} strokeWidth={2} dot={false} connectNulls type="monotone" {...chart.series} />}
          </ComposedChart>
        </ChartPanel>

        <Panel title={t("overview.lines.title")} subtitle={t("overview.lines.subtitle")} flush>
          <ul className="divide-y divide-line/70">
            {lines.map((line) => {
              const ll = lineLive(line, now);
              const product = products.find((p) => p.id === line.productId);
              return (
                <li key={line.id}>
                  <Link href={entityHref({ type: "line", id: line.id })} className="block px-4 py-2.5 transition-colors hover:bg-raised/70">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Code className="font-semibold text-ink">{line.code}</Code>
                        <span className="truncate text-[12.5px] text-ink-2">{product ? tl(product.name) : tl(line.name)}</span>
                      </span>
                      <StatusBadge kind="line" value={line.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={ll.target ? ll.output / ll.target : 0} marker={shift.progress} tone={LINE_TONE[line.status] === "ok" ? "accent" : LINE_TONE[line.status]} label={`${line.code} ${t("common.progress")}`} />
                      <span className="num w-[86px] shrink-0 text-end text-[12px] text-ink">
                        {fmt.num(ll.output)} <span className="text-ink-3">/ {fmt.num(ll.target)}</span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">{t("ops.planMarker")}</p>
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- Efficiency + supporting visuals */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5 xl:grid-cols-12">
        <ChartPanel
          className="xl:col-span-5"
          title={t("overview.eff.title")}
          subtitle={t("overview.eff.subtitle")}
          height={220}
          empty={hist.rows.length === 0}
          legend={
            <>
              <LegendItem color={SERIES[0]} shape="line" label={t("common.oee")} value={fmt.pct(hist.total.oee)} hidden={hidden.oee} onToggle={() => toggle("oee")} />
              <LegendItem color={SERIES[1]} shape="line" label={t("common.availability")} hidden={hidden.av} onToggle={() => toggle("av")} />
              <LegendItem color={SERIES[2]} shape="line" label={t("common.performance")} hidden={hidden.pf} onToggle={() => toggle("pf")} />
              <LegendItem color={SERIES[3]} shape="line" label={t("common.quality")} hidden={hidden.ql} onToggle={() => toggle("ql")} />
            </>
          }
          table={{
            columns: [t("common.date"), t("common.oee"), t("common.availability"), t("common.performance"), t("common.quality")],
            rows: hist.rows.map((r) => [fmt.dateShort(r.ts), `${fmt.num(r.oee, 1)}%`, `${fmt.num(r.availability, 1)}%`, `${fmt.num(r.performance, 1)}%`, `${fmt.num(r.quality, 1)}%`]),
          }}
        >
          <LineChart data={hist.rows} margin={chart.margin}>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis domain={[60, 100]} tickFormatter={(v: number) => `${fmt.num(v)}%`} {...chart.yAxis} />
            <Tooltip cursor={chart.cursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} formatValue={(v) => `${fmt.num(v, 1)}%`} />} />
            {!hidden.av && <Line dataKey="availability" name={t("common.availability")} stroke={SERIES[1]} strokeWidth={1.5} dot={false} type="monotone" {...chart.series} />}
            {!hidden.pf && <Line dataKey="performance" name={t("common.performance")} stroke={SERIES[2]} strokeWidth={1.5} dot={false} type="monotone" {...chart.series} />}
            {!hidden.ql && <Line dataKey="quality" name={t("common.quality")} stroke={SERIES[3]} strokeWidth={1.5} dot={false} type="monotone" {...chart.series} />}
            {!hidden.oee && <Line dataKey="oee" name={t("common.oee")} stroke={SERIES[0]} strokeWidth={2.5} dot={false} type="monotone" {...chart.series} />}
          </LineChart>
        </ChartPanel>

        <ChartPanel
          className="xl:col-span-3"
          title={t("overview.completed.title")}
          subtitle={t("overview.completed.count", { n: hist.done.length, units: fmt.num(hist.done.reduce((s, o) => s + o.completedQty, 0)) })}
          actions={<Delta value={delta(hist.done.length, hist.prevDone.length)} />}
          height={220}
          empty={hist.done.length === 0}
          table={{ columns: [t("common.date"), t("overview.completed.orders")], rows: hist.doneByDay.map((r) => [fmt.dateShort(r.ts), r.orders]) }}
        >
          <BarChart data={hist.doneByDay} margin={chart.margin} barCategoryGap="30%">
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis allowDecimals={false} {...chart.yAxis} width={24} />
            <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} />} />
            <Bar dataKey="orders" name={t("overview.completed.orders")} fill={SERIES[1]} radius={[2, 2, 0, 0]} maxBarSize={16} {...chart.series} />
          </BarChart>
        </ChartPanel>

        <Panel className="lg:col-span-2 xl:col-span-4" title={t("overview.downtime.title")} subtitle={t("overview.downtime.subtitle")}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="label">{t("overview.downtime.total")}</p>
              <p className="display num mt-1 text-[26px] text-ink">{fmt.duration(hist.dtMinutes)}</p>
            </div>
            <div className="text-end">
              <Delta value={delta(hist.dtMinutes, hist.prevDtMinutes)} goodWhen="down" label={t("common.vsPrev")} />
              <p className="num mt-0.5 text-[11.5px] text-ink-3">{t("overview.downtime.events", { n: hist.dtEvents })}</p>
            </div>
          </div>
          {hist.dtByCause.length === 0 ? (
            <EmptyState title={t("common.noData")} />
          ) : (
            <RankBars rows={hist.dtByCause.map((c) => ({ key: c.key, label: td(`cause.${c.key}`), value: c.value }))} color={SERIES[4]} formatValue={(v) => fmt.duration(v)} />
          )}
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- Quality + inventory */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Panel
          title={t("overview.quality.title")}
          subtitle={t("overview.quality.subtitle")}
          actions={
            <Link href="/quality" className="inline-flex items-center gap-1 text-[12px] font-medium text-forge-text hover:underline">
              {t("nav.quality")}
              <ArrowUpRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
            </Link>
          }
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label">{t("overview.quality.passRate")}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="display num text-[26px] text-ink">{fmt.pct(hist.total.quality, 2)}</span>
                <Delta value={delta(hist.total.quality, hist.prevTotal.quality)} />
              </p>
            </div>
            <Sparkline data={hist.rows.map((r) => r.quality)} color={SERIES[3]} width={150} height={36} />
          </div>
          <RankBars
            rows={hist.byLine
              .filter((l) => l.actual > 0)
              .map((l) => {
                const line = lines.find((x) => x.id === l.lineId)!;
                return { key: l.lineId, label: `${line.code} · ${tl(line.name)}`, value: 1 - l.quality, color: lineColor(l.lineId) };
              })
              .sort((a, b) => b.value - a.value)}
            formatValue={(v) => fmt.pct(v, 2)}
          />
        </Panel>

        <Panel
          title={t("overview.inv.title")}
          subtitle={t("overview.inv.subtitle")}
          flush
          actions={
            <Link href="/inventory" className="inline-flex items-center gap-1 text-[12px] font-medium text-forge-text hover:underline">
              {t("nav.inventory")}
              <ArrowUpRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
            </Link>
          }
        >
          {invAlerts.length === 0 ? (
            <EmptyState icon={PackageCheck} title={t("overview.inv.empty")} />
          ) : (
            <ul className="divide-y divide-line/70">
              {invAlerts.map(({ item, status }) => (
                <li key={item.id}>
                  <Link href={entityHref({ type: "item", id: item.id })} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised/70">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Code className="text-ink-2">{item.sku}</Code>
                        <span className="truncate text-[12.5px] font-medium text-ink">{tl(item.name)}</span>
                      </span>
                      <span className="num mt-0.5 block text-[11.5px] text-ink-3">{t("overview.inv.onHand", { qty: fmt.num(item.quantity), unit: item.unit, reorder: fmt.num(item.reorderLevel) })}</span>
                    </span>
                    <span className="hidden w-20 sm:block">
                      <Progress value={item.reorderLevel ? item.quantity / item.reorderLevel : 0} tone={status === "low" ? "warn" : "danger"} label={tl(item.name)} />
                    </span>
                    <StatusBadge kind="stock" value={status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- Alerts + activity */}
      <div id="alerts" className="grid scroll-mt-16 gap-4 lg:gap-5 xl:grid-cols-2">
        <AlertCenter />

        <Panel
          title={t("overview.feed.title")}
          subtitle={t("overview.feed.subtitle")}
          flush
          actions={
            <Segmented size="sm" label={t("common.category")} value={feedCat} onChange={setFeedCat} options={FEED_CATEGORIES.map((c) => ({ value: c, label: c === "all" ? t("common.all") : td(`cat.${c}`) }))} />
          }
        >
          {feed.length === 0 ? (
            <EmptyState title={t("overview.feed.empty")} />
          ) : (
            <ol className="divide-y divide-line/70">
              {feed.map((ev) => {
                const Icon = SEVERITY_ICON[ev.severity];
                return (
                  <li key={ev.id} className="flex animate-fade items-start gap-3 px-4 py-2.5">
                    <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", toneText[SEVERITY_TONE[ev.severity]])} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug text-ink">{tm(ev.msg)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                        <span>{td(`cat.${ev.category}`)}</span>
                        <span aria-hidden>·</span>
                        <span>{td(`severity.${ev.severity}`)}</span>
                        {ev.entity && (
                          <>
                            <span aria-hidden>·</span>
                            <Link href={entityHref(ev.entity)} className="code text-[11px] text-ink-2 hover:text-forge-text">
                              {ev.entity.id}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <time dateTime={new Date(ev.at).toISOString()} className="num shrink-0 text-[11.5px] text-ink-3" title={fmt.dateTime(ev.at)}>
                      {fmt.relative(ev.at, now)}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </Page>
  );
}
