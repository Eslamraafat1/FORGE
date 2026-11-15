"use client";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Eye, Gauge as GaugeIcon, Inbox, ListOrdered, Rows3 } from "lucide-react";
import type { ID, WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { fromInput, startOfDay, toInputDate } from "@/lib/time";
import { useForge } from "@/store/store";
import { Guard, Kpi, KpiStrip, Page, PageHeader, useCan } from "@/components/ui/page";
import { Badge, Button, IconButton, Input, Segmented, SimBadge } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/toast";
import { Agenda } from "./Agenda";
import { Gantt } from "./Gantt";
import { OrderDrawer } from "./OrderPanel";
import { ScheduleModal } from "./ScheduleModal";
import { CapacityPanel, ConflictsPanel, PlannerLegend, UnscheduledTray } from "./panels";
import {
  addDays,
  capacity,
  conflictIdSet,
  findConflicts,
  isLate,
  isUnscheduled,
  layoutByLine,
  layoutByOrder,
  makeRange,
  visibleOrders,
  type ColorMode,
  type Conflict,
  type Grouping,
  type LineLoad,
  type Scale,
} from "./model";
import { useIsMobile } from "./parts";

export function PlanningView() {
  const { t } = useT();
  const fmt = useFmt();
  const workOrders = useForge((s) => s.workOrders);
  const lines = useForge((s) => s.lines);
  const shifts = useForge((s) => s.shifts);
  // Day granularity only: the view must not re-render on every simulation tick because of the clock.
  const today = useForge((s) => startOfDay(s.now));
  const scheduleWorkOrder = useForge((s) => s.scheduleWorkOrder);
  const canManage = useCan("planning.manage");
  const isMobile = useIsMobile();
  const run = useAction();

  const [scale, setScale] = useState<Scale>("week");
  const [grouping, setGrouping] = useState<Grouping>("line");
  const [colorMode, setColorMode] = useState<ColorMode>("status");
  /** First visible day; null follows the simulated "today". */
  const [anchor, setAnchor] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [scheduling, setScheduling] = useState<{ open: boolean; id: ID | null }>({ open: false, id: null });
  const [announcement, setAnnouncement] = useState("");

  const dayStart = anchor ?? today;
  const range = useMemo(() => makeRange(dayStart, scale), [dayStart, scale]);

  const lineKey = lines.map((l) => l.id).join("|");
  const lineIds = useMemo(() => (lineKey ? lineKey.split("|") : []), [lineKey]);

  const conflicts = useMemo(() => findConflicts(workOrders), [workOrders]);
  const conflictIds = useMemo(() => conflictIdSet(conflicts), [conflicts]);
  const visible = useMemo(() => visibleOrders(workOrders, range), [workOrders, range]);
  const rows = useMemo(
    () => (grouping === "line" ? layoutByLine(visible, lineIds, range, conflictIds) : layoutByOrder(visible, range, conflictIds)),
    [grouping, visible, lineIds, range, conflictIds],
  );
  const cap = useMemo(() => capacity(workOrders, lineIds.map((id) => ({ id })), range), [workOrders, lineIds, range]);
  const loads = useMemo(() => new Map<ID, LineLoad>(cap.lines.map((l) => [l.lineId, l])), [cap]);
  const unscheduled = useMemo(() => workOrders.filter(isUnscheduled), [workOrders]);
  const lateOrders = useMemo(() => workOrders.filter((wo) => isLate(wo) && !!wo.lineId).sort((a, b) => a.dueDate - b.dueDate), [workOrders]);
  const productIds = useMemo(() => [...new Set(visible.map((wo) => wo.productId))].sort(), [visible]);

  const selected = selectedId ? (workOrders.find((wo) => wo.id === selectedId) ?? null) : null;
  const selectedConflicts = useMemo(() => (selectedId ? conflicts.filter((c) => c.a.id === selectedId || c.b.id === selectedId) : []), [conflicts, selectedId]);

  const openOrder = useCallback((id: ID) => setSelectedId(id), []);
  const announce = useCallback((text: string) => setAnnouncement(text), []);

  const goTo = (ts: number) => {
    const day = startOfDay(ts);
    setAnchor(day === today ? null : day);
  };

  const showMoment = (ts: number) => {
    if (ts < range.start || ts >= range.end) goTo(ts);
    document.getElementById("planning-board")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const resolve = (c: Conflict) => {
    const okay = run(
      scheduleWorkOrder(c.move.id, { lineId: c.lineId, plannedStart: c.newStart, plannedEnd: c.newEnd }),
      t("planning.toast.resolved"),
      t("planning.toast.resolvedBody", { move: c.move.id, keep: c.keep.id, time: fmt.dateTime(c.newStart) }),
    );
    if (okay) announce(t("planning.announce.moved", { id: c.move.id, start: fmt.dateTime(c.newStart), end: fmt.dateTime(c.newEnd) }));
  };

  const onScheduled = (_wo: WorkOrder, start: number) => {
    if (start < range.start || start >= range.end) goTo(start);
  };

  const rangeLabel = scale === "day" ? `${fmt.weekday(range.start)} ${fmt.date(range.start)}` : `${fmt.dateShort(range.start)} – ${fmt.date(addDays(range.end, -1))}`;
  const overbooked = cap.lines.filter((l) => l.ratio > 1.0001).length;

  return (
    <Page>
      <PageHeader
        eyebrow={t("planning.eyebrow")}
        title={t("nav.planning")}
        subtitle={t("planning.subtitle")}
        meta={
          <>
            <SimBadge />
            {!canManage && (
              <Badge tone="neutral" icon={Eye}>
                {t("planning.readOnly")}
              </Badge>
            )}
          </>
        }
        actions={
          <Guard cap="planning.manage">
            <Button variant="primary" icon={CalendarPlus} onClick={() => setScheduling({ open: true, id: null })}>
              {t("planning.action.scheduleOrder")}
            </Button>
          </Guard>
        }
      />

      <KpiStrip columns={4}>
        <Kpi label={t("planning.kpi.scheduled")} value={visible.length} format={fmt.num} icon={CalendarClock} hint={t("planning.kpi.inRange")} />
        <Kpi
          label={t("planning.kpi.conflicts")}
          value={conflicts.length}
          format={fmt.num}
          icon={AlertTriangle}
          tone={conflicts.length > 0 ? "danger" : undefined}
          hint={conflicts.length > 0 ? t("planning.kpi.conflictsHint") : t("planning.conflicts.clear")}
        />
        <Kpi
          label={t("planning.kpi.utilization")}
          value={cap.overall}
          format={(n) => fmt.pct(n, 0)}
          icon={GaugeIcon}
          tone={cap.overall > 1 ? "danger" : undefined}
          hint={overbooked > 0 ? t("planning.kpi.overbooked", { n: overbooked }) : t("planning.kpi.utilizationHint", { scheduled: fmt.num(cap.scheduledH), available: fmt.num(cap.availableH) })}
        />
        <Kpi label={t("planning.kpi.unscheduled")} value={unscheduled.length} format={fmt.num} icon={Inbox} tone={unscheduled.length > 0 ? "warn" : undefined} hint={t("planning.kpi.unscheduledHint")} />
      </KpiStrip>

      <section id="planning-board" aria-label={t("planning.board.label")} className="panel min-w-0 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5">
              <IconButton icon={ChevronLeft} label={scale === "day" ? t("planning.nav.prevDay") : t("planning.nav.prevWeek")} onClick={() => goTo(addDays(dayStart, -range.days))} className="rtl:-scale-x-100" />
              <Button onClick={() => setAnchor(null)} aria-pressed={anchor === null}>
                {t("common.today")}
              </Button>
              <IconButton icon={ChevronRight} label={scale === "day" ? t("planning.nav.nextDay") : t("planning.nav.nextWeek")} onClick={() => goTo(addDays(dayStart, range.days))} className="rtl:-scale-x-100" />
            </div>
            <Input
              type="date"
              aria-label={t("planning.nav.pickDate")}
              value={toInputDate(dayStart)}
              onChange={(e) => {
                const ts = fromInput(e.target.value);
                if (Number.isFinite(ts)) goTo(ts);
              }}
              className="w-[150px]"
            />
            <span className="num text-[12.5px] font-semibold text-ink" aria-live="polite">
              {rangeLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t("planning.scale.label")}
              value={scale}
              onChange={setScale}
              options={[
                { value: "day", label: t("planning.scale.day") },
                { value: "week", label: t("planning.scale.week") },
              ]}
            />
            {!isMobile && (
              <Segmented
                label={t("planning.group.label")}
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: "line", label: t("planning.group.line"), icon: Rows3 },
                  { value: "order", label: t("planning.group.order"), icon: ListOrdered },
                ]}
              />
            )}
            <Segmented
              label={t("planning.color.label")}
              value={colorMode}
              onChange={setColorMode}
              options={[
                { value: "status", label: t("planning.color.status") },
                { value: "product", label: t("planning.color.product") },
              ]}
            />
          </div>
        </div>

        {isMobile ? (
          <Agenda range={range} today={today} visible={visible} lineIds={lineIds} conflictIds={conflictIds} colorMode={colorMode} selectedId={selectedId} onOpen={openOrder} />
        ) : (
          <Gantt
            range={range}
            today={today}
            grouping={grouping}
            colorMode={colorMode}
            rows={rows}
            lineIds={lineIds}
            loads={loads}
            selectedId={selectedId}
            canManage={canManage}
            onOpen={openOrder}
            announce={announce}
          />
        )}

        <PlannerLegend colorMode={colorMode} productIds={productIds} shifts={shifts} showKeys={!isMobile} canManage={canManage} />
      </section>

      {isMobile && <CapacityPanel lines={lines} loads={loads} overall={cap.overall} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <ConflictsPanel conflicts={conflicts} late={lateOrders} canManage={canManage} onResolve={resolve} onOpen={openOrder} onShow={showMoment} />
        <UnscheduledTray orders={unscheduled} canManage={canManage} onOpen={openOrder} onSchedule={(id) => setScheduling({ open: true, id })} />
      </div>

      <OrderDrawer wo={selected} conflicts={selectedConflicts} canManage={canManage} onClose={() => setSelectedId(null)} onResolve={resolve} announce={announce} />
      <ScheduleModal open={scheduling.open} initialId={scheduling.id} onClose={() => setScheduling((s) => ({ ...s, open: false }))} onScheduled={onScheduled} />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </Page>
  );
}
