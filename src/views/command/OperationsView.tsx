"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, FlaskConical, Gauge as GaugeIcon, Pause, Play, Timer, TriangleAlert, XOctagon } from "lucide-react";
import { machineTelemetry } from "@/domain/rules";
import type { ProductionLine } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { HOUR, MIN, dayKey, shiftAt } from "@/lib/time";
import { aggregateByDay, aggregateByLine, aggregateTotal, filterStats, historyWindow, lineLive, networkLive } from "@/store/selectors";
import { useForge } from "@/store/store";
import { ChartPanel, ChartTooltip, MUTED, SERIES, useChartProps } from "@/components/charts/kit";
import { Kpi, KpiStrip, Page, PageHeader } from "@/components/ui/page";
import { Button, Code, LegendItem, Panel, Progress, Segmented, Tooltip as Tip, cn, toneBg } from "@/components/ui/primitives";
import { LINE_TONE, MACHINE_TONE, StatusBadge } from "@/components/ui/status";
import { AlertCenter } from "./AlertCenter";

type Range = "shift" | "today" | "7d" | "30d";
const MAX_SAMPLES = 60;

/**
 * Rolling window of the network output rate. Samples are taken from the store
 * on each simulation tick (a subscription, so no render-time side effects).
 */
function useRateSamples() {
  const [samples, setSamples] = useState<{ ts: number; rate: number }[]>([]);
  useEffect(() => {
    let lastTick = useForge.getState().tick;
    let lastOutput = useForge.getState().lines.reduce((s, l) => s + l.shiftOutput, 0);
    return useForge.subscribe((s) => {
      if (s.tick === lastTick) return;
      const output = s.lines.reduce((sum, l) => sum + l.shiftOutput, 0);
      const ticks = s.tick - lastTick;
      // Units in the step → units per hour (one tick = one simulated minute). Negative = shift rollover.
      const perHour = output >= lastOutput && ticks > 0 ? ((output - lastOutput) / ticks) * 60 : 0;
      lastTick = s.tick;
      lastOutput = output;
      setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), { ts: s.now, rate: perHour }]);
    });
  }, []);
  return samples;
}

export function OperationsView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const chart = useChartProps();
  const [range, setRange] = useState<Range>("shift");

  const now = useForge((s) => s.now);
  const tick = useForge((s) => s.tick);
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const products = useForge((s) => s.products);
  const workOrders = useForge((s) => s.workOrders);
  const dailyStats = useForge((s) => s.dailyStats);
  const simRunning = useForge((s) => s.simRunning);
  const setSimRunning = useForge((s) => s.setSimRunning);
  const samples = useRateSamples();

  const shift = shiftAt(now);
  const isLive = range === "shift" || range === "today";
  const days = range === "30d" ? 30 : 7;
  const rangeLabel = td(`common.range.${range}`);

  /** Live rows: the current shift, or the whole production day when "Today" is selected. */
  const liveRows = useMemo(() => {
    const dayLines: ProductionLine[] =
      range === "today"
        ? lines.map((l) => ({
            ...l,
            shiftOutput: l.shiftOutput + (l.dayCarryOutput ?? 0),
            shiftRejected: l.shiftRejected + (l.dayCarryRejected ?? 0),
            shiftDowntimeMin: l.shiftDowntimeMin + (l.dayCarryDowntimeMin ?? 0),
          }))
        : lines;
    // Shifts completed earlier in the production day (A=0, B=1, C=2) extend the target and the clock.
    const done = range === "today" ? { A: 0, B: 1, C: 2 }[shift.id] : 0;
    const elapsedMin = shift.elapsedMin + done * 480;
    return lines.map((line, i) => {
      const l = dayLines[i];
      const base = lineLive(line, now);
      const target = line.shiftTarget * (done + 1);
      const expected = line.shiftTarget * (done + shift.progress);
      const runMin = Math.max(0, elapsedMin - l.shiftDowntimeMin);
      const ideal = (line.nominalRate * runMin) / 60;
      const availability = elapsedMin > 0 ? runMin / elapsedMin : 0;
      const performance = ideal > 0 ? Math.min(1, l.shiftOutput / ideal) : 0;
      const quality = l.shiftOutput > 0 ? (l.shiftOutput - l.shiftRejected) / l.shiftOutput : 0;
      const wo = workOrders.find((o) => o.lineId === line.id && (o.status === "in_progress" || o.status === "paused"));
      const rate = range === "today" ? (runMin > 0 ? (l.shiftOutput / runMin) * 60 : 0) : base.rate;
      const eta = wo && wo.status === "in_progress" && line.status === "running" && rate > 0 ? now + ((wo.plannedQty - wo.completedQty) / rate) * HOUR : null;
      return { line, output: l.shiftOutput, target, expected, rejected: l.shiftRejected, downtimeMin: l.shiftDowntimeMin, oee: availability * performance * quality, rate, wo, eta };
    });
  }, [lines, workOrders, now, range, shift.id, shift.elapsedMin, shift.progress]);

  const today = dayKey(now);
  const hist = useMemo(() => {
    const w = historyWindow(now, days);
    const stats = filterStats(dailyStats, { from: w.from, to: w.to });
    return { byLine: aggregateByLine(stats, lines), total: aggregateTotal(stats, lines), byDay: aggregateByDay(stats, lines) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, days, dailyStats, lines.length]);

  const net = useMemo(() => networkLive(lines, now), [lines, now]);
  const telemetry = useMemo(() => new Map(machines.map((m) => [m.id, machineTelemetry(m, tick)])), [machines, tick]);
  const runningMachines = machines.filter((m) => m.status === "running" || m.status === "warning");
  const utilization = runningMachines.length ? runningMachines.reduce((s, m) => s + (telemetry.get(m.id)?.load ?? 0), 0) / runningMachines.length / 100 : 0;

  const totals = isLive
    ? {
        output: liveRows.reduce((s, r) => s + r.output, 0),
        expected: liveRows.reduce((s, r) => s + r.expected, 0),
        rejected: liveRows.reduce((s, r) => s + r.rejected, 0),
        downtime: liveRows.reduce((s, r) => s + r.downtimeMin, 0),
      }
    : { output: hist.total.actual, expected: hist.total.planned, rejected: hist.total.rejected, downtime: hist.total.downtimeMin };

  return (
    <Page>
      <PageHeader
        eyebrow={t("ops.eyebrow")}
        title={t("ops.title")}
        subtitle={t("ops.subtitle")}
        actions={
          <>
            <Segmented
              label={t("ops.range")}
              value={range}
              onChange={setRange}
              options={[
                { value: "shift", label: t("common.range.shift") },
                { value: "today", label: t("common.range.today") },
                { value: "7d", label: t("common.range.7d") },
                { value: "30d", label: t("common.range.30d") },
              ]}
            />
            <Button icon={simRunning ? Pause : Play} variant={simRunning ? "secondary" : "primary"} aria-pressed={!simRunning} onClick={() => setSimRunning(!simRunning)}>
              {simRunning ? t("shell.simPause") : t("shell.simResume")}
            </Button>
          </>
        }
      />

      {/* Simulation banner — always visible so nobody mistakes this for real telemetry. */}
      <div role="note" className="flex items-start gap-3 rounded-md border border-dashed border-line-2 bg-base px-4 py-2.5">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-forge-text" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">{t("ops.simBanner")}</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold", simRunning ? "text-ok" : "text-amber")}>
          <span aria-hidden className={cn("size-1.5 rounded-full", simRunning ? "animate-pulse-dot bg-ok" : "bg-amber")} />
          {simRunning ? t("shell.simRunning") : t("shell.simPaused")}
        </span>
      </div>

      <KpiStrip columns={6}>
        <Kpi label={t("ops.kpi.status")} icon={Activity} value={net.activeLines} format={(n) => `${fmt.num(Math.round(n))} / ${fmt.num(net.totalLines)}`} hint={t("ops.kpi.statusValue", { n: net.activeLines, total: net.totalLines })} />
        <Kpi
          label={t("ops.kpi.output")}
          value={totals.output}
          format={(n) => fmt.num(Math.round(n))}
          unit={t("common.units")}
          hint={t("ops.kpi.outputHint", { pct: fmt.pct(totals.expected ? totals.output / totals.expected : 0, 0) })}
          tone={totals.expected && totals.output / totals.expected < 0.9 ? "warn" : undefined}
        />
        <Kpi label={t("ops.kpi.rate")} icon={GaugeIcon} value={net.rate} format={(n) => fmt.num(Math.round(n))} unit={t("common.perHour")} hint={t("common.live")} />
        <Kpi label={t("ops.kpi.utilization")} value={utilization * 100} format={(n) => fmt.num(n, 0)} unit="%" hint={t("ops.kpi.utilizationHint")} />
        <Kpi label={t("ops.kpi.downtime")} icon={TriangleAlert} value={totals.downtime} format={(n) => fmt.duration(n)} hint={rangeLabel} />
        <Kpi
          label={t("ops.kpi.rejected")}
          icon={XOctagon}
          value={totals.rejected}
          format={(n) => fmt.num(Math.round(n))}
          unit={t("common.units")}
          hint={t("ops.kpi.rejectedHint", { pct: fmt.pct(totals.output ? totals.rejected / totals.output : 0) })}
        />
      </KpiStrip>

      {/* ------------------------------------------------------------ Production monitoring */}
      <Panel
        title={t("ops.monitor.title")}
        subtitle={isLive ? t("ops.monitor.live", { range: range === "today" ? t("ops.today.note") : rangeLabel }) : t("ops.monitor.history", { range: rangeLabel })}
        flush
        actions={isLive ? <span className="text-[11px] text-ink-3">{t("ops.planMarker")}</span> : undefined}
      >
        {/* Desktop: dense monitoring table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">{t("ops.monitor.title")}</caption>
            <thead>
              <tr className="border-b border-line bg-canvas/50">
                {[t("ops.col.line"), t("ops.col.product"), t("common.status"), t("ops.col.actual"), t("ops.col.target"), t("ops.col.progress"), t("ops.col.efficiency"), isLive ? t("ops.col.eta") : t("common.downtime")].map((h, i) => (
                  <th key={h} scope="col" className={cn("label h-9 whitespace-nowrap px-4 font-normal", i === 3 || i === 4 ? "text-end" : "text-start")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const product = products.find((p) => p.id === line.productId);
                const r = liveRows[i];
                const h = hist.byLine.find((x) => x.lineId === line.id)!;
                const actual = isLive ? r.output : h.actual;
                const target = isLive ? r.target : h.planned;
                const oee = isLive ? r.oee : h.oee;
                const ratio = target ? actual / target : 0;
                return (
                  <tr key={line.id} className="border-b border-line/60 last:border-b-0 hover:bg-raised/60">
                    <td className="px-4 py-3">
                      <Link href={entityHref({ type: "line", id: line.id })} className="group flex items-center gap-2.5">
                        <span aria-hidden className={cn("h-8 w-[3px] rounded-[1px]", toneBg[LINE_TONE[line.status]])} />
                        <span>
                          <Code className="block text-[13px] font-semibold text-ink group-hover:text-forge-text">{line.code}</Code>
                          <span className="block text-[11.5px] text-ink-3">{tl(line.name)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-ink">{product ? tl(product.name) : "—"}</span>
                      {isLive && r.wo && (
                        <Link href={entityHref({ type: "workOrder", id: r.wo.id })} className="code text-[11px] text-ink-3 hover:text-forge-text">
                          {r.wo.id}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge kind="line" value={line.status} />
                    </td>
                    <td className="num px-4 py-3 text-end text-[14px] font-semibold text-ink">{fmt.num(actual)}</td>
                    <td className="num px-4 py-3 text-end text-ink-2">{fmt.num(target)}</td>
                    <td className="w-[22%] min-w-[150px] px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Progress value={ratio} marker={isLive ? (r.target ? r.expected / r.target : 0) : undefined} tone={isLive && line.status !== "running" ? LINE_TONE[line.status] : "accent"} thick label={`${line.code} ${t("common.progress")}`} />
                        <span className="num w-10 shrink-0 text-end text-[12px] text-ink-2">{fmt.pct(ratio, 0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("num font-semibold", oee >= 0.75 ? "text-ok" : oee >= 0.6 ? "text-amber" : "text-danger")}>{fmt.pct(oee)}</span>
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-ink-2">
                      {isLive ? (r.eta ? fmt.dateTime(r.eta) : r.wo ? t("ops.eta.stopped") : t("ops.eta.noOrder")) : fmt.duration(h.downtimeMin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: one compact block per line */}
        <ul className="divide-y divide-line/70 md:hidden">
          {lines.map((line, i) => {
            const product = products.find((p) => p.id === line.productId);
            const r = liveRows[i];
            const h = hist.byLine.find((x) => x.lineId === line.id)!;
            const actual = isLive ? r.output : h.actual;
            const target = isLive ? r.target : h.planned;
            const oee = isLive ? r.oee : h.oee;
            return (
              <li key={line.id}>
                <Link href={entityHref({ type: "line", id: line.id })} className="block px-4 py-3 active:bg-raised">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Code className="text-[13px] font-semibold text-ink">{line.code}</Code>
                      <span className="truncate text-[12.5px] text-ink-2">{product ? tl(product.name) : tl(line.name)}</span>
                    </span>
                    <StatusBadge kind="line" value={line.status} />
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between gap-3">
                    <span className="num text-[18px] font-semibold text-ink">
                      {fmt.num(actual)} <span className="text-[12px] font-normal text-ink-3">/ {fmt.num(target)}</span>
                    </span>
                    <span className="num text-[12px] text-ink-2">
                      {t("common.oee")} <span className="font-semibold text-ink">{fmt.pct(oee, 0)}</span>
                    </span>
                  </div>
                  <Progress className="mt-2" value={target ? actual / target : 0} marker={isLive ? (r.target ? r.expected / r.target : 0) : undefined} thick label={`${line.code} ${t("common.progress")}`} />
                  {isLive && (
                    <p className="num mt-1.5 text-[11.5px] text-ink-3">
                      {t("ops.col.eta")}: {r.eta ? fmt.dateTime(r.eta) : r.wo ? t("ops.eta.stopped") : t("ops.eta.noOrder")}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-3">
        {/* ---------------------------------------------------------- Rate / history chart */}
        {isLive ? (
          <ChartPanel
            className="xl:col-span-2"
            title={t("ops.rate.title")}
            subtitle={t("ops.rate.subtitle")}
            height={230}
            table={{ columns: [t("common.time"), `${t("ops.rate.series")} (${t("common.perHour")})`], rows: samples.map((s) => [fmt.time(s.ts), Math.round(s.rate)]) }}
            footer={samples.length < 2 ? <p className="text-[12px] text-ink-3">{simRunning ? t("ops.rate.collecting") : t("ops.rate.collectingHint")}</p> : undefined}
          >
            <AreaChart data={samples} margin={chart.margin}>
              <CartesianGrid {...chart.grid} />
              <XAxis dataKey="ts" tickFormatter={(v: number) => fmt.time(v)} {...chart.xAxis} />
              <YAxis tickFormatter={(v: number) => fmt.num(v)} domain={[0, "auto"]} {...chart.yAxis} />
              <Tooltip cursor={chart.cursor} content={<ChartTooltip formatLabel={(l) => fmt.time(Number(l))} unit={t("common.perHour")} formatValue={(v) => fmt.num(Math.round(v))} />} />
              <Area dataKey="rate" name={t("ops.rate.series")} type="stepAfter" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} isAnimationActive={false} />
            </AreaChart>
          </ChartPanel>
        ) : (
          <ChartPanel
            className="xl:col-span-2"
            title={t("ops.history.title")}
            subtitle={t("ops.history.subtitle")}
            height={230}
            empty={hist.byDay.length === 0}
            legend={
              <>
                <LegendItem color={SERIES[0]} label={t("common.actual")} />
                <LegendItem color={MUTED} shape="dash" label={t("common.planned")} />
              </>
            }
            table={{ columns: [t("common.date"), t("common.actual"), t("common.planned")], rows: hist.byDay.map((d) => [fmt.dateShort(d.ts), d.actual, d.planned]) }}
          >
            <ComposedChart data={hist.byDay} margin={chart.margin} barCategoryGap="28%">
              <CartesianGrid {...chart.grid} />
              <XAxis dataKey="ts" tickFormatter={(v: number) => fmt.dateShort(v)} {...chart.xAxis} />
              <YAxis tickFormatter={(v: number) => fmt.compact(v)} {...chart.yAxis} />
              <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} unit={t("common.units")} />} />
              <Bar dataKey="actual" name={t("common.actual")} fill={SERIES[0]} radius={[2, 2, 0, 0]} maxBarSize={22} {...chart.series} />
              <Line dataKey="planned" name={t("common.planned")} stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} type="step" {...chart.series} />
            </ComposedChart>
          </ChartPanel>
        )}

        {/* ---------------------------------------------------------- Shift timeline */}
        <Panel title={t("ops.shift.title")} subtitle={td(`shift.${shift.id}`)}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="display num text-[34px] text-ink">{fmt.pct(shift.progress, 0)}</span>
            <span className="num text-[12px] text-ink-3">{t("ops.kpi.shiftHint", { elapsed: fmt.duration(shift.elapsedMin), end: fmt.time(shift.end) })}</span>
          </div>
          <div className="relative mt-4" aria-hidden>
            <div className="grid h-9 grid-cols-8 gap-px overflow-hidden rounded-sm bg-line">
              {Array.from({ length: 8 }, (_, h) => {
                const filled = Math.max(0, Math.min(1, shift.progress * 8 - h));
                return (
                  <div key={h} className="relative bg-canvas">
                    <div className="absolute inset-y-0 start-0 bg-forge/25" style={{ width: `${filled * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <span className="absolute -top-1 h-11 w-0.5 bg-forge" style={{ insetInlineStart: `${shift.progress * 100}%` }} />
          </div>
          <div className="num mt-1.5 flex justify-between text-[11px] text-ink-3">
            {[0, 2, 4, 6, 8].map((h) => (
              <span key={h}>{fmt.time(shift.start + h * HOUR)}</span>
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
            <div>
              <dt className="label">{t("common.availability")}</dt>
              <dd className="num mt-1 text-[15px] font-semibold text-ink">{fmt.pct(net.availability)}</dd>
            </div>
            <div>
              <dt className="label">{t("common.performance")}</dt>
              <dd className="num mt-1 text-[15px] font-semibold text-ink">{fmt.pct(net.performance)}</dd>
            </div>
            <div>
              <dt className="label">{t("common.quality")}</dt>
              <dd className="num mt-1 text-[15px] font-semibold text-ink">{fmt.pct(net.quality)}</dd>
            </div>
            <div>
              <dt className="label">{t("common.oee")}</dt>
              <dd className="num mt-1 text-[15px] font-semibold text-forge-text">{fmt.pct(net.oee)}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Timer aria-hidden className="size-3.5" />
            <span className="num">
              {t("shell.simClock")}: {fmt.dateTime(now)} · +{fmt.num(Math.round((tick * MIN) / MIN))} {t("common.minutes")}
            </span>
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-3">
        {/* ---------------------------------------------------------- Machine utilization grid */}
        <Panel className="xl:col-span-2" title={t("ops.machines.title")} subtitle={t("ops.machines.subtitle")}>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {lines.map((line) => (
              <div key={line.id} className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Link href={entityHref({ type: "line", id: line.id })} className="flex min-w-0 items-center gap-2 hover:text-forge-text">
                    <Code className="font-semibold text-ink">{line.code}</Code>
                    <span className="truncate text-[12px] text-ink-3">{tl(line.name)}</span>
                  </Link>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {machines
                    .filter((m) => m.lineId === line.id)
                    .sort((a, b) => a.station - b.station)
                    .map((m) => {
                      const tel = telemetry.get(m.id)!;
                      return (
                        <Tip key={m.id} side="top" label={`${m.id} · ${td(`mstatus.${m.status}`)} · ${t("common.load")} ${fmt.num(tel.load)}%`} className="block">
                          <Link href={entityHref({ type: "machine", id: m.id })} aria-label={`${m.id}, ${tl(m.name)}, ${td(`mstatus.${m.status}`)}, ${t("common.load")} ${tel.load}%`} className="relative block h-12 w-full overflow-hidden rounded-sm border border-line bg-canvas hover:border-line-2">
                            <span aria-hidden className={cn("absolute inset-x-0 bottom-0 opacity-30 transition-[height] duration-700", toneBg[MACHINE_TONE[m.status]])} style={{ height: `${Math.max(6, tel.load)}%` }} />
                            <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", toneBg[MACHINE_TONE[m.status]])} />
                            <span className="relative flex h-full flex-col justify-between p-1.5">
                              <span className="code text-[10px] text-ink-2">{m.id.slice(3)}</span>
                              <span className="num text-[11.5px] font-semibold text-ink">{fmt.num(tel.load)}%</span>
                            </span>
                          </Link>
                        </Tip>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
            {(["running", "warning", "idle", "maintenance", "offline"] as const).map((s) => (
              <LegendItem key={s} color={`var(--${{ running: "ok", warning: "amber", idle: "ink-3", maintenance: "info", offline: "danger" }[s]})`} label={td(`mstatus.${s}`)} value={fmt.num(machines.filter((m) => m.status === s).length)} />
            ))}
          </div>
        </Panel>

        <AlertCenter compact />
      </div>
    </Page>
  );
}
