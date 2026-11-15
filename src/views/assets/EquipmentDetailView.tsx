"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Box, History, Wrench } from "lucide-react";
import type { DowntimeCause, Machine, MaintenanceOrder } from "@/domain/types";
import { PM_INTERVAL_DAYS, machineTelemetry, tempLimit } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, dayKey, startOfDay } from "@/lib/time";
import { aggregateByDay, filterStats, lineLive, sumBy } from "@/store/selectors";
import { useForge } from "@/store/store";
import { Badge, Code, DataList, EmptyState, Gauge, LegendItem, Panel, Progress, Segmented, SimBadge, cn, toneBg, toneText, type Tone } from "@/components/ui/primitives";
import { EntityLink, EntityNotFound, Guard, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { ChartPanel, ChartTooltip, MUTED, RankBars, SERIES, useChartProps } from "@/components/charts/kit";
import { DemoCalcBadge, HEALTH, HEALTH_TONE, LinkButton, MachineStatusMenu, ServiceDueBadge, machineHealth, serviceDays } from "./shared";

type Range = "7" | "14" | "30" | "60";

export function EquipmentDetailView({ id }: { id: string }) {
  const { t } = useT();
  const machine = useForge((s) => s.machines.find((m) => m.id === id));
  if (!machine) return <EntityNotFound backHref="/equipment" backLabel={t("nav.equipment")} />;
  return <Detail machine={machine} />;
}

function Detail({ machine }: { machine: Machine }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const today = useForge((s) => startOfDay(s.now));
  const line = lookup.line(machine.lineId);
  const factory = lookup.factory(machine.factoryId);
  const [range, setRange] = useState<Range>("30");

  const ageYears = Math.max(0, (today - machine.installDate) / (365.25 * DAY));
  const overdue = serviceDays(machine.nextMaintenance, today) < 0;
  const requestHref = `/maintenance?new=1&machine=${encodeURIComponent(machine.id)}`;

  return (
    <Page>
      <PageHeader
        back={{ href: "/equipment", label: t("nav.equipment") }}
        eyebrow={
          <>
            <Code className="text-[11px]">{machine.id}</Code>
            <span aria-hidden>·</span>
            <span>{tl(machine.kind)}</span>
          </>
        }
        title={tl(machine.name)}
        meta={
          <>
            <StatusBadge kind="machine" value={machine.status} />
            {overdue && <ServiceDueBadge date={machine.nextMaintenance} now={today} />}
          </>
        }
        actions={
          <>
            <LinkButton href="/factory" icon={Box}>
              {t("equipment.action.twin")}
            </LinkButton>
            <Guard cap="machine.control">
              <MachineStatusMenu machine={machine} />
            </Guard>
            <Guard cap="maintenance.manage">
              <LinkButton href={requestHref} icon={Wrench} variant="primary">
                {t("equipment.action.request")}
              </LinkButton>
            </Guard>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Panel title={t("equipment.profile.title")} className="lg:col-span-2">
          <DataList
            columns={3}
            items={[
              { label: t("equipment.col.manufacturer"), value: machine.manufacturer },
              { label: t("equipment.col.model"), value: <Code>{machine.model}</Code> },
              { label: t("equipment.profile.serial"), value: <Code>{machine.serial}</Code> },
              { label: t("equipment.profile.kind"), value: tl(machine.kind) },
              {
                label: t("common.line"),
                value: line ? (
                  <EntityLink entity={{ type: "line", id: line.id }}>
                    <Code>{line.code}</Code> <span>{tl(line.name)}</span>
                  </EntityLink>
                ) : (
                  <Code>{machine.lineId}</Code>
                ),
              },
              { label: t("common.factory"), value: factory ? `${tl(factory.name)} · ${tl(factory.city)}` : machine.factoryId },
              { label: t("common.location"), value: tl(machine.location) },
              { label: t("equipment.col.installed"), value: <span className="num">{fmt.date(machine.installDate)}</span> },
              { label: t("equipment.profile.age"), value: <span className="num">{t("equipment.profile.ageValue", { n: fmt.num(ageYears, 1) })}</span> },
              { label: t("equipment.col.lastService"), value: <span className="num">{fmt.date(machine.lastMaintenance)}</span> },
              {
                label: t("equipment.col.nextService"),
                value: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="num">{fmt.date(machine.nextMaintenance)}</span>
                    <ServiceDueBadge date={machine.nextMaintenance} now={today} />
                  </span>
                ),
              },
              { label: t("equipment.profile.station"), value: <span className="num">{fmt.num(machine.station + 1)}</span> },
            ]}
          />
        </Panel>
        <TelemetryPanel machine={machine} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{t("equipment.perf.title")}</h2>
          <p className="mt-0.5 max-w-3xl text-[12.5px] text-ink-3">{t("equipment.perf.note", { line: line?.code ?? machine.lineId, id: machine.id })}</p>
        </div>
        <Segmented<Range>
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
      </div>
      <PerformanceCharts machine={machine} days={Number(range)} today={today} />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <HealthPanel machine={machine} className="lg:col-span-2" />
        <LinePanel machine={machine} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <MaintenanceHistory machine={machine} requestHref={requestHref} className="lg:col-span-2" />
        <EventsPanel machine={machine} />
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Current status — simulated telemetry                                */
/* ------------------------------------------------------------------ */

function Meter({ label, value, unit, ratio, tone, note, marker, markerLabel }: { label: string; value: string; unit: string; ratio: number; tone: Tone; note: string; marker?: number; markerLabel?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className={cn("text-[11.5px] font-medium", toneText[tone])}>{note}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="display num text-[26px] text-ink">{value}</span>
        <bdi className="text-[12px] text-ink-3">{unit}</bdi>
      </div>
      <Progress value={ratio} tone={tone} marker={marker} label={label} className="mt-2" />
      {markerLabel && <p className="num mt-1.5 text-[11.5px] text-ink-3">{markerLabel}</p>}
    </div>
  );
}

function TelemetryPanel({ machine }: { machine: Machine }) {
  const { t } = useT();
  const fmt = useFmt();
  const tick = useForge((s) => s.tick);
  const tel = machineTelemetry(machine, tick);
  const limit = tempLimit(machine);
  const scale = limit * 1.25;
  const tempTone: Tone = tel.temperature >= limit ? "danger" : tel.temperature >= limit * 0.93 ? "warn" : "ok";
  const stopped = tel.speed === 0;
  const loadTone: Tone = tel.load >= 90 ? "warn" : stopped ? "neutral" : "ok";
  return (
    <Panel title={t("equipment.live.title")} subtitle={t("equipment.live.subtitle")} actions={<SimBadge />}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="label">{t("equipment.live.state")}</span>
          <StatusBadge kind="machine" value={machine.status} />
        </div>
        <Meter
          label={t("common.temperature")}
          value={fmt.num(tel.temperature, 1)}
          unit="°C"
          ratio={tel.temperature / scale}
          marker={limit / scale}
          tone={tempTone}
          note={tempTone === "danger" ? t("equipment.live.tempAbove") : tempTone === "warn" ? t("equipment.live.tempNear") : t("equipment.live.tempOk")}
          markerLabel={t("equipment.live.tempLimit", { limit: fmt.num(limit), nominal: fmt.num(machine.baseTemp) })}
        />
        <Meter
          label={t("common.speed")}
          value={fmt.num(tel.speed, machine.baseSpeed >= 100 ? 0 : 1)}
          unit={machine.speedUnit}
          ratio={machine.baseSpeed > 0 ? tel.speed / (machine.baseSpeed * 1.05) : 0}
          tone={stopped ? "neutral" : "accent"}
          note={stopped ? t("equipment.live.stopped") : t("equipment.live.ofNominal", { pct: fmt.pct(machine.baseSpeed > 0 ? tel.speed / machine.baseSpeed : 0, 0) })}
          markerLabel={t("equipment.live.nominalSpeed", { value: fmt.num(machine.baseSpeed, machine.baseSpeed >= 100 ? 0 : 1), unit: machine.speedUnit })}
        />
        <Meter
          label={t("common.load")}
          value={fmt.num(tel.load)}
          unit="%"
          ratio={tel.load / 100}
          tone={loadTone}
          note={tel.load >= 90 ? t("equipment.live.loadHigh") : stopped ? t("equipment.live.loadNone") : t("equipment.live.loadOk")}
        />
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-[12.5px]">
          <span className="text-ink-2">{t("equipment.live.utilization")}</span>
          <span className="num font-semibold text-ink">{fmt.pct(machine.utilization / 100, 0)}</span>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Performance history                                                 */
/* ------------------------------------------------------------------ */

function PerformanceCharts({ machine, days, today }: { machine: Machine; days: number; today: number }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const dailyStats = useForge((s) => s.dailyStats);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const lines = useForge((s) => s.lines);
  const lineCode = lines.find((l) => l.id === machine.lineId)?.code ?? machine.lineId;

  const { rows, causes, totalDowntime, eventCount } = useMemo(() => {
    const from = today - days * DAY;
    const to = today - 1;
    const agg = aggregateByDay(filterStats(dailyStats, { from, to, lineIds: [machine.lineId] }), lines);
    const events = downtimeEvents.filter((e) => e.machineId === machine.id && e.start >= from && e.start <= to);
    const byDay = new Map<string, number>();
    for (const e of events) byDay.set(dayKey(e.start), (byDay.get(dayKey(e.start)) ?? 0) + e.minutes);
    return {
      rows: agg.map((d) => ({ ts: d.ts, label: fmt.dateShort(d.ts), actual: d.actual, planned: d.planned, oee: d.oee, downtime: byDay.get(d.date) ?? 0 })),
      causes: sumBy(events, (e) => e.cause, (e) => e.minutes),
      totalDowntime: events.reduce((s, e) => s + e.minutes, 0),
      eventCount: events.length,
    };
  }, [dailyStats, downtimeEvents, lines, machine.id, machine.lineId, days, today, fmt]);

  const empty = rows.length === 0;
  const oeeMin = empty ? 0 : Math.max(0, Math.floor(Math.min(...rows.map((r) => r.oee)) * 10 - 1) / 10);
  const avgOee = empty ? 0 : rows.reduce((s, r) => s + r.oee, 0) / rows.length;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
      <ChartPanel
        title={t("equipment.perf.output.title", { line: lineCode })}
        subtitle={t("equipment.perf.output.subtitle")}
        eyebrow={t("equipment.perf.lineLevel")}
        empty={empty}
        legend={
          <>
            <LegendItem color={SERIES[0]} label={t("equipment.perf.output.actual")} />
            <LegendItem color={MUTED} label={t("common.planned")} shape="dash" />
          </>
        }
        table={{ columns: [t("common.date"), t("equipment.perf.output.actual"), t("common.planned")], rows: rows.map((r) => [r.label, r.actual, r.planned]) }}
      >
        <ComposedChart data={rows} margin={cp.margin}>
          <CartesianGrid {...cp.grid} />
          <XAxis dataKey="label" {...cp.xAxis} />
          <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.compact(v)} />
          <Tooltip cursor={cp.barCursor} content={<ChartTooltip unit={t("common.units")} />} />
          <Bar dataKey="actual" name={t("equipment.perf.output.actual")} fill={SERIES[0]} radius={[2, 2, 0, 0]} maxBarSize={22} {...cp.series} />
          <Line dataKey="planned" name={t("common.planned")} type="monotone" stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} {...cp.series} />
        </ComposedChart>
      </ChartPanel>

      <ChartPanel
        title={t("equipment.perf.oee.title", { line: lineCode })}
        subtitle={t("equipment.perf.oee.subtitle", { avg: fmt.pct(avgOee) })}
        eyebrow={t("equipment.perf.lineLevel")}
        empty={empty}
        table={{ columns: [t("common.date"), t("common.oee")], rows: rows.map((r) => [r.label, fmt.pct(r.oee)]) }}
      >
        <LineChart data={rows} margin={cp.margin}>
          <CartesianGrid {...cp.grid} />
          <XAxis dataKey="label" {...cp.xAxis} />
          <YAxis {...cp.yAxis} domain={[oeeMin, 1]} tickFormatter={(v: number) => fmt.pct(v, 0)} />
          <Tooltip cursor={cp.cursor} content={<ChartTooltip formatValue={(v) => fmt.pct(v)} />} />
          <Line dataKey="oee" name={t("common.oee")} type="monotone" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} {...cp.series} />
        </LineChart>
      </ChartPanel>

      <ChartPanel
        title={t("equipment.perf.downtime.title", { id: machine.id })}
        subtitle={t("equipment.perf.downtime.subtitle", { total: fmt.duration(totalDowntime), n: eventCount })}
        eyebrow={t("equipment.perf.machineLevel")}
        empty={empty}
        table={{ columns: [t("common.date"), `${t("common.downtime")} (${t("common.minutes")})`], rows: rows.map((r) => [r.label, r.downtime]) }}
      >
        <BarChart data={rows} margin={cp.margin}>
          <CartesianGrid {...cp.grid} />
          <XAxis dataKey="label" {...cp.xAxis} />
          <YAxis {...cp.yAxis} allowDecimals={false} tickFormatter={(v: number) => fmt.num(v)} />
          <Tooltip cursor={cp.barCursor} content={<ChartTooltip unit={t("common.minutes")} />} />
          <Bar dataKey="downtime" name={t("common.downtime")} fill={SERIES[3]} radius={[2, 2, 0, 0]} maxBarSize={22} {...cp.series} />
        </BarChart>
      </ChartPanel>

      <Panel title={t("equipment.perf.causes.title", { id: machine.id })} subtitle={t("equipment.perf.causes.subtitle", { days })} eyebrow={t("equipment.perf.machineLevel")}>
        {causes.length === 0 ? (
          <EmptyState title={t("equipment.perf.causes.empty")} hint={t("equipment.perf.causes.emptyHint")} />
        ) : (
          <RankBars
            color={SERIES[3]}
            formatValue={(v) => fmt.duration(v)}
            rows={causes.map((c) => ({
              key: c.key,
              label: td(`cause.${c.key as DowntimeCause}`),
              value: c.value,
              hint: t("equipment.perf.causes.share", { pct: fmt.pct(totalDowntime ? c.value / totalDowntime : 0, 0) }),
            }))}
          />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Predictive maintenance indicator (demo calculation)                 */
/* ------------------------------------------------------------------ */

function HealthPanel({ machine, className }: { machine: Machine; className?: string }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const h = useMemo(() => machineHealth(machine, now, downtimeEvents), [machine, now, downtimeEvents]);
  const tone = HEALTH_TONE[h.band];

  const factors = [
    {
      key: "service",
      label: t("equipment.health.factor.service"),
      input: t("equipment.health.factor.serviceInput", { days: h.daysSinceService, interval: PM_INTERVAL_DAYS }),
      rule: t("equipment.health.factor.serviceRule", { weight: HEALTH.serviceWeight, interval: PM_INTERVAL_DAYS, cap: HEALTH.serviceCap }),
      penalty: h.servicePenalty,
      cap: HEALTH.serviceCap,
    },
    {
      key: "downtime",
      label: t("equipment.health.factor.downtime"),
      input: t("equipment.health.factor.downtimeInput", { min: h.downtimeMin, n: h.downtimeEvents, days: HEALTH.windowDays }),
      rule: t("equipment.health.factor.downtimeRule", { per: HEALTH.downtimeMinPerPoint, cap: HEALTH.downtimeCap }),
      penalty: h.downtimePenalty,
      cap: HEALTH.downtimeCap,
    },
    {
      key: "status",
      label: t("equipment.health.factor.status"),
      input: td(`mstatus.${machine.status}`),
      rule: t("equipment.health.factor.statusRule", HEALTH.statusPenalty),
      penalty: h.statusPenalty,
      cap: HEALTH.statusPenalty.offline,
    },
  ];

  return (
    <Panel title={t("equipment.health.title")} subtitle={t("equipment.health.subtitle")} actions={<DemoCalcBadge />} className={className}>
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <div className="flex shrink-0 items-center gap-4 md:w-52 md:flex-col md:items-start">
          <Gauge value={h.score / 100} size={104} stroke={8} tone={tone} label={t("equipment.health.scoreLabel", { score: h.score })}>
            <span className="display num text-[30px] leading-none text-ink">{fmt.num(h.score)}</span>
            <span className="num mt-0.5 text-[10.5px] text-ink-3">/ {fmt.num(100)}</span>
          </Gauge>
          <div className="min-w-0">
            <Badge tone={tone} dot>
              {t(`equipment.health.band.${h.band}`)}
            </Badge>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{t(`equipment.health.bandHint.${h.band}`)}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="rounded-md border border-dashed border-line-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">{t("equipment.health.disclaimer")}</p>
          <p className="label mt-4">{t("equipment.health.formula")}</p>
          <p dir="ltr" className="code num mt-1.5 overflow-x-auto whitespace-nowrap rounded-sm bg-canvas px-2.5 py-2 text-start text-[12px] text-ink">
            {fmt.num(100)} − {fmt.num(h.servicePenalty)} − {fmt.num(h.downtimePenalty)} − {fmt.num(h.statusPenalty)} = <span className="font-semibold">{fmt.num(h.score)}</span>
          </p>
          <ul className="mt-3 divide-y divide-line/70 border-y border-line/70">
            {factors.map((f) => (
              <li key={f.key} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink">{f.label}</p>
                  <p className="num mt-0.5 text-[12px] text-ink-2">{f.input}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">{f.rule}</p>
                </div>
                <div className="flex w-20 flex-col items-end gap-1.5">
                  <span className={cn("num text-[13px] font-semibold", f.penalty > 0 ? "text-ink" : "text-ink-3")}>{f.penalty > 0 ? `−${fmt.num(f.penalty)}` : fmt.num(0)}</span>
                  <span aria-hidden className="h-1 w-full rounded-[1px] bg-line/70">
                    <span className={cn("block h-full rounded-[1px]", toneBg.neutral)} style={{ width: `${Math.min(100, (f.penalty / f.cap) * 100)}%` }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="num mt-2.5 text-[11.5px] text-ink-3">{t("equipment.health.bands", { watch: HEALTH.watchBelow, service: HEALTH.serviceBelow })}</p>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Related line                                                        */
/* ------------------------------------------------------------------ */

function LinePanel({ machine }: { machine: Machine }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const now = useForge((s) => s.now);
  const machines = useForge((s) => s.machines);
  const line = lookup.line(machine.lineId);
  if (!line) return null;
  const live = lineLive(line, now);
  const siblings = machines.filter((m) => m.lineId === line.id).sort((a, b) => a.station - b.station);
  const product = lookup.product(line.productId);
  return (
    <Panel
      title={t("equipment.line.title")}
      actions={
        <Link href={`/production/${encodeURIComponent(line.id)}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-forge-text hover:underline">
          {t("equipment.line.open")}
          <ArrowRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
        </Link>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Code className="text-ink-3">{line.code}</Code>
          <p className="mt-0.5 truncate text-[14px] font-semibold text-ink">{tl(line.name)}</p>
          {product && <p className="mt-0.5 truncate text-[12px] text-ink-3">{tl(product.name)}</p>}
        </div>
        <StatusBadge kind="line" value={line.status} />
      </div>
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 text-[12px]">
          <span className="text-ink-2">{t("equipment.line.shiftOutput")}</span>
          <span className="num text-ink">
            <span className="font-semibold">{fmt.num(live.output)}</span> <span className="text-ink-3">/ {fmt.num(live.target)}</span>
          </span>
        </div>
        <Progress className="mt-1.5" value={live.target ? live.output / live.target : 0} marker={live.target ? live.expected / live.target : undefined} label={t("equipment.line.shiftOutput")} />
        <p className="mt-1.5 text-[11.5px] text-ink-3">{t("equipment.line.liveNote")}</p>
      </div>
      <p className="label mt-4">{t("equipment.line.stations")}</p>
      <ul className="mt-2 space-y-1.5">
        {siblings.map((m) => (
          <li key={m.id} className={cn("flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[12.5px]", m.id === machine.id ? "bg-raised" : "")}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="num w-4 shrink-0 text-ink-3">{fmt.num(m.station + 1)}</span>
              {m.id === machine.id ? (
                <span className="truncate font-medium text-ink" aria-current="true">
                  {tl(m.name)}
                </span>
              ) : (
                <EntityLink entity={{ type: "machine", id: m.id }} className="truncate">
                  {tl(m.name)}
                </EntityLink>
              )}
            </span>
            <StatusBadge kind="machine" value={m.status} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance history                                                 */
/* ------------------------------------------------------------------ */

function MaintenanceHistory({ machine, requestHref, className }: { machine: Machine; requestHref: string; className?: string }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const orders = useForge((s) => s.maintenanceOrders);
  const rows = useMemo(() => orders.filter((o) => o.machineId === machine.id).sort((a, b) => b.scheduledDate - a.scheduledDate), [orders, machine.id]);

  const columns = useMemo<Column<MaintenanceOrder>[]>(
    () => [
      { id: "id", header: t("maintenance.col.id"), cell: (o) => <Code>{o.id}</Code>, hideable: false, mobile: "title" },
      {
        id: "type",
        header: t("common.type"),
        cell: (o) => <StatusBadge kind="maintenanceType" value={o.type} />,
        mobile: "badge",
      },
      { id: "description", header: t("maintenance.col.issue"), cell: (o) => <span className="line-clamp-2 min-w-[14rem] text-ink-2">{tl(o.description)}</span>, mobile: "subtitle" },
      { id: "status", header: t("common.status"), cell: (o) => <StatusBadge kind="maintenance" value={o.status} />, mobile: "badge" },
      { id: "technician", header: t("common.technician"), cell: (o) => <Member id={o.technicianId} /> },
      { id: "scheduled", header: t("maintenance.col.scheduled"), cell: (o) => <span className="num whitespace-nowrap">{fmt.dateTime(o.scheduledDate)}</span>, sortValue: (o) => o.scheduledDate },
      { id: "cost", header: t("common.cost"), cell: (o) => fmt.money(o.cost), sortValue: (o) => o.cost, align: "end" },
    ],
    [t, tl, fmt],
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{t("equipment.history.title")}</h2>
        <span className="num text-[12px] text-ink-3">{t("equipment.history.count", { n: rows.length })}</span>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(o) => o.id}
        caption={t("equipment.history.title")}
        initialSort={{ id: "scheduled", dir: "desc" }}
        pageSize={10}
        rowHref={(o) => `/maintenance?order=${encodeURIComponent(o.id)}`}
        empty={{
          title: t("equipment.history.empty"),
          hint: t("equipment.history.emptyHint"),
          action: (
            <Guard cap="maintenance.manage">
              <LinkButton href={requestHref} icon={Wrench}>
                {t("equipment.action.request")}
              </LinkButton>
            </Guard>
          ),
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recent operational events                                           */
/* ------------------------------------------------------------------ */

function EventsPanel({ machine }: { machine: Machine }) {
  const { t, tm } = useT();
  const fmt = useFmt();
  const activity = useForge((s) => s.activity);
  const orders = useForge((s) => s.maintenanceOrders);
  const now = useForge((s) => s.now);
  const events = useMemo(() => {
    const orderIds = new Set(orders.filter((o) => o.machineId === machine.id).map((o) => o.id));
    return activity
      .filter((e) => e.entity && ((e.entity.type === "machine" && e.entity.id === machine.id) || (e.entity.type === "maintenance" && orderIds.has(e.entity.id))))
      .slice(0, 10);
  }, [activity, orders, machine.id]);
  return (
    <Panel title={t("equipment.events.title")} subtitle={t("equipment.events.subtitle")}>
      {events.length === 0 ? (
        <EmptyState icon={History} title={t("equipment.events.empty")} hint={t("equipment.events.emptyHint")} />
      ) : (
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2.5">
              <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneBg[SEVERITY_TONE[e.severity]])} />
              <div className="min-w-0">
                <p className="text-[12.5px] leading-snug text-ink">{tm(e.msg)}</p>
                <p className="num mt-0.5 text-[11.5px] text-ink-3">
                  {fmt.relative(e.at, now)} · {fmt.dateTime(e.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
