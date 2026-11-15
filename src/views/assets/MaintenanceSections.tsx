"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck, Wrench } from "lucide-react";
import type { DowntimeCause, DowntimeEvent, Machine, MaintenanceOrder, MaintenanceType } from "@/domain/types";
import { PM_INTERVAL_DAYS, maintenanceIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, startOfDay } from "@/lib/time";
import { sumBy } from "@/store/selectors";
import { useForge } from "@/store/store";
import { Badge, Code, EmptyState, LegendItem, Panel, Progress, Select, cn } from "@/components/ui/primitives";
import { EntityLink, Guard, Member, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { ChartPanel, ChartTooltip, RankBars, SERIES, useChartProps } from "@/components/charts/kit";
import { MAINT_TYPES } from "./MaintenanceCreateModal";
import { LinkButton, SERVICE_TONE, ServiceDueBadge, orderIsOverdue, serviceDays, serviceState, type ServiceState } from "./shared";

const CAUSES: DowntimeCause[] = ["mechanical", "electrical", "changeover", "material", "quality", "planned"];
const TYPE_COLOR: Record<MaintenanceType, string> = { preventive: SERIES[0], corrective: SERIES[1], predictive: SERIES[2] };

/* ------------------------------------------------------------------ */
/* Equipment maintenance status                                        */
/* ------------------------------------------------------------------ */

export function EquipmentServiceSection() {
  const { t, tl } = useT();
  const fmt = useFmt();
  const machines = useForge((s) => s.machines);
  const orders = useForge((s) => s.maintenanceOrders);
  const today = useForge((s) => startOfDay(s.now));
  const [state, setState] = useState<ServiceState | "all">("all");

  const openByMachine = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) if (maintenanceIsOpen(o.status)) m.set(o.machineId, (m.get(o.machineId) ?? 0) + 1);
    return m;
  }, [orders]);

  const rows = useMemo(() => machines.filter((m) => state === "all" || serviceState(m, today) === state), [machines, state, today]);

  const columns = useMemo<Column<Machine>[]>(
    () => [
      {
        id: "machine",
        header: t("maintenance.col.equipment"),
        cell: (m) => (
          <span className="flex min-w-0 flex-col">
            <EntityLink entity={{ type: "machine", id: m.id }}>
              <Code>{m.id}</Code>
            </EntityLink>
            <span className="truncate text-[12px] font-normal text-ink-3">{tl(m.name)}</span>
          </span>
        ),
        sortValue: (m) => m.id,
        hideable: false,
        mobile: "title",
      },
      { id: "status", header: t("common.status"), cell: (m) => <StatusBadge kind="machine" value={m.status} />, sortValue: (m) => m.status, mobile: "badge" },
      { id: "last", header: t("equipment.col.lastService"), cell: (m) => <span className="num whitespace-nowrap text-ink-2">{fmt.date(m.lastMaintenance)}</span>, sortValue: (m) => m.lastMaintenance },
      { id: "next", header: t("equipment.col.nextService"), cell: (m) => <span className="num whitespace-nowrap">{fmt.date(m.nextMaintenance)}</span>, sortValue: (m) => m.nextMaintenance },
      { id: "remaining", header: t("maintenance.service.remaining"), cell: (m) => <ServiceDueBadge date={m.nextMaintenance} now={today} />, sortValue: (m) => serviceDays(m.nextMaintenance, today) },
      {
        id: "interval",
        header: t("maintenance.service.interval"),
        cell: (m) => {
          const span = Math.max(DAY, m.nextMaintenance - m.lastMaintenance);
          const used = (today - m.lastMaintenance) / span;
          const elapsedDays = Math.max(0, Math.round((today - m.lastMaintenance) / DAY));
          return (
            <span className="flex min-w-[9rem] flex-col gap-1">
              <Progress value={used} tone={SERVICE_TONE[serviceState(m, today)]} label={t("maintenance.service.interval")} />
              <span className="num text-[11px] text-ink-3">{t("maintenance.service.elapsed", { n: elapsedDays, total: Math.round(span / DAY) })}</span>
            </span>
          );
        },
        sortValue: (m) => (today - m.lastMaintenance) / Math.max(DAY, m.nextMaintenance - m.lastMaintenance),
      },
      { id: "open", header: t("maintenance.service.openOrders"), cell: (m) => fmt.num(openByMachine.get(m.id) ?? 0), sortValue: (m) => openByMachine.get(m.id) ?? 0, align: "end" },
    ],
    [t, tl, fmt, today, openByMachine],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(m) => m.id}
      caption={t("maintenance.tab.equipment")}
      searchText={(m) => `${m.id} ${m.name.en} ${m.name.ar} ${m.lineId}`}
      searchPlaceholder={t("equipment.table.search")}
      initialSort={{ id: "next", dir: "asc" }}
      pageSize={20}
      rowHref={(m) => `/equipment/${encodeURIComponent(m.id)}`}
      activeFilters={state === "all" ? 0 : 1}
      onClearFilters={() => setState("all")}
      rowActions={(m) => (
        <Guard cap="maintenance.manage">
          <LinkButton href={`/maintenance?new=1&machine=${encodeURIComponent(m.id)}`} icon={Wrench} className="!h-7 !px-2 !text-[12px]">
            {t("maintenance.service.request")}
          </LinkButton>
        </Guard>
      )}
      filters={
        <Select aria-label={t("maintenance.service.state")} value={state} onChange={(e) => setState(e.target.value as ServiceState | "all")}>
          <option value="all">{t("maintenance.service.state.all")}</option>
          <option value="overdue">{t("maintenance.service.state.overdue")}</option>
          <option value="soon">{t("maintenance.service.state.soon")}</option>
          <option value="ok">{t("maintenance.service.state.ok")}</option>
        </Select>
      }
      toolbarEnd={<span className="hidden text-[11.5px] text-ink-3 xl:inline">{t("maintenance.service.note", { n: PM_INTERVAL_DAYS })}</span>}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming & overdue schedule                                         */
/* ------------------------------------------------------------------ */

const SCHEDULE_DAYS = 14;

function OrderRow({ order, onOpen, overdue }: { order: MaintenanceOrder; onOpen: (id: string) => void; overdue?: boolean }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const machine = lookup.machine(order.machineId);
  return (
    <li>
      <button type="button" onClick={() => onOpen(order.id)} className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm px-2 py-2 text-start transition-colors hover:bg-raised">
        <span className={cn("num w-[92px] shrink-0 text-[12px]", overdue ? "font-semibold text-danger" : "text-ink-2")}>{overdue ? fmt.dateTime(order.scheduledDate) : fmt.time(order.scheduledDate)}</span>
        <span className="min-w-0 flex-1 basis-[12rem]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
            <Code className="font-semibold text-ink">{order.id}</Code>
            <span className="truncate text-ink">{machine ? tl(machine.name) : order.machineId}</span>
            <Code className="text-ink-3">{order.machineId}</Code>
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-3">{tl(order.description)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="maintenanceType" value={order.type} />
          <StatusBadge kind="priority" value={order.priority} />
          <StatusBadge kind="maintenance" value={order.status} />
        </span>
        <span className="w-full text-[12px] sm:w-36">
          <Member id={order.technicianId} size={20} />
        </span>
        <span className="sr-only">{t("common.open")}</span>
      </button>
    </li>
  );
}

function ServiceRow({ machine, today }: { machine: Machine; today: number }) {
  const { t, tl } = useT();
  return (
    <li className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-2">
      <span className="label w-[92px] shrink-0">{t("maintenance.schedule.pmDue")}</span>
      <span className="flex min-w-0 flex-1 basis-[12rem] flex-wrap items-center gap-x-2 text-[12.5px]">
        <EntityLink entity={{ type: "machine", id: machine.id }}>
          <Code>{machine.id}</Code>
        </EntityLink>
        <span className="truncate text-ink-2">{tl(machine.name)}</span>
      </span>
      <ServiceDueBadge date={machine.nextMaintenance} now={today} />
      <Guard cap="maintenance.manage">
        <LinkButton href={`/maintenance?new=1&machine=${encodeURIComponent(machine.id)}`} className="!h-7 !px-2 !text-[12px]">
          {t("maintenance.service.request")}
        </LinkButton>
      </Guard>
    </li>
  );
}

export function ScheduleSection({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useT();
  const fmt = useFmt();
  const orders = useForge((s) => s.maintenanceOrders);
  const machines = useForge((s) => s.machines);
  const now = useForge((s) => s.now);
  const today = startOfDay(now);

  const { overdueOrders, overdueService, days } = useMemo(() => {
    const open = orders.filter((o) => maintenanceIsOpen(o.status));
    // Machines that already have an open preventive order are covered by it.
    const covered = new Set(open.filter((o) => o.type === "preventive").map((o) => o.machineId));
    const overdueOrders = open.filter((o) => orderIsOverdue(o, now)).sort((a, b) => a.scheduledDate - b.scheduledDate);
    const overdueIds = new Set(overdueOrders.map((o) => o.id));
    const overdueService = machines.filter((m) => !covered.has(m.id) && serviceDays(m.nextMaintenance, today) < 0);
    const days = Array.from({ length: SCHEDULE_DAYS }, (_, i) => {
      const ts = today + i * DAY;
      // Day arithmetic via calendar days keeps DST changes from shifting buckets.
      return {
        ts,
        index: i,
        orders: open.filter((o) => !overdueIds.has(o.id) && serviceDays(o.scheduledDate, today) === i).sort((a, b) => a.scheduledDate - b.scheduledDate),
        service: machines.filter((m) => !covered.has(m.id) && serviceDays(m.nextMaintenance, today) === i),
      };
    });
    return { overdueOrders, overdueService, days };
  }, [orders, machines, now, today]);

  const overdueCount = overdueOrders.length + overdueService.length;

  return (
    <div className="grid gap-4 lg:gap-5 xl:grid-cols-3">
      <Panel
        title={t("maintenance.schedule.overdue")}
        subtitle={t("maintenance.schedule.overdueSubtitle")}
        actions={<Badge tone={overdueCount > 0 ? "danger" : "ok"}>{fmt.num(overdueCount)}</Badge>}
        className="xl:col-span-1"
        bodyClassName="!p-2"
      >
        {overdueCount === 0 ? (
          <EmptyState icon={CalendarCheck} title={t("maintenance.schedule.noOverdue")} hint={t("maintenance.schedule.noOverdueHint")} />
        ) : (
          <ul className="divide-y divide-line/60">
            {overdueOrders.map((o) => (
              <OrderRow key={o.id} order={o} onOpen={onOpen} overdue />
            ))}
            {overdueService.map((m) => (
              <ServiceRow key={m.id} machine={m} today={today} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("maintenance.schedule.upcoming", { n: SCHEDULE_DAYS })} subtitle={t("maintenance.schedule.upcomingSubtitle")} className="xl:col-span-2" flush>
        <ol>
          {days.map((d) => {
            const count = d.orders.length + d.service.length;
            const weekend = new Date(d.ts).getDay() === 0;
            return (
              <li key={d.ts} className={cn("grid grid-cols-1 border-b border-line/60 last:border-b-0 sm:grid-cols-[132px_1fr]", d.index === 0 && "bg-forge/[0.05]")}>
                <div className="flex items-baseline gap-2 px-4 pt-3 sm:flex-col sm:gap-0.5 sm:border-e sm:border-line/60 sm:py-3">
                  <span className={cn("text-[12.5px] font-semibold", d.index === 0 ? "text-forge-text" : "text-ink")}>{d.index === 0 ? t("common.today") : fmt.weekday(d.ts)}</span>
                  <span className="num text-[12px] text-ink-3">{fmt.dateShort(d.ts)}</span>
                  {weekend && <span className="text-[11px] text-ink-3">{t("maintenance.schedule.plantClosed")}</span>}
                </div>
                <div className="min-w-0 px-2 py-1.5">
                  {count === 0 ? (
                    <p className="px-2 py-2 text-[12px] text-ink-3">{t("maintenance.schedule.nothing")}</p>
                  ) : (
                    <ul className="divide-y divide-line/50">
                      {d.orders.map((o) => (
                        <OrderRow key={o.id} order={o} onOpen={onOpen} />
                      ))}
                      {d.service.map((m) => (
                        <ServiceRow key={m.id} machine={m} today={today} />
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Downtime history                                                    */
/* ------------------------------------------------------------------ */

const DOWNTIME_DAYS = 30;

export function DowntimeSection() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const lookup = useLookup();
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const today = useForge((s) => startOfDay(s.now));
  const [cause, setCause] = useState<DowntimeCause | "all">("all");

  const { events, byCause, byMachine, total } = useMemo(() => {
    const from = today - DOWNTIME_DAYS * DAY;
    const events = downtimeEvents.filter((e) => e.start >= from).sort((a, b) => b.start - a.start);
    const causeTotals = new Map(sumBy(events, (e) => e.cause, (e) => e.minutes).map((r) => [r.key, r.value]));
    const counts = new Map(sumBy(events, (e) => e.cause, () => 1).map((r) => [r.key, r.value]));
    return {
      events,
      byCause: CAUSES.map((c) => ({ cause: c, minutes: causeTotals.get(c) ?? 0, count: counts.get(c) ?? 0 })),
      byMachine: sumBy(events, (e) => e.machineId, (e) => e.minutes).slice(0, 6),
      total: events.reduce((s, e) => s + e.minutes, 0),
    };
  }, [downtimeEvents, today]);

  const chartRows = byCause.map((r) => ({ ...r, label: td(`cause.${r.cause}`), hours: Math.round((r.minutes / 60) * 10) / 10 }));
  const rows = useMemo(() => events.filter((e) => cause === "all" || e.cause === cause), [events, cause]);

  const columns = useMemo<Column<DowntimeEvent>[]>(
    () => [
      { id: "start", header: t("maintenance.downtime.col.start"), cell: (e) => <span className="num whitespace-nowrap">{fmt.dateTime(e.start)}</span>, sortValue: (e) => e.start, hideable: false, mobile: "subtitle" },
      {
        id: "machine",
        header: t("maintenance.col.equipment"),
        cell: (e) => (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
            <EntityLink entity={{ type: "machine", id: e.machineId }}>
              <Code>{e.machineId}</Code>
            </EntityLink>
            <span className="truncate font-normal text-ink-2">{lookup.machine(e.machineId) ? tl(lookup.machine(e.machineId)!.name) : ""}</span>
          </span>
        ),
        sortValue: (e) => e.machineId,
        mobile: "title",
      },
      {
        id: "line",
        header: t("common.line"),
        cell: (e) => (
          <EntityLink entity={{ type: "line", id: e.lineId }}>
            <Code>{lookup.line(e.lineId)?.code ?? e.lineId}</Code>
          </EntityLink>
        ),
        sortValue: (e) => e.lineId,
      },
      { id: "cause", header: t("maintenance.downtime.col.cause"), cell: (e) => <Badge>{td(`cause.${e.cause}`)}</Badge>, sortValue: (e) => e.cause, mobile: "badge" },
      { id: "minutes", header: t("maintenance.downtime.col.duration"), cell: (e) => fmt.duration(e.minutes), sortValue: (e) => e.minutes, align: "end" },
    ],
    [t, td, tl, fmt, lookup],
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <ChartPanel
          className="lg:col-span-2"
          title={t("maintenance.downtime.byCause")}
          subtitle={t("maintenance.downtime.byCauseSubtitle", { days: DOWNTIME_DAYS, total: fmt.duration(total), n: events.length })}
          empty={events.length === 0}
          table={{ columns: [t("maintenance.downtime.col.cause"), t("maintenance.downtime.hours"), t("maintenance.downtime.events")], rows: chartRows.map((r) => [r.label, r.hours, r.count]) }}
        >
          <BarChart data={chartRows} margin={cp.margin}>
            <CartesianGrid {...cp.grid} />
            <XAxis dataKey="label" {...cp.xAxis} interval={0} />
            <YAxis {...cp.yAxis} tickFormatter={(v: number) => fmt.num(v)} />
            <Tooltip cursor={cp.barCursor} content={<ChartTooltip unit={t("common.hours")} formatValue={(v) => fmt.num(v, 1)} />} />
            <Bar dataKey="hours" name={t("common.downtime")} fill={SERIES[3]} radius={[2, 2, 0, 0]} maxBarSize={44} {...cp.series} />
          </BarChart>
        </ChartPanel>
        <Panel title={t("maintenance.downtime.byMachine")} subtitle={t("maintenance.downtime.byMachineSubtitle", { days: DOWNTIME_DAYS })}>
          {byMachine.length === 0 ? (
            <EmptyState title={t("common.noData")} />
          ) : (
            <RankBars
              color={SERIES[3]}
              formatValue={(v) => fmt.duration(v)}
              rows={byMachine.map((r) => ({
                key: r.key,
                label: (
                  <>
                    <Code>{r.key}</Code> {lookup.machine(r.key) ? tl(lookup.machine(r.key)!.name) : ""}
                  </>
                ),
                value: r.value,
              }))}
            />
          )}
        </Panel>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(e) => e.id}
        caption={t("maintenance.downtime.events")}
        searchText={(e) => `${e.machineId} ${e.lineId} ${lookup.machine(e.machineId)?.name.en ?? ""} ${lookup.machine(e.machineId)?.name.ar ?? ""}`}
        searchPlaceholder={t("maintenance.downtime.search")}
        initialSort={{ id: "start", dir: "desc" }}
        activeFilters={cause === "all" ? 0 : 1}
        onClearFilters={() => setCause("all")}
        empty={{ title: t("common.noData") }}
        filters={
          <Select aria-label={t("maintenance.downtime.col.cause")} value={cause} onChange={(e) => setCause(e.target.value as DowntimeCause | "all")}>
            <option value="all">{t("maintenance.downtime.allCauses")}</option>
            {CAUSES.map((c) => (
              <option key={c} value={c}>
                {td(`cause.${c}`)}
              </option>
            ))}
          </Select>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cost summary                                                        */
/* ------------------------------------------------------------------ */

export function CostSection() {
  const { t, td } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const orders = useForge((s) => s.maintenanceOrders);

  const { months, byType, completedTotal, openTotal } = useMemo(() => {
    const monthFmt = new Intl.DateTimeFormat(fmt.locale, { month: "short", year: "2-digit" });
    const buckets = new Map<number, { ts: number; label: string; preventive: number; corrective: number; predictive: number }>();
    const byType = MAINT_TYPES.map((type) => ({ type, completed: 0, open: 0, count: 0 }));
    let completedTotal = 0, openTotal = 0;
    for (const o of orders) {
      const row = byType.find((r) => r.type === o.type)!;
      if (o.status === "completed") {
        const d = new Date(o.completedAt ?? o.scheduledDate);
        const ts = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        let b = buckets.get(ts);
        if (!b) buckets.set(ts, (b = { ts, label: monthFmt.format(ts), preventive: 0, corrective: 0, predictive: 0 }));
        b[o.type] += o.cost;
        row.completed += o.cost;
        row.count++;
        completedTotal += o.cost;
      } else if (maintenanceIsOpen(o.status)) {
        row.open += o.cost;
        openTotal += o.cost;
      }
    }
    return { months: [...buckets.values()].sort((a, b) => a.ts - b.ts), byType, completedTotal, openTotal };
  }, [orders, fmt.locale]);

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <ChartPanel
        className="lg:col-span-2"
        title={t("maintenance.cost.byMonth")}
        subtitle={t("maintenance.cost.byMonthSubtitle")}
        empty={months.length === 0}
        legend={MAINT_TYPES.map((type) => (
          <LegendItem key={type} color={TYPE_COLOR[type]} label={td(`mnttype.${type}`)} />
        ))}
        table={{
          columns: [t("maintenance.cost.month"), ...MAINT_TYPES.map((type) => td(`mnttype.${type}`)), t("common.total")],
          rows: months.map((m) => [m.label, fmt.money(m.preventive), fmt.money(m.corrective), fmt.money(m.predictive), fmt.money(m.preventive + m.corrective + m.predictive)]),
        }}
      >
        <BarChart data={months} margin={cp.margin}>
          <CartesianGrid {...cp.grid} />
          <XAxis dataKey="label" {...cp.xAxis} />
          <YAxis {...cp.yAxis} width={52} tickFormatter={(v: number) => fmt.compactMoney(v)} />
          <Tooltip cursor={cp.barCursor} content={<ChartTooltip formatValue={(v) => fmt.money(v)} />} />
          {MAINT_TYPES.map((type) => (
            <Bar key={type} dataKey={type} stackId="cost" name={td(`mnttype.${type}`)} fill={TYPE_COLOR[type]} stroke="var(--base)" strokeWidth={1} maxBarSize={56} {...cp.series} />
          ))}
        </BarChart>
      </ChartPanel>

      <Panel title={t("maintenance.cost.byType")} subtitle={t("maintenance.cost.byTypeSubtitle")}>
        <div className="grid grid-cols-2 gap-4 border-b border-line pb-4">
          <div className="min-w-0">
            <p className="label">{t("maintenance.cost.completed")}</p>
            <p className="display num mt-1 text-[24px] text-ink">{fmt.money(completedTotal)}</p>
          </div>
          <div className="min-w-0">
            <p className="label">{t("maintenance.cost.openEstimate")}</p>
            <p className="display num mt-1 text-[24px] text-ink">{fmt.money(openTotal)}</p>
          </div>
        </div>
        <ul className="mt-4 space-y-4">
          {byType.map((r) => (
            <li key={r.type}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[12.5px] text-ink">
                  <span aria-hidden className="size-2 rounded-[1px]" style={{ background: TYPE_COLOR[r.type] }} />
                  {td(`mnttype.${r.type}`)}
                </span>
                <span className="num text-[12.5px] font-semibold text-ink">{fmt.money(r.completed)}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-[1px] bg-line/60">
                <div className="h-full rounded-[1px]" style={{ width: `${completedTotal ? Math.max(1.5, (r.completed / completedTotal) * 100) : 0}%`, background: TYPE_COLOR[r.type] }} />
              </div>
              <p className="num mt-1 text-[11.5px] text-ink-3">{t("maintenance.cost.typeHint", { n: r.count, open: fmt.money(r.open) })}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-3">{t("maintenance.cost.note")}</p>
      </Panel>
    </div>
  );
}
