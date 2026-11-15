"use client";
/** Contextual information for the twin: machine, production zone, and the plant summary. */
import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import type { ActivityEvent, Factory, ID, Machine, MachineStatus, ProductionLine } from "@/domain/types";
import { machineTelemetry, tempLimit, woProgress } from "@/domain/rules";
import { Menu } from "@/components/ui/overlay";
import { EntityLink, Guard, useLookup } from "@/components/ui/page";
import { Badge, Button, Code, Progress, SimBadge, cn, type Tone } from "@/components/ui/primitives";
import { LINE_TONE, SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { toneBg } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { lineLive, type ZoneUsage } from "@/store/selectors";
import { useForge } from "@/store/store";
import type { FactoryLayout } from "./layout";
import { STATUS_ORDER, StatusGlyph, type Selection, type ViewMode } from "./shared";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line pt-3.5", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[12px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-end text-[12.5px] text-ink">{children}</dd>
    </div>
  );
}

function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink-3 hover:bg-panel">
      {children}
      <ArrowUpRight aria-hidden className="size-3.5 text-ink-3 rtl:-scale-x-100" />
    </Link>
  );
}

function Reading({ label, value, unit, note, ratio, marker, tone = "neutral", alert }: { label: string; value: string; unit?: string; note?: string; ratio: number; marker?: number; tone?: Tone; alert?: string }) {
  return (
    <div className="min-w-0 bg-base px-3 py-2.5">
      <div className="label truncate">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={cn("display num text-[22px]", tone === "danger" ? "text-danger" : tone === "warn" ? "text-amber" : "text-ink")}>{value}</span>
        {unit && <bdi className="font-mono text-[11px] text-ink-3">{unit}</bdi>}
      </div>
      <Progress value={ratio} marker={marker} tone={tone} label={label} className="mt-2" />
      <div className="mt-1.5 flex min-h-[16px] items-center justify-between gap-2 text-[11px] text-ink-3">
        <span className="truncate">{note}</span>
        {alert && <span className="shrink-0 font-semibold text-danger">{alert}</span>}
      </div>
    </div>
  );
}

function EventList({ events }: { events: ActivityEvent[] }) {
  const { t, tm } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  if (events.length === 0) return <p className="text-[12px] text-ink-3">{t("factory.events.empty")}</p>;
  return (
    <ol className="flex flex-col">
      {events.map((ev) => (
        <li key={ev.id} className="flex gap-2.5 border-b border-line/60 py-2 last:border-b-0">
          <span aria-hidden className={cn("mt-[5px] size-1.5 shrink-0 rounded-[1px]", toneBg[SEVERITY_TONE[ev.severity]])} />
          <div className="min-w-0">
            <p className="text-[12.5px] leading-snug text-ink">{tm(ev.msg)}</p>
            <p className="num mt-0.5 text-[11px] text-ink-3">{fmt.relative(ev.at, now)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function useRecentEvents(match: (ev: ActivityEvent) => boolean, limit = 5): ActivityEvent[] {
  const activity = useForge((s) => s.activity);
  return useMemo(() => activity.filter(match).sort((a, b) => b.at - a.at).slice(0, limit), [activity, match, limit]);
}

/* ------------------------------------------------------------------ */
/* Machine                                                             */
/* ------------------------------------------------------------------ */

export function MachineDetail({ machine, onSelect }: { machine: Machine; onSelect: (s: Selection) => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const lookup = useLookup();
  const tick = useForge((s) => s.tick);
  const now = useForge((s) => s.now);
  const workOrders = useForge((s) => s.workOrders);
  const maintenanceOrders = useForge((s) => s.maintenanceOrders);
  const setMachineStatus = useForge((s) => s.setMachineStatus);

  const telemetry = machineTelemetry(machine, tick);
  const limit = tempLimit(machine);
  const overLimit = telemetry.temperature > limit;
  const line = lookup.line(machine.lineId);
  const order = useMemo(() => workOrders.find((o) => o.lineId === machine.lineId && o.status === "in_progress"), [workOrders, machine.lineId]);
  const overdue = machine.nextMaintenance < now;

  const match = useMemo(() => {
    const orderIds = new Set(maintenanceOrders.filter((o) => o.machineId === machine.id).map((o) => o.id));
    return (ev: ActivityEvent) =>
      !!ev.entity &&
      ((ev.entity.type === "machine" && ev.entity.id === machine.id) ||
        (ev.entity.type === "line" && ev.entity.id === machine.lineId) ||
        (ev.entity.type === "maintenance" && orderIds.has(ev.entity.id)));
  }, [maintenanceOrders, machine.id, machine.lineId]);
  const events = useRecentEvents(match);

  const speedDigits = machine.baseSpeed >= 100 ? 0 : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="machine" value={machine.status} />
        <Code className="text-ink-2">{machine.id}</Code>
        <span className="text-[12px] text-ink-3">{tl(machine.kind)}</span>
      </div>

      <Section title={t("factory.f.telemetry")} aside={<SimBadge label={t("common.simulated")} />} className="border-t-0 pt-0">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
          <Reading
            label={t("common.temperature")}
            value={fmt.num(telemetry.temperature, 1)}
            unit={t("factory.unit.celsius")}
            note={t("factory.f.tempLimit", { limit })}
            ratio={telemetry.temperature / (limit * 1.25)}
            marker={0.8}
            tone={overLimit ? "danger" : "neutral"}
            alert={overLimit ? t("factory.f.overLimit") : undefined}
          />
          <Reading
            label={t("factory.f.speed")}
            value={fmt.num(telemetry.speed, speedDigits)}
            unit={machine.speedUnit}
            note={t("factory.f.nominal", { value: fmt.num(machine.baseSpeed, speedDigits) })}
            ratio={machine.baseSpeed > 0 ? telemetry.speed / machine.baseSpeed : 0}
          />
          <Reading label={t("common.load")} value={fmt.num(telemetry.load)} unit="%" note={t("factory.f.loadHint")} ratio={telemetry.load / 100} tone={telemetry.load >= 90 ? "warn" : "neutral"} />
          <Reading label={t("common.utilization")} value={fmt.num(machine.utilization, 1)} unit="%" note={t("factory.f.utilizationHint")} ratio={machine.utilization / 100} />
        </div>
      </Section>

      <Section title={t("common.details")}>
        <dl className="divide-y divide-line/60">
          <Row label={t("factory.f.machineId")}>
            <Code>{machine.id}</Code>
          </Row>
          <Row label={t("common.line")}>
            {line ? (
              <button type="button" onClick={() => onSelect({ type: "zone", id: line.id })} title={t("factory.link.showZone")} className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-ink underline decoration-line-2 decoration-dotted underline-offset-[3px] hover:text-forge-text">
                <Code>{line.code}</Code>
                <span className="truncate">{tl(line.name)}</span>
              </button>
            ) : (
              t("common.notAvailable")
            )}
          </Row>
          <Row label={t("common.status")}>{td(`mstatus.${machine.status}`)}</Row>
          <Row label={t("common.location")}>{tl(machine.location)}</Row>
          <Row label={t("factory.f.currentWo")}>
            {order ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
                <EntityLink entity={{ type: "workOrder", id: order.id }} />
                <span className="num text-[11.5px] text-ink-3">
                  {t("factory.f.woProgress", { done: fmt.num(order.completedQty), total: fmt.num(order.plannedQty) })} · {fmt.pct(woProgress(order), 0)}
                </span>
              </span>
            ) : (
              <span className="text-ink-3">{t("factory.f.noWo")}</span>
            )}
          </Row>
          <Row label={t("factory.f.lastMaint")}>
            <span className="num">{fmt.date(machine.lastMaintenance)}</span>
          </Row>
          <Row label={t("factory.f.nextMaint")}>
            <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              {overdue && (
                <Badge tone="danger" dot>
                  {t("factory.f.overdue")}
                </Badge>
              )}
              <span className={cn("num", overdue && "text-danger")}>{fmt.date(machine.nextMaintenance)}</span>
              <span className="num text-[11.5px] text-ink-3">{fmt.relative(machine.nextMaintenance, now)}</span>
            </span>
          </Row>
        </dl>
      </Section>

      <Section title={t("factory.events.title")}>
        <EventList events={events} />
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        <RecordLink href={entityHref({ type: "machine", id: machine.id })}>{t("factory.link.equipment")}</RecordLink>
        <RecordLink href={entityHref({ type: "line", id: machine.lineId })}>{t("factory.link.line")}</RecordLink>
        <Guard cap="machine.control">
          <Menu
            label={t("common.changeStatus")}
            align="start"
            trigger={(p) => (
              <Button icon={SlidersHorizontal} {...p}>
                {t("common.changeStatus")}
              </Button>
            )}
            items={STATUS_ORDER.map((status: MachineStatus) => ({
              label: td(`mstatus.${status}`),
              checked: machine.status === status,
              onSelect: () => {
                if (status !== machine.status) run(setMachineStatus(machine.id, status), t("factory.statusChanged", { id: machine.id, status: td(`mstatus.${status}`) }));
              },
            }))}
          />
        </Guard>
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">{t("factory.noticeBody")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Production zone                                                     */
/* ------------------------------------------------------------------ */

function MachineRow({ machine, onSelect }: { machine: Machine; onSelect: (s: Selection) => void }) {
  const { td, tl } = useT();
  return (
    <button type="button" onClick={() => onSelect({ type: "machine", id: machine.id })} className="flex min-h-[40px] w-full items-center gap-2.5 px-2.5 py-1.5 text-start transition-colors hover:bg-raised">
      <StatusGlyph status={machine.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{tl(machine.name)}</span>
        <Code className="text-[11px] text-ink-3">{machine.id}</Code>
      </span>
      <span className="shrink-0 text-[11.5px] text-ink-2">{td(`mstatus.${machine.status}`)}</span>
    </button>
  );
}

export function ZoneDetail({ line, onSelect }: { line: ProductionLine; onSelect: (s: Selection) => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const now = useForge((s) => s.now);
  const machines = useForge((s) => s.machines);
  const workOrders = useForge((s) => s.workOrders);

  const live = lineLive(line, now);
  const lineMachines = useMemo(() => machines.filter((m) => m.lineId === line.id).sort((a, b) => a.station - b.station), [machines, line.id]);
  const order = useMemo(() => workOrders.find((o) => o.lineId === line.id && o.status === "in_progress"), [workOrders, line.id]);
  const product = lookup.product(line.productId);
  const behind = live.attainment < 0.9;

  const match = useMemo(() => {
    const ids = new Set(lineMachines.map((m) => m.id));
    return (ev: ActivityEvent) => !!ev.entity && ((ev.entity.type === "line" && ev.entity.id === line.id) || (ev.entity.type === "machine" && ids.has(ev.entity.id)));
  }, [lineMachines, line.id]);
  const events = useRecentEvents(match);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="line" value={line.status} />
        <Code className="text-ink-2">{line.code}</Code>
        {product && <span className="min-w-0 truncate text-[12px] text-ink-3">{tl(product.name)}</span>}
      </div>

      <Section title={t("factory.zone.shiftOutput")} aside={<SimBadge label={t("common.simulated")} />} className="border-t-0 pt-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="display num text-[26px] text-ink">{fmt.num(live.output)}</span>
          <span className="num text-[12px] text-ink-3">{t("factory.zone.ofTarget", { output: fmt.num(live.output), target: fmt.num(live.target) })}</span>
        </div>
        <Progress value={live.target > 0 ? live.output / live.target : 0} marker={live.target > 0 ? live.expected / live.target : undefined} tone={behind ? "warn" : "ok"} label={t("factory.zone.shiftOutput")} thick className="mt-2" />
        <p className="num mt-2 text-[11.5px] text-ink-3">{t("factory.zone.expected", { n: fmt.num(Math.round(live.expected)) })}</p>
        <dl className="mt-2 divide-y divide-line/60">
          <Row label={t("factory.zone.attainment")}>
            <span className={cn("num font-semibold", behind ? "text-amber" : "text-ok")}>{fmt.pct(live.attainment, 0)}</span>
          </Row>
          <Row label={t("factory.zone.rate")}>
            <span className="num">{fmt.num(live.rate, 1)}</span> <span className="text-ink-3">{t("common.perHour")}</span>
          </Row>
          <Row label={t("common.oee")}>
            <span className="num">{fmt.pct(live.oee)}</span>
          </Row>
          <Row label={t("common.product")}>{product ? tl(product.name) : t("common.notAvailable")}</Row>
          <Row label={t("factory.f.currentWo")}>{order ? <EntityLink entity={{ type: "workOrder", id: order.id }} /> : <span className="text-ink-3">{t("factory.f.noWo")}</span>}</Row>
        </dl>
      </Section>

      <Section title={t("factory.zone.machines")}>
        <div className="divide-y divide-line/60 overflow-hidden rounded-md border border-line">
          {lineMachines.map((m) => (
            <MachineRow key={m.id} machine={m} onSelect={onSelect} />
          ))}
        </div>
      </Section>

      <Section title={t("factory.events.title")}>
        <EventList events={events} />
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        <RecordLink href={entityHref({ type: "line", id: line.id })}>{t("factory.link.line")}</RecordLink>
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-3">{t("factory.noticeBody")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plant summary (nothing selected)                                    */
/* ------------------------------------------------------------------ */

export function PlantSummary({
  factory,
  lines,
  machines,
  layout,
  usage,
  mode,
  onSelect,
}: {
  factory: Factory;
  lines: ProductionLine[];
  machines: Machine[];
  layout: FactoryLayout;
  usage: Map<ID, ZoneUsage>;
  mode: ViewMode;
  onSelect: (s: Selection) => void;
}) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const running = machines.filter((m) => m.status === "running").length;
  const trucks = layout.warehouses.reduce((s, wh) => s + wh.trucks.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-ink">{t("factory.panel.empty")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("factory.panel.emptyHint")}</p>
      </div>

      <Section title={t("factory.summary.lines")} aside={<span className="num text-[11.5px] text-ink-3">{t("factory.summary.running", { n: running, total: machines.length })}</span>}>
        <div className="divide-y divide-line/60 overflow-hidden rounded-md border border-line">
          {lines.map((line) => {
            const live = lineLive(line, now);
            return (
              <button key={line.id} type="button" onClick={() => onSelect({ type: "zone", id: line.id })} className="block w-full px-2.5 py-2 text-start transition-colors hover:bg-raised">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Code className="text-ink-2">{line.code}</Code>
                    <span className="truncate text-[12.5px] text-ink">{tl(line.name)}</span>
                  </span>
                  <StatusBadge kind="line" value={line.status} />
                </span>
                <span className="mt-2 flex items-center gap-2.5">
                  <Progress value={live.target > 0 ? live.output / live.target : 0} marker={live.target > 0 ? live.expected / live.target : undefined} tone={LINE_TONE[line.status] === "ok" ? "ok" : "neutral"} label={t("factory.zone.shiftOutput")} />
                  <span className="num shrink-0 text-[11px] text-ink-3">
                    {fmt.num(live.output)} / {fmt.num(live.target)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={t("factory.summary.stores")} aside={<span className="num text-[11.5px] text-ink-3">{`${t("factory.summary.trucks")}: ${fmt.num(trucks)}`}</span>}>
        <div className="flex flex-col gap-3.5">
          {layout.warehouses.map((wh) => {
            const rows = wh.zones.map((slot) => ({ slot, u: usage.get(slot.zone.id) }));
            const used = rows.reduce((s, r) => s + (r.u?.used ?? 0), 0);
            const capacity = rows.reduce((s, r) => s + (r.u?.capacity ?? 0), 0);
            const occupancy = capacity > 0 ? used / capacity : 0;
            return (
              <div key={wh.warehouse.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <EntityLink entity={{ type: "warehouse", id: wh.warehouse.id }} className="min-w-0 truncate text-[12.5px]">
                    <Code className="text-ink-2">{wh.warehouse.code}</Code> {tl(wh.warehouse.name)}
                  </EntityLink>
                  <span className="num shrink-0 text-[12px] font-semibold text-ink">{fmt.pct(occupancy, 0)}</span>
                </div>
                <Progress value={occupancy} tone={occTone(occupancy)} label={tl(wh.warehouse.name)} className="mt-1.5" />
                <p className="num mt-1 text-[11px] text-ink-3">{t("factory.summary.pallets", { used: fmt.num(used), capacity: fmt.num(capacity) })}</p>
                {mode === "warehouse" && (
                  <ul className="mt-2 flex flex-col gap-1.5 border-s border-line ps-3">
                    {rows.map(({ slot, u }) => (
                      <li key={slot.zone.id} className="grid grid-cols-[44px_minmax(0,1fr)_38px] items-center gap-2">
                        <Code className="text-[11px] text-ink-2">{slot.zone.code}</Code>
                        <span className="min-w-0">
                          <span className="block truncate text-[11.5px] text-ink-2">{tl(slot.zone.name)}</span>
                          <Progress value={u?.occupancy ?? 0} tone={occTone(u?.occupancy ?? 0)} label={tl(slot.zone.name)} className="mt-1" />
                        </span>
                        <span className="num text-end text-[11.5px] text-ink">{fmt.pct(u?.occupancy ?? 0, 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">{tl(factory.name)}</span> · {t("factory.noticeBody")}
      </p>
    </div>
  );
}

function occTone(occupancy: number): Tone {
  return occupancy >= 0.9 ? "danger" : occupancy >= 0.75 ? "warn" : "ok";
}
