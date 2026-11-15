"use client";
/** Analytics sections: Production performance and Downtime analysis. */
import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import type { DowntimeCause } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { dayKey } from "@/lib/time";
import { delta, sumBy } from "@/store/selectors";
import { ChartPanel, ChartTooltip, MUTED, SERIES, lineColor, useChartProps } from "@/components/charts/kit";
import { Kpi, KpiStrip, useLookup } from "@/components/ui/page";
import { Code, LegendItem } from "@/components/ui/primitives";
import { ratio, type AnalyticsScope } from "./analytics-model";
import { CAUSES, Insight, RankPanel, causeColor, useDayLabel, useNarrow, useSeriesToggle, type RankRow } from "./shared";

const vs = (cur: number, prev: number | null | undefined) => (prev === null || prev === undefined ? null : delta(cur, prev));

/* ------------------------------------------------------------------ */
/* Production performance                                              */
/* ------------------------------------------------------------------ */

export function ProductionSection({ scope }: { scope: AnalyticsScope }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const day = useDayLabel();
  const narrow = useNarrow();
  const height = narrow ? 220 : 280;
  const { total, prev, byDay, byLine, activeLines, stats, empty } = scope;

  const lineKeys = useMemo(() => activeLines.map((l) => l.id), [activeLines]);
  const lineToggle = useSeriesToggle(lineKeys);
  const pvaToggle = useSeriesToggle(PVA_KEYS);

  const outputByDay = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const s of stats) {
      let row = m.get(s.date);
      if (!row) m.set(s.date, (row = { ts: s.ts }));
      row[s.lineId] = (row[s.lineId] ?? 0) + s.actual;
    }
    return [...m.values()].sort((a, b) => a.ts - b.ts);
  }, [stats]);

  const days = useMemo(() => byDay.map((d) => ({ ts: d.ts, actual: d.actual, planned: d.planned, efficiency: ratio(d.actual, d.planned) })), [byDay]);

  const attainment = ratio(total.actual, total.planned);
  const utilization = ratio(total.plannedMin - total.downtimeMin, total.plannedMin);
  const prevAttainment = prev ? ratio(prev.actual, prev.planned) : null;
  const prevUtilization = prev ? ratio(prev.plannedMin - prev.downtimeMin, prev.plannedMin) : null;

  const utilRows = useMemo<RankRow[]>(
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
            value: a.availability,
            color: lineColor(a.lineId),
            hint: t("analytics.prod.utilHint", { run: fmt.duration(a.plannedMin - a.downtimeMin), planned: fmt.duration(a.plannedMin) }),
          };
        })
        .sort((a, b) => b.value - a.value),
    [byLine, activeLines, tl, t, fmt],
  );

  const bestDay = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.actual > b.actual ? d : b), null);
  const daysOnPlan = days.filter((d) => d.efficiency >= 1).length;
  const lineAttain = byLine.map((a) => ({ id: a.lineId, v: ratio(a.actual, a.planned) })).sort((a, b) => b.v - a.v);
  const name = (id: string) => {
    const l = activeLines.find((x) => x.id === id);
    return l ? `${l.code} ${tl(l.name)}` : id;
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <KpiStrip columns={4}>
        <Kpi label={t("analytics.prod.kpi.output")} value={total.actual} format={fmt.num} unit={t("common.units")} delta={vs(total.actual, prev?.actual)} deltaLabel={t("common.vsPrev")} />
        <Kpi label={t("analytics.prod.kpi.planned")} value={total.planned} format={fmt.num} unit={t("common.units")} delta={vs(total.planned, prev?.planned)} deltaLabel={t("common.vsPrev")} />
        <Kpi label={t("analytics.prod.kpi.attainment")} value={attainment} format={(v) => fmt.pct(v)} delta={vs(attainment, prevAttainment)} deltaLabel={t("common.vsPrev")} hint={t("analytics.prod.kpi.attainmentHint")} />
        <Kpi label={t("analytics.prod.kpi.utilization")} value={utilization} format={(v) => fmt.pct(v)} delta={vs(utilization, prevUtilization)} deltaLabel={t("common.vsPrev")} hint={t("analytics.prod.kpi.utilizationHint")} />
      </KpiStrip>

      <div className="grid gap-4 xl:grid-cols-2 lg:gap-5">
        <ChartPanel
          title={t("analytics.prod.output.title")}
          subtitle={t("analytics.prod.output.subtitle")}
          height={height}
          empty={empty}
          legend={activeLines.map((l) => (
            <LegendItem key={l.id} color={lineColor(l.id)} label={`${l.code} · ${tl(l.name)}`} hidden={lineToggle.isHidden(l.id)} onToggle={activeLines.length > 1 ? () => lineToggle.toggle(l.id) : undefined} />
          ))}
          table={{
            columns: [t("common.date"), ...activeLines.map((l) => l.code), t("common.total")],
            rows: outputByDay.map((r) => [fmt.dateShort(r.ts), ...activeLines.map((l) => r[l.id] ?? 0), activeLines.reduce((s, l) => s + (r[l.id] ?? 0), 0)]),
          }}
          footer={
            bestDay && (
              <Insight>
                {t("analytics.prod.output.insight", { date: fmt.dateShort(bestDay.ts), units: fmt.num(bestDay.actual), avg: fmt.num(ratio(total.actual, days.length)) })}
              </Insight>
            )
          }
        >
          <BarChart data={outputByDay} margin={cp.margin} barCategoryGap="18%">
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.compact(v)} />
            <Tooltip
              cursor={cp.barCursor}
              content={
                <ChartTooltip
                  formatLabel={(l) => day.full(l)}
                  formatValue={(v) => fmt.num(v)}
                  unit={t("common.unitsShort")}
                  footer={(p) => `${t("common.total")}: ${fmt.num(p.reduce((s, x) => s + Number(x.value ?? 0), 0))} ${t("common.units")}`}
                />
              }
            />
            {activeLines.map((l) => (
              <Bar key={l.id} {...cp.series} dataKey={l.id} name={l.code} stackId="out" fill={lineColor(l.id)} stroke="var(--base)" strokeWidth={1} hide={lineToggle.isHidden(l.id)} maxBarSize={28} />
            ))}
          </BarChart>
        </ChartPanel>

        <ChartPanel
          title={t("analytics.prod.pva.title")}
          subtitle={t("analytics.prod.pva.subtitle")}
          height={height}
          empty={empty}
          legend={
            <>
              <LegendItem color={SERIES[0]} label={t("common.actual")} hidden={pvaToggle.isHidden("actual")} onToggle={() => pvaToggle.toggle("actual")} />
              <LegendItem shape="dash" color={MUTED} label={t("common.planned")} hidden={pvaToggle.isHidden("planned")} onToggle={() => pvaToggle.toggle("planned")} />
            </>
          }
          table={{
            columns: [t("common.date"), t("common.actual"), t("common.planned"), t("analytics.prod.kpi.attainment")],
            rows: days.map((d) => [fmt.dateShort(d.ts), d.actual, d.planned, fmt.pct(d.efficiency)]),
          }}
          footer={<Insight>{t("analytics.prod.pva.insight", { n: fmt.num(daysOnPlan), total: fmt.num(days.length), attainment: fmt.pct(attainment) })}</Insight>}
        >
          <ComposedChart data={days} margin={cp.margin} barCategoryGap="22%">
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.compact(v)} />
            <Tooltip cursor={cp.barCursor} content={<ChartTooltip formatLabel={(l) => day.full(l)} formatValue={(v) => fmt.num(v)} unit={t("common.unitsShort")} />} />
            <Bar {...cp.series} dataKey="actual" name={t("common.actual")} fill={SERIES[0]} radius={[2, 2, 0, 0]} hide={pvaToggle.isHidden("actual")} maxBarSize={28} />
            <Line {...cp.series} type="step" dataKey="planned" name={t("common.planned")} stroke={MUTED} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={false} hide={pvaToggle.isHidden("planned")} />
          </ComposedChart>
        </ChartPanel>

        <ChartPanel
          title={t("analytics.prod.eff.title")}
          subtitle={t("analytics.prod.eff.subtitle")}
          height={height}
          empty={empty}
          legend={
            <>
              <LegendItem shape="line" color={SERIES[0]} label={t("analytics.prod.eff.series")} />
              <LegendItem shape="dash" color={MUTED} label={t("analytics.prod.eff.plan")} />
            </>
          }
          table={{ columns: [t("common.date"), t("analytics.prod.eff.series")], rows: days.map((d) => [fmt.dateShort(d.ts), fmt.pct(d.efficiency)]) }}
          footer={
            lineAttain.length > 1 && (
              <Insight>
                {t("analytics.prod.eff.insight", { best: name(lineAttain[0].id), bestPct: fmt.pct(lineAttain[0].v), worst: name(lineAttain[lineAttain.length - 1].id), worstPct: fmt.pct(lineAttain[lineAttain.length - 1].v) })}
              </Insight>
            )
          }
        >
          <LineChart data={days} margin={cp.margin}>
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.pct(v, 0)} domain={[(min: number) => Math.floor(Math.min(min, 0.95) * 20) / 20, (max: number) => Math.ceil(Math.max(max, 1.02) * 20) / 20]} />
            <Tooltip cursor={cp.cursor} content={<ChartTooltip formatLabel={(l) => day.full(l)} formatValue={(v) => fmt.pct(v)} />} />
            <ReferenceLine y={1} stroke={MUTED} strokeDasharray="5 3" />
            <Line {...cp.series} type="monotone" dataKey="efficiency" name={t("analytics.prod.eff.series")} stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--base)", strokeWidth: 2 }} />
          </LineChart>
        </ChartPanel>

        <RankPanel
          title={t("analytics.prod.util.title")}
          subtitle={t("analytics.prod.util.subtitle")}
          rows={utilRows}
          max={1}
          formatValue={(v) => fmt.pct(v)}
          labelHeader={t("common.line")}
          valueHeader={t("common.utilization")}
          footer={
            utilRows.length > 1 && (
              <Insight>
                {t("analytics.prod.util.insight", { best: utilRows[0].text, bestPct: fmt.pct(utilRows[0].value), worst: utilRows[utilRows.length - 1].text, worstPct: fmt.pct(utilRows[utilRows.length - 1].value) })}
              </Insight>
            )
          }
        />
      </div>
    </div>
  );
}

const PVA_KEYS = ["actual", "planned"] as const;

/* ------------------------------------------------------------------ */
/* Downtime analysis                                                   */
/* ------------------------------------------------------------------ */

const TOP_MACHINES = 8;

export function DowntimeSection({ scope }: { scope: AnalyticsScope }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const day = useDayLabel();
  const narrow = useNarrow();
  const lookup = useLookup();
  const { events, prevEvents, total, prev, byDay, empty } = scope;
  const causeToggle = useSeriesToggle(CAUSES);

  const minutes = events.reduce((s, e) => s + e.minutes, 0);
  const prevMinutes = prevEvents ? prevEvents.reduce((s, e) => s + e.minutes, 0) : null;
  const mean = ratio(minutes, events.length);
  const prevMean = prevEvents ? ratio(prevMinutes ?? 0, prevEvents.length) : null;
  const share = ratio(minutes, total.plannedMin);
  const prevShare = prev && prevMinutes !== null ? ratio(prevMinutes, prev.plannedMin) : null;

  // Cheap derivations over a few hundred events: computed inline, no memoisation needed.
  const byMachine = sumBy(events, (e) => e.machineId, (e) => e.minutes);
  const machineRows: RankRow[] = byMachine.slice(0, TOP_MACHINES).map((r) => {
        const mc = lookup.machine(r.key);
        const count = events.filter((e) => e.machineId === r.key).length;
        return {
          key: r.key,
          text: `${r.key}${mc ? ` · ${tl(mc.name)}` : ""}`,
          label: (
            <Link href={`/equipment/${r.key}`} className="hover:text-ink hover:underline">
              <Code>{r.key}</Code>
              {mc ? ` · ${tl(mc.name)}` : ""}
            </Link>
          ),
          value: r.value,
          hint: t("analytics.down.machineHint", { n: fmt.num(count), line: mc?.lineId ?? "", share: fmt.pct(ratio(r.value, minutes)) }),
        };
      });

  const byCause = sumBy(events, (e) => e.cause, (e) => e.minutes);
  const causeRows: RankRow[] = byCause.map((r) => ({
        key: r.key,
        text: td(`cause.${r.key}`),
        label: td(`cause.${r.key}`),
        value: r.value,
        color: causeColor(r.key as DowntimeCause),
        hint: t("analytics.down.causeHint", { n: fmt.num(events.filter((e) => e.cause === r.key).length), share: fmt.pct(ratio(r.value, minutes)) }),
      }));

  // One row per production day in the window (days without stops stay at zero).
  const trend = useMemo(() => {
    const m = new Map<string, Record<string, number>>(byDay.map((d) => [d.date, { ts: d.ts }]));
    for (const e of events) {
      const row = m.get(dayKey(e.start));
      if (row) row[e.cause] = (row[e.cause] ?? 0) + e.minutes;
    }
    return [...m.values()].sort((a, b) => a.ts - b.ts);
  }, [byDay, events]);
  const usedCauses = CAUSES.filter((c) => events.some((e) => e.cause === c));
  const noEvents = empty || events.length === 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <KpiStrip columns={4}>
        <Kpi label={t("analytics.down.kpi.total")} value={minutes} format={fmt.duration} delta={vs(minutes, prevMinutes)} deltaGoodWhen="down" deltaLabel={t("common.vsPrev")} />
        <Kpi label={t("analytics.down.kpi.events")} value={events.length} format={fmt.num} delta={vs(events.length, prevEvents?.length)} deltaGoodWhen="down" deltaLabel={t("common.vsPrev")} />
        <Kpi label={t("analytics.down.kpi.mean")} value={mean} format={(v) => fmt.num(v, 1)} unit={t("common.minutes")} delta={vs(mean, prevMean)} deltaGoodWhen="down" hint={t("analytics.down.kpi.meanHint")} />
        <Kpi label={t("analytics.down.kpi.share")} value={share} format={(v) => fmt.pct(v)} delta={vs(share, prevShare)} deltaGoodWhen="down" hint={t("analytics.down.kpi.shareHint")} />
      </KpiStrip>

      <ChartPanel
        title={t("analytics.down.trend.title")}
        subtitle={t("analytics.down.trend.subtitle")}
        height={narrow ? 220 : 280}
        empty={noEvents}
        legend={usedCauses.map((c) => (
          <LegendItem key={c} color={causeColor(c)} label={td(`cause.${c}`)} hidden={causeToggle.isHidden(c)} onToggle={() => causeToggle.toggle(c)} />
        ))}
        table={{
          columns: [t("common.date"), ...usedCauses.map((c) => td(`cause.${c}`)), t("common.total")],
          rows: trend.map((r) => [fmt.dateShort(r.ts), ...usedCauses.map((c) => r[c] ?? 0), usedCauses.reduce((s, c) => s + (r[c] ?? 0), 0)]),
        }}
      >
        <BarChart data={trend} margin={cp.margin} barCategoryGap="18%">
          <CartesianGrid {...cp.grid} />
          <XAxis {...cp.xAxis} dataKey="ts" tickFormatter={day.tick} />
          <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.num(v)} />
          <Tooltip
            cursor={cp.barCursor}
            content={
              <ChartTooltip
                formatLabel={(l) => day.full(l)}
                formatValue={(v) => fmt.num(v)}
                unit={t("common.minutes")}
                footer={(p) => `${t("common.total")}: ${fmt.duration(p.reduce((s, x) => s + Number(x.value ?? 0), 0))}`}
              />
            }
          />
          {usedCauses.map((c) => (
            <Bar key={c} {...cp.series} dataKey={c} name={td(`cause.${c}`)} stackId="dt" fill={causeColor(c)} stroke="var(--base)" strokeWidth={1} hide={causeToggle.isHidden(c)} maxBarSize={28} />
          ))}
        </BarChart>
      </ChartPanel>

      <div className="grid gap-4 xl:grid-cols-2 lg:gap-5">
        <RankPanel
          title={t("analytics.down.machine.title", { n: TOP_MACHINES })}
          subtitle={t("analytics.down.machine.subtitle")}
          rows={noEvents ? [] : machineRows}
          formatValue={fmt.duration}
          labelHeader={t("common.machine")}
          valueHeader={t("common.downtime")}
          footer={
            machineRows.length > 0 && (
              <Insight>{t("analytics.down.machine.insight", { machine: machineRows[0].text, time: fmt.duration(machineRows[0].value), share: fmt.pct(ratio(machineRows[0].value, minutes)) })}</Insight>
            )
          }
        />
        <RankPanel
          title={t("analytics.down.cause.title")}
          subtitle={t("analytics.down.cause.subtitle")}
          rows={noEvents ? [] : causeRows}
          formatValue={fmt.duration}
          labelHeader={t("analytics.down.cause.header")}
          valueHeader={t("common.downtime")}
          footer={
            causeRows.length > 0 && (
              <Insight>{t("analytics.down.cause.insight", { cause: causeRows[0].text, share: fmt.pct(ratio(causeRows[0].value, minutes)), mean: fmt.num(mean, 1) })}</Insight>
            )
          }
        />
      </div>
    </div>
  );
}
