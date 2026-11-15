"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { BellRing, Box, CalendarRange, ChevronRight, Plus, Thermometer } from "lucide-react";
import type { Alert, DowntimeEvent, ID, Machine, ProductionLine, WorkOrder } from "@/domain/types";
import { machineTelemetry, tempLimit, woIsOpen, woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, shiftAt } from "@/lib/time";
import { useForge } from "@/store/store";
import { lineLive } from "@/store/selectors";
import { Badge, Button, Code, EmptyState, Gauge, Panel, Progress, SimBadge, cn, toneText } from "@/components/ui/primitives";
import { EntityLink, EntityNotFound, Guard, Page, PageHeader, useLookup } from "@/components/ui/page";
import { SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { LineCharts } from "./LineCharts";
import { LineStatusMenu } from "./LineStatusMenu";
import { LineTimeline } from "./LineTimeline";
import { WorkOrderMenu, useWorkOrderActions } from "./WorkOrderActions";
import { WorkOrderFormModal } from "./WorkOrderForm";
import { Figure, SectionTitle, WO_STATUS_RANK, attainmentTone, oeeTone, woIsLate } from "./shared";

const linkButton = "inline-flex h-[34px] items-center gap-1.5 rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium text-ink hover:bg-panel";

export function LineDetailView({ id }: { id: ID }) {
  const { t } = useT();
  const line = useForge((s) => s.lines.find((l) => l.id === id));
  if (!line) return <EntityNotFound backHref="/production" backLabel={t("nav.production")} />;
  return <LineDetail line={line} />;
}

function LineDetail({ line }: { line: ProductionLine }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const allMachines = useForge((s) => s.machines);
  const workOrders = useForge((s) => s.workOrders);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const alerts = useForge((s) => s.alerts);
  const now = useForge((s) => s.now);
  const actions = useWorkOrderActions();
  const [creating, setCreating] = useState(false);

  const machines = useMemo(() => allMachines.filter((m) => m.lineId === line.id).sort((a, b) => a.station - b.station), [allMachines, line.id]);
  const lineOrders = useMemo(() => workOrders.filter((o) => o.lineId === line.id), [workOrders, line.id]);
  const openOrders = useMemo(
    () => lineOrders.filter(woIsOpen).sort((a, b) => WO_STATUS_RANK[a.status] - WO_STATUS_RANK[b.status] || a.plannedStart - b.plannedStart),
    [lineOrders],
  );
  const recentDowntime = useMemo(
    () => downtimeEvents.filter((e) => e.lineId === line.id && e.start >= now - 30 * DAY && e.start <= now).sort((a, b) => b.start - a.start),
    [downtimeEvents, line.id, now],
  );
  const lineAlerts = useMemo(() => {
    const machineIds = new Set(machines.map((m) => m.id));
    const orderIds = new Set(lineOrders.map((o) => o.id));
    return alerts
      .filter(
        (a) =>
          (a.entity.type === "line" && a.entity.id === line.id) ||
          (a.entity.type === "machine" && machineIds.has(a.entity.id)) ||
          (a.entity.type === "workOrder" && orderIds.has(a.entity.id)),
      )
      .sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || b.createdAt - a.createdAt);
  }, [alerts, machines, lineOrders, line.id]);

  const factory = lookup.factory(line.factoryId);
  const product = lookup.product(line.productId);

  const orderColumns = useMemo<Column<WorkOrder>[]>(
    () => [
      { id: "id", header: t("wo.col.id"), cell: (o) => <EntityLink entity={{ type: "workOrder", id: o.id }} />, sortValue: (o) => o.id, mobile: "title", hideable: false },
      {
        id: "product",
        header: t("common.product"),
        cell: (o) => {
          const p = lookup.product(o.productId);
          return p ? (
            <span className="inline-flex min-w-0 items-center gap-2">
              <Code>{p.sku}</Code>
              <span className="truncate text-ink-2">{tl(p.name)}</span>
            </span>
          ) : (
            "—"
          );
        },
        mobile: "subtitle",
      },
      { id: "status", header: t("common.status"), cell: (o) => <StatusBadge kind="wo" value={o.status} />, sortValue: (o) => WO_STATUS_RANK[o.status], mobile: "badge" },
      { id: "priority", header: t("common.priority"), cell: (o) => <StatusBadge kind="priority" value={o.priority} /> },
      {
        id: "progress",
        header: t("common.progress"),
        width: "190px",
        cell: (o) => (
          <span className="flex items-center gap-2">
            <Progress value={woProgress(o)} tone={o.status === "paused" ? "warn" : "accent"} label={t("common.progress")} className="min-w-[60px]" />
            <span className="num w-[84px] shrink-0 text-end text-[12px] text-ink-2">
              {fmt.num(o.completedQty)} / {fmt.num(o.plannedQty)}
            </span>
          </span>
        ),
        sortValue: (o) => woProgress(o),
      },
      { id: "start", header: t("wo.plannedStart"), cell: (o) => fmt.dateTime(o.plannedStart), sortValue: (o) => o.plannedStart },
      {
        id: "due",
        header: t("wo.dueDate"),
        cell: (o) => <span className={cn(woIsLate(o, now) && "font-semibold text-danger")}>{fmt.dateTime(o.dueDate)}</span>,
        sortValue: (o) => o.dueDate,
      },
    ],
    [t, tl, fmt, lookup, now],
  );

  const downtimeColumns = useMemo<Column<DowntimeEvent>[]>(
    () => [
      { id: "start", header: t("production.downtime.start"), cell: (e) => fmt.dateTime(e.start), sortValue: (e) => e.start, mobile: "title", hideable: false },
      { id: "cause", header: t("production.downtime.cause"), cell: (e) => <CauseBadge cause={e.cause} />, sortValue: (e) => e.cause, mobile: "badge" },
      {
        id: "machine",
        header: t("common.machine"),
        cell: (e) => {
          const m = lookup.machine(e.machineId);
          return (
            <span className="inline-flex min-w-0 items-center gap-2">
              <EntityLink entity={{ type: "machine", id: e.machineId }} />
              {m && <span className="truncate text-ink-3">{tl(m.kind)}</span>}
            </span>
          );
        },
        sortValue: (e) => e.machineId,
        mobile: "subtitle",
      },
      { id: "minutes", header: t("production.downtime.duration"), cell: (e) => fmt.duration(e.minutes), sortValue: (e) => e.minutes, align: "end" },
    ],
    [t, tl, fmt, lookup],
  );

  return (
    <Page>
      <PageHeader
        back={{ href: "/production", label: t("nav.production") }}
        eyebrow={
          <>
            <Code>{line.code}</Code>
            {factory && <span>{tl(factory.name)}</span>}
          </>
        }
        title={tl(line.name)}
        meta={<StatusBadge kind="line" value={line.status} />}
        subtitle={
          product ? (
            <>
              {t("production.detail.makes")} <Code>{product.sku}</Code> {tl(product.name)} · {t("production.detail.nominal", { rate: fmt.num(line.nominalRate) })}
            </>
          ) : undefined
        }
        actions={
          <>
            <Link href="/factory" className={linkButton}>
              <Box aria-hidden className="size-3.5" />
              {t("nav.factory")}
            </Link>
            <Link href="/planning" className={linkButton}>
              <CalendarRange aria-hidden className="size-3.5" />
              {t("nav.planning")}
            </Link>
            <LineStatusMenu line={line} />
          </>
        }
      />

      <LiveBlock line={line} now={now} />

      <MachineFlow machines={machines} />

      <LineCharts lineId={line.id} />

      <section className="flex flex-col gap-3">
        <SectionTitle
          title={t("production.orders.title")}
          hint={t("production.orders.hint")}
          actions={
            <Guard cap="wo.manage">
              <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
                {t("wo.create.title")}
              </Button>
            </Guard>
          }
        />
        <DataTable
          rows={openOrders}
          columns={orderColumns}
          getRowId={(o) => o.id}
          caption={t("production.orders.title")}
          rowHref={(o) => `/work-orders/${o.id}`}
          pageSize={10}
          rowActions={(o) => <WorkOrderMenu actions={actions} order={o} />}
          empty={{ title: t("production.orders.empty"), hint: t("production.orders.emptyHint") }}
        />
      </section>

      <LineTimeline orders={lineOrders} now={now} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionTitle title={t("production.downtime.title")} hint={t("production.downtime.hint", { n: fmt.num(recentDowntime.length), total: fmt.duration(recentDowntime.reduce((s, e) => s + e.minutes, 0)) })} />
          <DataTable
            rows={recentDowntime}
            columns={downtimeColumns}
            getRowId={(e) => e.id}
            caption={t("production.downtime.title")}
            initialSort={{ id: "start", dir: "desc" }}
            pageSize={10}
            empty={{ title: t("production.downtime.empty") }}
          />
        </section>
        <AlertsPanel alerts={lineAlerts} now={now} />
      </div>

      {actions.dialogs}
      <WorkOrderFormModal open={creating} onClose={() => setCreating(false)} defaultLineId={line.id} />
    </Page>
  );
}

function CauseBadge({ cause }: { cause: DowntimeEvent["cause"] }) {
  const { td } = useT();
  return <Badge tone={cause === "planned" || cause === "changeover" ? "neutral" : cause === "quality" || cause === "material" ? "warn" : "danger"}>{td(`cause.${cause}`)}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Live block                                                          */
/* ------------------------------------------------------------------ */

function LiveBlock({ line, now }: { line: ProductionLine; now: number }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const live = lineLive(line, now);
  const shift = shiftAt(now);
  const producing = line.status === "running";
  const tone = producing ? attainmentTone(live.attainment) : "neutral";
  const gap = live.output - live.expected;
  const apq = [
    { key: "availability", value: live.availability },
    { key: "performance", value: live.performance },
    { key: "quality", value: live.quality },
  ] as const;

  return (
    <Panel
      title={t("production.live.title")}
      subtitle={
        <bdi>
          {td(`shift.${shift.id}`)} · {fmt.time(shift.start)} – {fmt.time(shift.end)}
        </bdi>
      }
      actions={<SimBadge />}
      bodyClassName="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <div className="label">{t("production.live.output")}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="display num text-[40px] leading-none text-ink">{fmt.num(live.output)}</span>
              <span className="num text-[13px] text-ink-3">
                / {fmt.num(live.target)} {t("common.units")}
              </span>
            </div>
          </div>
          <div className={cn("num text-[13px] font-semibold", toneText[tone])}>
            {t("production.row.ofPlan", { pct: fmt.pct(live.attainment, 0) })}
            <span className="ms-2 font-normal text-ink-3">
              ({gap >= 0 ? "+" : "−"}
              {fmt.num(Math.abs(Math.round(gap)))})
            </span>
          </div>
        </div>
        <Progress
          className="mt-4"
          thick
          value={live.target > 0 ? live.output / live.target : 0}
          marker={live.target > 0 ? live.expected / live.target : undefined}
          tone={tone}
          label={t("production.row.outputLabel", { line: line.code })}
        />
        <p className="mt-2 text-[11.5px] text-ink-3">{t("production.live.markerHint")}</p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
          <Figure label={t("production.live.expected")} value={fmt.num(Math.round(live.expected))} unit={t("common.unitsShort")} />
          <Figure
            label={t("production.live.rate")}
            value={fmt.num(Math.round(live.rate))}
            unit={t("common.perHour")}
            hint={t("production.live.nominal", { rate: fmt.num(line.nominalRate) })}
          />
          <Figure
            label={t("production.rejected")}
            value={fmt.num(live.rejected)}
            unit={t("common.unitsShort")}
            hint={live.output > 0 ? fmt.pct(live.rejected / live.output) : undefined}
          />
          <Figure label={t("common.downtime")} value={fmt.duration(live.downtimeMin)} tone={live.downtimeMin >= 60 ? "danger" : live.downtimeMin >= 20 ? "warn" : undefined} />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-5 border-t border-line pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
        <Gauge value={live.oee} size={112} stroke={8} tone={oeeTone(live.oee)} label={`${t("common.oee")} ${fmt.pct(live.oee)}`}>
          <span className="display num text-[22px] leading-none text-ink">{fmt.pct(live.oee, 0)}</span>
          <span className="label mt-1">{t("common.oee")}</span>
        </Gauge>
        <dl className="min-w-0 flex-1 space-y-3">
          {apq.map((x) => (
            <div key={x.key}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <dt className="text-ink-2">{td(`common.${x.key}`)}</dt>
                <dd className="num font-semibold text-ink">{fmt.pct(x.value)}</dd>
              </div>
              <Progress className="mt-1.5" value={x.value} tone="neutral" label={td(`common.${x.key}`)} />
            </div>
          ))}
          <p className="text-[11px] text-ink-3">{t("production.live.oeeFormula")}</p>
        </dl>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Machines as a process flow                                          */
/* ------------------------------------------------------------------ */

function MachineFlow({ machines }: { machines: Machine[] }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const tick = useForge((s) => s.tick);
  return (
    <Panel title={t("production.machines.title")} subtitle={t("production.machines.subtitle")} actions={<SimBadge />}>
      <ol className="flex flex-col items-stretch gap-1.5 xl:flex-row">
        {machines.map((m, i) => {
          const tel = machineTelemetry(m, tick);
          const hot = tel.temperature > tempLimit(m);
          return (
            <Fragment key={m.id}>
              {i > 0 && (
                <li aria-hidden className="flex shrink-0 items-center justify-center text-ink-3">
                  <ChevronRight className="size-4 rotate-90 xl:rotate-0 xl:rtl:-scale-x-100" />
                </li>
              )}
              <li className="min-w-0 flex-1">
                <Link href={`/equipment/${m.id}`} className="block h-full rounded-md border border-line bg-canvas/40 px-3.5 py-3 transition-colors hover:border-line-2 hover:bg-raised">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label">{t("production.machines.station", { n: fmt.num(m.station + 1) })}</span>
                    <StatusBadge kind="machine" value={m.status} />
                  </div>
                  <div className="mt-2 truncate text-[13px] font-semibold text-ink">{tl(m.kind)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-3">
                    <Code className="text-[11.5px]">{m.id}</Code>
                    <span className="truncate">{m.model}</span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2 text-[11.5px] text-ink-3">
                    <span>{t("common.utilization")}</span>
                    <span className="num font-semibold text-ink">{fmt.pct(m.utilization / 100, 0)}</span>
                  </div>
                  <Progress className="mt-1.5" value={m.utilization / 100} tone="neutral" label={t("common.utilization")} />
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                    <span className="inline-flex items-center gap-1">
                      <Thermometer aria-hidden className="size-3.5" />
                      {t("common.temperature")}
                    </span>
                    <span className={cn("num font-semibold", hot ? "text-danger" : "text-ink")}>
                      <bdi>{fmt.num(tel.temperature, 1)} °C</bdi>
                      {hot && <span className="ms-1.5 font-normal">{t("production.machines.overLimit", { limit: fmt.num(tempLimit(m)) })}</span>}
                    </span>
                  </div>
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

function AlertsPanel({ alerts, now }: { alerts: Alert[]; now: number }) {
  const { t, td, tm } = useT();
  const fmt = useFmt();
  const open = alerts.filter((a) => a.status !== "resolved").length;
  return (
    <Panel flush title={t("production.alerts.title")} subtitle={t("production.alerts.subtitle", { n: fmt.num(open) })} className="self-start">
      {alerts.length === 0 ? (
        <EmptyState icon={BellRing} title={t("production.alerts.empty")} hint={t("production.alerts.emptyHint")} />
      ) : (
        <ul className="divide-y divide-line/70">
          {alerts.slice(0, 8).map((a) => (
            <li key={a.id} className={cn("px-4 py-3", a.status === "resolved" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={SEVERITY_TONE[a.severity]} dot>
                  {td(`severity.${a.severity}`)}
                </Badge>
                <StatusBadge kind="alert" value={a.status} />
                <span className="num ms-auto text-[11.5px] text-ink-3">{fmt.relative(a.createdAt, now)}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{tm(a.title)}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">{tm(a.detail)}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-3">
                <span>{td(`entity.${a.entity.type}`)}</span>
                <EntityLink entity={a.entity} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
