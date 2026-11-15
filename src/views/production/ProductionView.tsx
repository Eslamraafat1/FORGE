"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarRange, ChevronRight, Rows3 } from "lucide-react";
import type { ID, LineStatus, Machine, ProductionLine, WorkOrder } from "@/domain/types";
import { woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { shiftAt } from "@/lib/time";
import { useForge } from "@/store/store";
import { lineLive, networkLive } from "@/store/selectors";
import { Code, EmptyState, Panel, Progress, Select, SimBadge, cn, toneBg, toneText } from "@/components/ui/primitives";
import { EntityLink, Kpi, KpiStrip, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { LINE_TONE, StatusBadge } from "@/components/ui/status";
import { LineStatusMenu } from "./LineStatusMenu";
import { LINE_STATUSES, MachineDots, attainmentTone, oeeTone } from "./shared";

const ROW_GRID =
  "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1.05fr)_84px_96px_minmax(0,1.15fr)_36px]";

export function ProductionView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const workOrders = useForge((s) => s.workOrders);
  const factories = useForge((s) => s.factories);
  const now = useForge((s) => s.now);
  const [factory, setFactory] = useState<ID | "">("");
  const [status, setStatus] = useState<LineStatus | "">("");

  const net = useMemo(() => networkLive(lines, now), [lines, now]);
  const shown = useMemo(() => lines.filter((l) => (!factory || l.factoryId === factory) && (!status || l.status === status)), [lines, factory, status]);

  const machinesByLine = useMemo(() => {
    const m = new Map<ID, Machine[]>();
    for (const mc of machines) m.set(mc.lineId, [...(m.get(mc.lineId) ?? []), mc]);
    for (const list of m.values()) list.sort((a, b) => a.station - b.station);
    return m;
  }, [machines]);

  const activeByLine = useMemo(() => {
    const m = new Map<ID, WorkOrder>();
    for (const o of workOrders) {
      if (!o.lineId || (o.status !== "in_progress" && o.status !== "paused")) continue;
      if (o.status === "in_progress" || !m.has(o.lineId)) m.set(o.lineId, o);
    }
    return m;
  }, [workOrders]);

  const attainment = net.expected > 0 ? net.output / net.expected : 0;

  return (
    <Page>
      <PageHeader
        eyebrow={t("production.eyebrow")}
        title={t("nav.production")}
        subtitle={t("production.subtitle")}
        meta={<SimBadge />}
        actions={
          <Link href="/planning" className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium text-ink hover:bg-panel">
            <CalendarRange aria-hidden className="size-3.5" />
            {t("nav.planning")}
          </Link>
        }
      />

      <KpiStrip columns={4}>
        <Kpi
          label={t("production.kpi.running")}
          value={net.activeLines}
          format={(n) => fmt.num(Math.round(n))}
          unit={t("production.kpi.ofLines", { total: fmt.num(net.totalLines) })}
          hint={t("production.kpi.rate", { rate: fmt.num(Math.round(net.rate)) })}
          icon={Rows3}
        />
        <Kpi
          label={t("production.kpi.output")}
          value={net.output}
          format={(n) => fmt.num(Math.round(n))}
          unit={t("common.units")}
          tone={attainmentTone(attainment) === "ok" ? undefined : attainmentTone(attainment)}
          hint={t("production.kpi.vsPlan", { pct: fmt.pct(attainment, 0), plan: fmt.num(Math.round(net.expected)) })}
        />
        <Kpi
          label={t("production.kpi.oee")}
          value={net.oee}
          format={(n) => fmt.pct(n)}
          hint={t("production.kpi.apq", { a: fmt.pct(net.availability, 0), p: fmt.pct(net.performance, 0), q: fmt.pct(net.quality, 0) })}
        />
        <Kpi label={t("production.kpi.downtime")} value={net.downtimeMin} format={(n) => fmt.duration(n)} hint={t("production.kpi.rejected", { n: fmt.num(net.rejected) })} />
      </KpiStrip>

      <ShiftPanel />

      <Panel
        flush
        title={t("production.lines.title")}
        subtitle={t("production.lines.count", { n: fmt.num(shown.length), total: fmt.num(lines.length) })}
        actions={
          <>
            <Select aria-label={t("common.factory")} value={factory} onChange={(e) => setFactory(e.target.value)} className="!h-8 !w-auto min-w-[130px] !text-[12.5px]">
              <option value="">{t("production.filter.allFactories")}</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {tl(f.name)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value as LineStatus | "")} className="!h-8 !w-auto min-w-[130px] !text-[12.5px]">
              <option value="">{t("production.filter.allStatuses")}</option>
              {LINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`lstatus.${s}`)}
                </option>
              ))}
            </Select>
          </>
        }
      >
        {shown.length === 0 ? (
          <EmptyState icon={Rows3} title={t("common.noResults")} hint={t("common.noResultsHint")} />
        ) : (
          <>
            <div className={cn("hidden gap-x-4 border-b border-line bg-canvas/50 px-4 py-2 xl:grid", ROW_GRID)} aria-hidden>
              <span className="label">{t("common.line")}</span>
              <span className="label">{t("production.col.output")}</span>
              <span className="label">{t("common.oee")}</span>
              <span className="label">{t("common.downtime")}</span>
              <span className="label">{t("production.col.machines")}</span>
              <span className="label">{t("production.col.crew")}</span>
              <span />
            </div>
            <ul className="divide-y divide-line/70">
              {shown.map((line) => (
                <LineRow key={line.id} line={line} machines={machinesByLine.get(line.id) ?? []} order={activeByLine.get(line.id)} now={now} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </Page>
  );
}

function LineRow({ line, machines, order, now }: { line: ProductionLine; machines: Machine[]; order?: WorkOrder; now: number }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const live = lineLive(line, now);
  const product = lookup.product(line.productId);
  const factory = lookup.factory(line.factoryId);
  const producing = line.status === "running";
  const tone = producing ? attainmentTone(live.attainment) : "neutral";

  return (
    <li className={cn("relative grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 xl:items-center", ROW_GRID)}>
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", toneBg[LINE_TONE[line.status]], !producing && "opacity-60")} />

      {/* Identity */}
      <div className="col-span-2 min-w-0 pe-10 xl:col-span-1 xl:pe-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/production/${line.id}`} className="group inline-flex min-w-0 items-center gap-2 text-ink hover:text-forge-text">
            <Code className="text-[13px] font-semibold">{line.code}</Code>
            <span className="truncate text-[13.5px] font-semibold">{tl(line.name)}</span>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-3 group-hover:text-forge-text rtl:-scale-x-100" />
          </Link>
          <StatusBadge kind="line" value={line.status} />
        </div>
        <p className="mt-1 truncate text-[12px] text-ink-3">
          {factory ? tl(factory.name) : "—"}
          {product && (
            <>
              {" · "}
              <Code className="text-[11.5px]">{product.sku}</Code> <span className="text-ink-2">{tl(product.name)}</span>
            </>
          )}
        </p>
      </div>

      {/* Output vs target */}
      <div className="col-span-2 min-w-0 xl:col-span-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-[15px] font-semibold text-ink">
            {fmt.num(live.output)}
            <span className="text-[12px] font-normal text-ink-3"> / {fmt.num(live.target)}</span>
          </span>
          <span className={cn("num text-[12px] font-semibold", toneText[tone])}>{t("production.row.ofPlan", { pct: fmt.pct(live.attainment, 0) })}</span>
        </div>
        <Progress
          className="mt-2"
          value={live.target > 0 ? live.output / live.target : 0}
          marker={live.target > 0 ? live.expected / live.target : undefined}
          tone={tone}
          label={t("production.row.outputLabel", { line: line.code })}
        />
        <p className="num mt-1.5 text-[11.5px] text-ink-3">
          {t("production.row.planNow", { n: fmt.num(Math.round(live.expected)) })} · {fmt.num(Math.round(live.rate))} / {fmt.num(line.nominalRate)} {t("common.perHour")}
        </p>
      </div>

      {/* OEE */}
      <div className="min-w-0">
        <div className="label xl:hidden">{t("common.oee")}</div>
        <div className={cn("num mt-1 text-[15px] font-semibold xl:mt-0", toneText[oeeTone(live.oee)])}>{fmt.pct(live.oee)}</div>
        <div className="num mt-0.5 text-[11px] text-ink-3" title={`${t("common.availability")} · ${t("common.performance")} · ${t("common.quality")}`}>
          {t("production.row.apq", { a: fmt.pct(live.availability, 0), p: fmt.pct(live.performance, 0), q: fmt.pct(live.quality, 0) })}
        </div>
      </div>

      {/* Downtime */}
      <div className="min-w-0">
        <div className="label xl:hidden">{t("common.downtime")}</div>
        <div className={cn("num mt-1 text-[13px] font-semibold xl:mt-0", live.downtimeMin >= 60 ? "text-danger" : live.downtimeMin >= 20 ? "text-amber" : "text-ink")}>{fmt.duration(live.downtimeMin)}</div>
        <div className="num mt-0.5 text-[11px] text-ink-3">{t("production.row.rejected", { n: fmt.num(live.rejected) })}</div>
      </div>

      {/* Machines */}
      <div className="min-w-0">
        <div className="label mb-1 xl:hidden">{t("production.col.machines")}</div>
        <MachineDots machines={machines} />
      </div>

      {/* Supervisor + active order */}
      <div className="min-w-0 text-[12.5px]">
        <div className="label mb-1 xl:hidden">{t("production.col.crew")}</div>
        <Member id={line.supervisorId} size={20} />
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
          {order ? (
            <>
              <EntityLink entity={{ type: "workOrder", id: order.id }} />
              <span className="num">{fmt.pct(woProgress(order), 0)}</span>
              {order.status === "paused" && <StatusBadge kind="wo" value="paused" />}
            </>
          ) : (
            <span>{t("production.row.noOrder")}</span>
          )}
        </div>
      </div>

      <div className="absolute end-3 top-3 xl:static xl:justify-self-end">
        <LineStatusMenu line={line} variant="icon" />
      </div>
    </li>
  );
}

/** Current shift (from the simulated clock) and the three-shift roster. */
function ShiftPanel() {
  const { t, tl } = useT();
  const fmt = useFmt();
  const shifts = useForge((s) => s.shifts);
  const now = useForge((s) => s.now);
  const shift = shiftAt(now);
  const current = shifts.find((s) => s.id === shift.id);
  const hour = (h: number) => fmt.time(new Date(2026, 0, 1, h, 0).getTime());

  return (
    <Panel title={t("production.shift.title")} subtitle={t("production.shift.subtitle")} bodyClassName="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <div className="label">{t("common.range.shift")}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="display text-[24px] text-ink">{current ? tl(current.name) : shift.id}</span>
          <span className="num text-[12px] text-ink-3">
            <bdi>
              {fmt.time(shift.start)} – {fmt.time(shift.end)}
            </bdi>
          </span>
        </div>
        <Progress className="mt-3" thick value={shift.progress} label={t("production.shift.progress")} />
        <div className="num mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] text-ink-3">
          <span>{t("production.shift.elapsed", { time: fmt.duration(shift.elapsedMin), pct: fmt.pct(shift.progress, 0) })}</span>
          <span>{t("production.shift.remaining", { time: fmt.duration(Math.max(0, 480 - shift.elapsedMin)) })}</span>
        </div>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
        {shifts.map((s) => {
          const active = s.id === shift.id;
          return (
            <li key={s.id} className={cn("relative min-w-0 bg-base px-3.5 py-3", active && "bg-raised")}>
              {active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-forge" />}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-ink">{tl(s.name)}</span>
                {active && <span className="label text-forge-text">{t("common.current")}</span>}
              </div>
              <div className="num mt-0.5 text-[11.5px] text-ink-3">
                <bdi>
                  {hour(s.startHour)} – {hour(s.endHour)}
                </bdi>
              </div>
              <div className="mt-2.5 text-[12.5px]">
                <Member id={s.supervisorId} size={20} showRole />
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
