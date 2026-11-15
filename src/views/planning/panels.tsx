"use client";
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Inbox, Wand2 } from "lucide-react";
import type { ID, ProductionLine, ProductionShift, WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { MIN } from "@/lib/time";
import { useLookup } from "@/components/ui/page";
import { Badge, Button, Code, EmptyState, LegendItem, Panel, Progress } from "@/components/ui/primitives";
import type { ColorMode, Conflict, LineLoad } from "./model";
import { PriorityLabel, PriorityMark, STATUS_COLOR, TIMELINE_STATUSES, productColor } from "./parts";

/* ------------------------------------------------------------------ */
/* Resource conflicts                                                  */
/* ------------------------------------------------------------------ */

export function ConflictsPanel({
  conflicts,
  late,
  canManage,
  onResolve,
  onOpen,
  onShow,
}: {
  conflicts: Conflict[];
  late: WorkOrder[];
  canManage: boolean;
  onResolve: (c: Conflict) => void;
  onOpen: (id: ID) => void;
  /** Jump the timeline to a moment. */
  onShow: (ts: number) => void;
}) {
  const { t } = useT();
  const fmt = useFmt();
  return (
    <Panel
      title={t("planning.conflicts.title")}
      subtitle={t("planning.conflicts.subtitle")}
      actions={conflicts.length > 0 ? <Badge tone="danger" icon={AlertTriangle}>{fmt.num(conflicts.length)}</Badge> : <Badge tone="ok" icon={CheckCircle2}>{t("planning.conflicts.clear")}</Badge>}
      flush
    >
      {conflicts.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={t("planning.conflicts.empty")} hint={t("planning.conflicts.emptyHint")} className="py-7" />
      ) : (
        <ul className="divide-y divide-line">
          {conflicts.map((c) => (
            <li key={c.key} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AlertTriangle aria-hidden className="size-3.5 shrink-0 text-danger" />
                <bdi className="rounded-sm border border-line-2 px-1 font-mono text-[11px] text-ink-2">{c.lineId}</bdi>
                <OrderChip wo={c.a} onOpen={onOpen} />
                <span className="text-[11.5px] text-ink-3">{t("planning.conflicts.overlaps")}</span>
                <OrderChip wo={c.b} onOpen={onOpen} />
              </div>
              <p className="num text-[12px] text-ink-2">
                {t("planning.conflicts.window", { from: fmt.dateTime(c.from), to: fmt.dateTime(c.to), duration: fmt.duration((c.to - c.from) / MIN) })}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 basis-52 text-[12px] text-ink-3">{t("planning.conflicts.suggestion", { move: c.move.id, keep: c.keep.id, time: fmt.dateTime(c.newStart) })}</p>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => onShow(c.from)}>
                    {t("planning.conflicts.show")}
                  </Button>
                  {canManage && (
                    <Button size="sm" icon={Wand2} onClick={() => onResolve(c)} aria-label={t("planning.conflicts.resolveAria", { move: c.move.id, keep: c.keep.id })}>
                      {t("planning.conflicts.resolve")}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {late.length > 0 && (
        <div className="border-t border-line">
          <h3 className="label flex items-center gap-1.5 px-4 pb-1 pt-3">
            <Clock aria-hidden className="size-3 text-amber" />
            {t("planning.late.title")}
          </h3>
          <ul className="divide-y divide-line">
            {late.map((wo) => (
              <li key={wo.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                <OrderChip wo={wo} onOpen={onOpen} />
                <span className="num text-[12px] text-ink-2">{t("planning.late.detail", { by: fmt.duration((wo.plannedEnd - wo.dueDate) / MIN), due: fmt.dateTime(wo.dueDate) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function OrderChip({ wo, onOpen }: { wo: WorkOrder; onOpen: (id: ID) => void }) {
  const { td } = useT();
  return (
    <button type="button" onClick={() => onOpen(wo.id)} className="inline-flex min-h-[26px] items-center gap-1.5 rounded-sm border border-line bg-raised px-1.5 text-[12px] hover:border-line-2">
      <Code className="font-semibold text-ink">{wo.id}</Code>
      <PriorityMark priority={wo.priority} />
      <span className="text-[11px] text-ink-2">{td(`priority.${wo.priority}`)}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Unscheduled tray                                                    */
/* ------------------------------------------------------------------ */

export function UnscheduledTray({ orders, canManage, onOpen, onSchedule }: { orders: WorkOrder[]; canManage: boolean; onOpen: (id: ID) => void; onSchedule: (id: ID) => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  return (
    <Panel title={t("planning.unscheduled.title")} subtitle={t("planning.unscheduled.subtitle")} actions={<Badge tone={orders.length > 0 ? "warn" : "neutral"}>{fmt.num(orders.length)}</Badge>} flush>
      {orders.length === 0 ? (
        <EmptyState icon={Inbox} title={t("planning.unscheduled.empty")} hint={t("planning.unscheduled.emptyHint")} className="py-7" />
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((wo) => {
            const product = look.product(wo.productId);
            return (
              <li key={wo.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
                <button type="button" onClick={() => onOpen(wo.id)} className="min-w-0 flex-1 basis-56 rounded-sm text-start">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Code className="font-semibold text-ink">{wo.id}</Code>
                    <span className="truncate text-[12.5px] text-ink">{product ? tl(product.name) : wo.productId}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-2">
                    <span className="num">
                      {fmt.num(wo.plannedQty)} {t("common.units")}
                    </span>
                    <PriorityLabel priority={wo.priority} />
                    <span className="num text-ink-3">
                      {t("common.due")}: {fmt.dateTime(wo.dueDate)}
                    </span>
                  </span>
                </button>
                {canManage && (
                  <Button size="sm" icon={CalendarPlus} onClick={() => onSchedule(wo.id)} aria-label={t("planning.unscheduled.scheduleAria", { id: wo.id })}>
                    {t("planning.action.schedule")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Capacity list (agenda layout)                                       */
/* ------------------------------------------------------------------ */

export function CapacityPanel({ lines, loads, overall }: { lines: ProductionLine[]; loads: Map<ID, LineLoad>; overall: number }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  return (
    <Panel title={t("planning.capacity.title")} subtitle={t("planning.capacity.formula")} actions={<span className="num text-[12px] font-semibold text-ink">{fmt.pct(overall, 0)}</span>}>
      <ul className="flex flex-col gap-3">
        {lines.map((l) => {
          const load = loads.get(l.id);
          const ratio = load?.ratio ?? 0;
          const over = ratio > 1.0001;
          return (
            <li key={l.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate">
                  <Code className="font-semibold text-ink">{l.code}</Code> <span className="text-ink-2">{tl(l.name)}</span>
                </span>
                <span className={over ? "num inline-flex items-center gap-1 font-semibold text-danger" : "num font-semibold text-ink"}>
                  {over && <AlertTriangle aria-hidden className="size-3" />}
                  {fmt.pct(ratio, 0)}
                  <span className="ms-1.5 font-normal text-ink-3">
                    {fmt.num(load?.scheduledH ?? 0, 1)} / {fmt.num(load?.availableH ?? 0)} {t("common.hours")}
                  </span>
                </span>
              </div>
              <Progress value={ratio} tone={over ? "danger" : ratio >= 0.85 ? "warn" : "info"} label={t("planning.capacity.meter", { line: l.code, pct: fmt.pct(ratio, 0) })} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Legend, shift allocation and keyboard hint                          */
/* ------------------------------------------------------------------ */

export function PlannerLegend({ colorMode, productIds, shifts, showKeys, canManage }: { colorMode: ColorMode; productIds: ID[]; shifts: ProductionShift[]; showKeys: boolean; canManage: boolean }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const hour = (h: number) => fmt.num(h).padStart(2, fmt.num(0));
  return (
    <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="label me-1">{colorMode === "status" ? t("common.status") : t("common.product")}</span>
        {colorMode === "status"
          ? TIMELINE_STATUSES.map((s) => <LegendItem key={s} color={STATUS_COLOR[s]} label={td(`wostatus.${s}`)} />)
          : productIds.map((id) => <LegendItem key={id} color={productColor(id)} label={look.product(id)?.sku ?? id} />)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2">
        <span className="label me-1">{t("planning.legend.marks")}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-sm border border-danger outline-1 outline-offset-1 outline-danger" />
          <AlertTriangle aria-hidden className="size-3 text-danger" />
          {t("planning.flag.conflict")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden className="size-3 text-amber" />
          {t("planning.flag.late")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-sm border border-line-2" style={{ backgroundImage: "linear-gradient(90deg, color-mix(in srgb, var(--ok) 40%, transparent) 55%, transparent 55%)" }} />
          {t("planning.legend.progress")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-sm border border-dashed border-amber" style={{ backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--amber) 40%, transparent) 0 3px, transparent 3px 6px)" }} />
          {td("wostatus.paused")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-sm border border-dashed border-ink-3" />
          {td("wostatus.draft")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-px bg-ink" />
          {t("common.now")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ChevronLeft aria-hidden className="-me-1.5 size-3 text-ink-3 rtl:-scale-x-100" />
          <ChevronRight aria-hidden className="size-3 text-ink-3 rtl:-scale-x-100" />
          {t("planning.legend.clipped")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2">
        <span className="label me-1">{t("common.priority")}</span>
        {(["low", "medium", "high", "urgent"] as const).map((p) => (
          <PriorityLabel key={p} priority={p} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2">
        <span className="label me-1">{t("planning.legend.shifts")}</span>
        {shifts.map((s) => {
          const sup = look.member(s.supervisorId);
          return (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="font-semibold text-ink">{tl(s.name)}</span>
              <bdi className="num font-mono text-[11px] text-ink-3">
                {hour(s.startHour)}–{hour(s.endHour)}
              </bdi>
              <span>{sup ? tl(sup.name) : t("common.unassigned")}</span>
            </span>
          );
        })}
      </div>
      <p className="text-[11.5px] text-ink-3">{t("planning.capacity.formula")}</p>
      {showKeys && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-3">
          <span className="label">{t("planning.keys.title")}</span>
          {canManage ? (
            <>
              <Key k="← →" label={t("planning.keys.move")} />
              <Key k="Shift + ← →" label={t("planning.keys.moveBig")} />
              <Key k="↑ ↓" label={t("planning.keys.line")} />
              <Key k="Enter" label={t("planning.keys.open")} />
              <Key k="Esc" label={t("planning.keys.cancel")} />
              <span>{t("planning.keys.drag")}</span>
            </>
          ) : (
            <>
              <Key k="Enter" label={t("planning.keys.open")} />
              <span>{t("common.readOnly")}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd dir="ltr" className="rounded-sm border border-line-2 bg-raised px-1 font-mono text-[10.5px] text-ink-2">
        {k}
      </kbd>
      {label}
    </span>
  );
}
