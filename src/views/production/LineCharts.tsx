"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { DowntimeCause, ID } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { dayKey } from "@/lib/time";
import { useForge } from "@/store/store";
import { aggregateByDay, aggregateTotal, downtimeInRange, filterStats, historyWindow } from "@/store/selectors";
import { ChartPanel, ChartTooltip, MUTED, SERIES, useChartProps } from "@/components/charts/kit";
import { LegendItem, Segmented } from "@/components/ui/primitives";
import { SectionTitle } from "./shared";

const CAUSES: DowntimeCause[] = ["mechanical", "electrical", "changeover", "material", "quality", "planned"];
const CAUSE_COLOR: Record<DowntimeCause, string> = {
  mechanical: SERIES[0],
  electrical: SERIES[1],
  changeover: SERIES[2],
  material: SERIES[3],
  quality: SERIES[4],
  planned: SERIES[5],
};
type Range = "7" | "14" | "30" | "60";
type OeeKey = "oee" | "availability" | "performance" | "quality";

/** History charts for one line: output vs plan, OEE trend, downtime by cause. */
export function LineCharts({ lineId }: { lineId: ID }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const chart = useChartProps();
  const dailyStats = useForge((s) => s.dailyStats);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const lines = useForge((s) => s.lines);
  const now = useForge((s) => s.now);
  const [range, setRange] = useState<Range>("14");
  const [hidden, setHidden] = useState<Partial<Record<OeeKey, boolean>>>({});

  const win = useMemo(() => historyWindow(now, Number(range)), [now, range]);
  const { days, total } = useMemo(() => {
    const stats = filterStats(dailyStats, { from: win.from, to: win.to, lineIds: [lineId] });
    return { days: aggregateByDay(stats, lines), total: aggregateTotal(stats, lines) };
  }, [dailyStats, lines, lineId, win]);

  const downtime = useMemo(() => {
    const byDay = new Map<string, Record<DowntimeCause, number>>();
    for (const e of downtimeInRange(downtimeEvents, { from: win.from, to: win.to, lineIds: [lineId] })) {
      const key = dayKey(e.start);
      let row = byDay.get(key);
      if (!row) byDay.set(key, (row = { mechanical: 0, electrical: 0, changeover: 0, material: 0, quality: 0, planned: 0 }));
      row[e.cause] += e.minutes;
    }
    const rows = days.map((d) => ({ ts: d.ts, ...(byDay.get(d.date) ?? { mechanical: 0, electrical: 0, changeover: 0, material: 0, quality: 0, planned: 0 }) }));
    const totals = CAUSES.map((c) => ({ cause: c, minutes: rows.reduce((s, r) => s + r[c], 0) }));
    return { rows, totals, sum: totals.reduce((s, x) => s + x.minutes, 0) };
  }, [downtimeEvents, days, lineId, win]);

  const dayTick = (ts: number) => fmt.dateShort(ts);
  const empty = days.length === 0;
  const toggle = (k: OeeKey) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  const oeeSeries: { key: OeeKey; label: string; color: string; width: number }[] = [
    { key: "oee", label: t("common.oee"), color: SERIES[0], width: 2.5 },
    { key: "availability", label: t("common.availability"), color: SERIES[1], width: 1.5 },
    { key: "performance", label: t("common.performance"), color: SERIES[2], width: 1.5 },
    { key: "quality", label: t("common.quality"), color: SERIES[3], width: 1.5 },
  ];
  const oeeData = useMemo(
    () => days.map((d) => ({ ts: d.ts, oee: d.oee * 100, availability: d.availability * 100, performance: d.performance * 100, quality: d.quality * 100 })),
    [days],
  );
  const oeeFloor = Math.max(0, Math.floor((Math.min(100, ...oeeData.map((d) => Math.min(d.oee, d.availability, d.performance, d.quality))) - 5) / 10) * 10);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title={t("production.history.title")}
        hint={t("production.history.hint")}
        actions={
          <Segmented
            size="sm"
            label={t("common.dateRange")}
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: t("common.range.7d") },
              { value: "14", label: t("common.range.14d") },
              { value: "30", label: t("common.range.30d") },
              { value: "60", label: t("common.range.60d") },
            ]}
          />
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel
          className="xl:col-span-2"
          title={t("production.chart.output")}
          subtitle={
            empty
              ? undefined
              : t("production.chart.outputSub", { actual: fmt.num(total.actual), planned: fmt.num(total.planned), pct: fmt.pct(total.planned > 0 ? total.actual / total.planned : 0) })
          }
          empty={empty}
          legend={
            <>
              <LegendItem color={SERIES[0]} label={t("common.actual")} />
              <LegendItem color={MUTED} label={t("common.planned")} shape="dash" />
            </>
          }
          table={{
            columns: [t("common.date"), t("common.planned"), t("common.actual"), t("production.rejected")],
            rows: days.map((d) => [fmt.dateShort(d.ts), d.planned, d.actual, d.rejected]),
          }}
        >
          <ComposedChart data={days} margin={chart.margin}>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis tickFormatter={(v: number) => fmt.compact(v)} {...chart.yAxis} />
            <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} unit={t("common.units")} />} />
            <Bar dataKey="actual" name={t("common.actual")} fill={SERIES[0]} radius={[2, 2, 0, 0]} maxBarSize={22} {...chart.series} />
            <Line dataKey="planned" name={t("common.planned")} stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} type="step" {...chart.series} />
          </ComposedChart>
        </ChartPanel>

        <ChartPanel
          title={t("production.chart.oee")}
          subtitle={empty ? undefined : t("production.chart.oeeSub", { oee: fmt.pct(total.oee) })}
          empty={empty}
          legend={oeeSeries.map((s) => (
            <LegendItem key={s.key} color={s.color} label={s.label} shape="line" hidden={hidden[s.key]} onToggle={() => toggle(s.key)} />
          ))}
          table={{
            columns: [t("common.date"), `${t("common.oee")} %`, `${t("common.availability")} %`, `${t("common.performance")} %`, `${t("common.quality")} %`],
            rows: oeeData.map((d) => [fmt.dateShort(d.ts), Math.round(d.oee * 10) / 10, Math.round(d.availability * 10) / 10, Math.round(d.performance * 10) / 10, Math.round(d.quality * 10) / 10]),
          }}
        >
          <LineChart data={oeeData} margin={chart.margin}>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis domain={[oeeFloor, 100]} tickFormatter={(v: number) => `${fmt.num(v)}%`} {...chart.yAxis} />
            <Tooltip cursor={chart.cursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} formatValue={(v) => `${fmt.num(v, 1)}%`} />} />
            {[...oeeSeries].reverse().map((s) =>
              hidden[s.key] ? null : <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.width} dot={false} type="monotone" {...chart.series} />,
            )}
          </LineChart>
        </ChartPanel>

        <ChartPanel
          title={t("production.chart.downtime")}
          subtitle={empty ? undefined : t("production.chart.downtimeSub", { total: fmt.duration(downtime.sum) })}
          empty={empty || downtime.sum === 0}
          legend={downtime.totals
            .filter((x) => x.minutes > 0)
            .map((x) => (
              <LegendItem key={x.cause} color={CAUSE_COLOR[x.cause]} label={td(`cause.${x.cause}`)} value={fmt.duration(x.minutes)} />
            ))}
          table={{
            columns: [t("common.date"), ...CAUSES.map((c) => `${td(`cause.${c}`)} (${t("common.minutes")})`)],
            rows: downtime.rows.map((r) => [fmt.dateShort(r.ts), ...CAUSES.map((c) => r[c])]),
          }}
        >
          <BarChart data={downtime.rows} margin={chart.margin}>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="ts" tickFormatter={dayTick} {...chart.xAxis} />
            <YAxis tickFormatter={(v: number) => fmt.num(v)} {...chart.yAxis} />
            <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatLabel={(l) => fmt.date(Number(l))} unit={t("common.minutes")} />} />
            {CAUSES.map((c) => (
              <Bar key={c} dataKey={c} stackId="d" name={td(`cause.${c}`)} fill={CAUSE_COLOR[c]} maxBarSize={22} {...chart.series} />
            ))}
          </BarChart>
        </ChartPanel>
      </div>
    </section>
  );
}
