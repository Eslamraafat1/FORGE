"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { ID, WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { useAction } from "@/components/ui/toast";
import { useLookup } from "@/components/ui/page";
import { Code, EmptyState, Progress, cn } from "@/components/ui/primitives";
import {
  BAR_H,
  BIG_STEP,
  HEADER_W,
  LANE_H,
  ROW_PAD,
  SNAP,
  TRACK_MIN_W,
  daySegments,
  frac,
  isMovable,
  isStarted,
  rowHeight,
  shiftSegments,
  ticks as makeTicks,
  type BarLayout,
  type ColorMode,
  type Grouping,
  type LineLoad,
  type RowLayout,
  type TimeRange,
} from "./model";
import { PriorityMark, STATUS_COLOR, productColor } from "./parts";

interface Ghost {
  id: ID;
  start: number;
  end: number;
  lineId: ID | null;
}

interface DragSession {
  wo: WorkOrder;
  pointerId: number;
  x0: number;
  y0: number;
  trackW: number;
  el: HTMLElement;
  active: boolean;
  cancelled: boolean;
  next: Ghost | null;
}

type BarPointerHandler = (e: ReactPointerEvent<HTMLButtonElement>, wo: WorkOrder) => void;
type BarKeyHandler = (e: ReactKeyboardEvent<HTMLButtonElement>, wo: WorkOrder) => void;

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

interface BarProps {
  wo: WorkOrder;
  left: number;
  width: number;
  lane: number;
  clipStart: boolean;
  clipEnd: boolean;
  conflict: boolean;
  late: boolean;
  fill: number | null;
  color: string;
  sku: string;
  productName: string;
  lineCode: string;
  showLine: boolean;
  selected: boolean;
  dragging: boolean;
  draggable: boolean;
  onOpen: (id: ID) => void;
  onPointerDown: BarPointerHandler;
  onKeyDown: BarKeyHandler;
}

const Bar = memo(function Bar({ wo, left, width, lane, clipStart, clipEnd, conflict, late, fill, color, sku, productName, lineCode, showLine, selected, dragging, draggable, onOpen, onPointerDown, onKeyDown }: BarProps) {
  const { t, td } = useT();
  const fmt = useFmt();
  const done = wo.status === "completed";
  const paused = wo.status === "paused";
  const draft = wo.status === "draft";
  const status = td(`wostatus.${wo.status}`);
  const priority = td(`priority.${wo.priority}`);
  const flags = [conflict ? t("planning.flag.conflict") : "", late ? t("planning.flag.late") : ""].filter(Boolean).join(", ");
  const label = t("planning.bar.aria", {
    id: wo.id,
    product: productName,
    qty: fmt.num(wo.plannedQty),
    priority,
    status,
    line: lineCode,
    start: fmt.dateTime(wo.plannedStart),
    end: fmt.dateTime(wo.plannedEnd),
  });
  const tint = done ? 7 : draft ? 6 : 17;
  return (
    <button
      type="button"
      data-wo={wo.id}
      aria-label={flags ? `${label} — ${flags}` : label}
      aria-pressed={selected}
      title={`${wo.id} · ${productName} · ${fmt.num(wo.plannedQty)} · ${priority} · ${status}\n${fmt.dateTime(wo.plannedStart)} → ${fmt.dateTime(wo.plannedEnd)}${flags ? `\n${flags}` : ""}`}
      onClick={() => onOpen(wo.id)}
      onPointerDown={(e) => onPointerDown(e, wo)}
      onKeyDown={(e) => onKeyDown(e, wo)}
      className={cn(
        "@container absolute flex select-none flex-col justify-center gap-[3px] overflow-hidden rounded-sm border text-start transition-opacity duration-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forge",
        draggable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
        (draft || paused) && "border-dashed",
        selected ? "z-[5] outline-2 outline-offset-1 outline-forge" : conflict && "outline-1 outline-offset-1 outline-danger",
        dragging && "opacity-35",
        done ? "text-ink-3" : "text-ink",
      )}
      style={{
        insetInlineStart: `${left}%`,
        width: `${width}%`,
        minWidth: 8,
        top: ROW_PAD + lane * LANE_H,
        height: BAR_H,
        backgroundColor: `color-mix(in srgb, ${color} ${tint}%, var(--base))`,
        backgroundImage: paused ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 30%, transparent) 0 4px, transparent 4px 9px)` : undefined,
        borderColor: conflict ? "var(--danger)" : `color-mix(in srgb, ${color} ${done ? 30 : 60}%, var(--line))`,
      }}
    >
      {fill !== null && <span aria-hidden className="absolute inset-y-0 start-0" style={{ width: `${fill * 100}%`, background: `color-mix(in srgb, ${color} 34%, var(--base))`, borderInlineEnd: `1px solid ${color}` }} />}
      {!clipStart && <span aria-hidden className="absolute inset-y-0 start-0 w-[3px]" style={{ background: color, opacity: done ? 0.55 : 1 }} />}
      <span className="relative flex min-w-0 items-center gap-1 pe-1 ps-2 leading-none">
        {clipStart && <ChevronLeft aria-hidden className="-ms-1.5 size-3 shrink-0 text-ink-3 rtl:-scale-x-100" />}
        {conflict && <AlertTriangle aria-hidden className="size-3 shrink-0 text-danger" strokeWidth={2.4} />}
        {late && <Clock aria-hidden className="size-3 shrink-0 text-amber" strokeWidth={2.4} />}
        <Code className="text-[11px] font-semibold leading-none">{wo.id}</Code>
        <bdi className="hidden truncate font-mono text-[10.5px] text-ink-2 @min-[128px]:inline">{sku}</bdi>
        <span className="hidden truncate text-[10.5px] text-ink-3 @min-[300px]:inline">{status}</span>
        {clipEnd && <ChevronRight aria-hidden className="ms-auto size-3 shrink-0 text-ink-3 rtl:-scale-x-100" />}
      </span>
      <span className="relative hidden min-w-0 items-center gap-1.5 whitespace-nowrap pe-1 ps-2 text-[10.5px] leading-none text-ink-2 @min-[58px]:flex">
        <PriorityMark priority={wo.priority} />
        <span className="hidden @min-[150px]:inline">{priority}</span>
        <span className="num hidden @min-[92px]:inline">{fmt.num(wo.plannedQty)}</span>
        {showLine && <bdi className="hidden font-mono text-ink-3 @min-[200px]:inline">{lineCode}</bdi>}
        <span className="hidden truncate text-ink-3 @min-[360px]:inline">{productName}</span>
      </span>
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

interface RowProps {
  row: RowLayout;
  grouping: Grouping;
  colorMode: ColorMode;
  load: LineLoad | undefined;
  range: TimeRange;
  selectedId: ID | null;
  ghost: Ghost | null;
  draggingId: ID | null;
  canManage: boolean;
  onOpen: (id: ID) => void;
  onPointerDown: BarPointerHandler;
  onKeyDown: BarKeyHandler;
}

const GanttRow = memo(function GanttRow({ row, grouping, colorMode, load, range, selectedId, ghost, draggingId, canManage, onOpen, onPointerDown, onKeyDown }: RowProps) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const line = look.line(row.lineId);
  const single = grouping === "order" ? row.bars[0]?.wo : undefined;
  const ratio = load?.ratio ?? 0;
  const over = ratio > 1.0001;
  const height = rowHeight(row.lanes);

  let ghostBox: { left: number; width: number } | null = null;
  if (ghost) {
    const a = Math.max(0, frac(range, ghost.start));
    const b = Math.min(1, frac(range, ghost.end));
    if (b > a) ghostBox = { left: a * 100, width: (b - a) * 100 };
  }

  return (
    <div role="row" className="flex border-b border-line last:border-b-0">
      <div role="rowheader" className="sticky start-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-e border-line bg-base px-3 py-1.5" style={{ width: HEADER_W, minHeight: height }}>
        {single ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Code className="font-semibold text-ink">{single.id}</Code>
              <bdi className="rounded-sm border border-line-2 px-1 font-mono text-[10.5px] text-ink-2">{line?.code ?? "—"}</bdi>
            </div>
            <div className="truncate text-[11px] text-ink-3">{look.product(single.productId) ? tl(look.product(single.productId)!.name) : "—"}</div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Code className="font-semibold text-ink">{line?.code ?? row.key}</Code>
              <span
                className={cn("num inline-flex items-center gap-1 text-[11px] font-semibold", over ? "text-danger" : "text-ink-2")}
                title={t("planning.capacity.rowTitle", { scheduled: fmt.num(load?.scheduledH ?? 0, 1), available: fmt.num(load?.availableH ?? 0) })}
              >
                {over && <AlertTriangle aria-hidden className="size-3" strokeWidth={2.4} />}
                {fmt.pct(ratio, 0)}
              </span>
            </div>
            <div className="truncate text-[11.5px] text-ink-2">{line ? tl(line.name) : ""}</div>
            <Progress
              value={ratio}
              tone={over ? "danger" : ratio >= 0.85 ? "warn" : "info"}
              label={t("planning.capacity.meter", { line: line?.code ?? row.key, pct: fmt.pct(ratio, 0) })}
              className="h-1"
            />
          </>
        )}
      </div>
      <div role="gridcell" data-track data-row-line={grouping === "line" ? (row.lineId ?? undefined) : undefined} className="relative z-10 min-w-0 flex-1" style={{ height }}>
        {row.bars.map((b: BarLayout) => {
          const product = look.product(b.wo.productId);
          return (
            <Bar
              key={b.wo.id}
              wo={b.wo}
              left={b.left}
              width={b.width}
              lane={b.lane}
              clipStart={b.clipStart}
              clipEnd={b.clipEnd}
              conflict={b.conflict}
              late={b.late}
              fill={b.fill}
              color={colorMode === "status" ? STATUS_COLOR[b.wo.status] : productColor(b.wo.productId)}
              sku={product?.sku ?? b.wo.productId}
              productName={product ? tl(product.name) : b.wo.productId}
              lineCode={look.line(b.wo.lineId)?.code ?? "—"}
              showLine={grouping === "order"}
              selected={selectedId === b.wo.id}
              dragging={draggingId === b.wo.id}
              draggable={canManage && isMovable(b.wo)}
              onOpen={onOpen}
              onPointerDown={onPointerDown}
              onKeyDown={onKeyDown}
            />
          );
        })}
        {ghost && ghostBox && (
          <div aria-hidden className="pointer-events-none absolute z-20 rounded-sm border-2 border-forge bg-forge/15" style={{ insetInlineStart: `${ghostBox.left}%`, width: `${ghostBox.width}%`, minWidth: 8, top: ROW_PAD, height: BAR_H }}>
            <span className="num absolute -top-0.5 start-0 -translate-y-full whitespace-nowrap rounded-sm bg-forge px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-forge-ink">
              <bdi>{ghost.id}</bdi> · {fmt.dateTime(ghost.start)} → {fmt.dateTime(ghost.end)}
              {grouping === "line" && ghost.lineId ? (
                <>
                  {" · "}
                  <bdi>{look.line(ghost.lineId)?.code ?? ghost.lineId}</bdi>
                </>
              ) : null}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Now marker — subscribes to the clock on its own                     */
/* ------------------------------------------------------------------ */

function NowLine({ range, tag }: { range: TimeRange; tag?: boolean }) {
  const { t } = useT();
  const now = useForge((s) => s.now);
  const f = frac(range, now);
  if (f < 0 || f > 1) return null;
  return tag ? (
    <span className="absolute bottom-0 z-10 -translate-x-1/2 rounded-t-sm bg-ink px-1 text-[9.5px] font-semibold uppercase leading-[14px] rtl:translate-x-1/2" style={{ insetInlineStart: `${f * 100}%`, color: "var(--base)" }}>
      {t("common.now")}
    </span>
  ) : (
    <span aria-hidden className="absolute inset-y-0 w-px bg-ink" style={{ insetInlineStart: `${f * 100}%` }} />
  );
}

/* ------------------------------------------------------------------ */
/* Gantt                                                               */
/* ------------------------------------------------------------------ */

export interface GanttProps {
  range: TimeRange;
  today: number;
  grouping: Grouping;
  colorMode: ColorMode;
  rows: RowLayout[];
  lineIds: ID[];
  loads: Map<ID, LineLoad>;
  selectedId: ID | null;
  canManage: boolean;
  onOpen: (id: ID) => void;
  announce: (text: string) => void;
}

export function Gantt({ range, today, grouping, colorMode, rows, lineIds, loads, selectedId, canManage, onOpen, announce }: GanttProps) {
  const { t, td, tl, rtl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const shifts = useForge((s) => s.shifts);
  const scheduleWorkOrder = useForge((s) => s.scheduleWorkOrder);
  const run = useAction();
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const bodyRef = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const axis = useMemo(() => ({ ticks: makeTicks(range), shifts: shiftSegments(range), days: daySegments(range) }), [range]);
  const scale = range.scale;

  /** Write a new window / line to the store and announce it. */
  const commit = useCallback(
    (wo: WorkOrder, start: number, end: number, lineId: ID | null): boolean => {
      if (!lineId) return false;
      if (start === wo.plannedStart && end === wo.plannedEnd && lineId === wo.lineId) return false;
      const okay = runRef.current(scheduleWorkOrder(wo.id, { lineId, plannedStart: start, plannedEnd: end }));
      if (okay) {
        announce(
          lineId !== wo.lineId
            ? t("planning.announce.movedLine", { id: wo.id, line: lineId, start: fmt.dateTime(start), end: fmt.dateTime(end) })
            : t("planning.announce.moved", { id: wo.id, start: fmt.dateTime(start), end: fmt.dateTime(end) }),
        );
      }
      return okay;
    },
    [announce, fmt, scheduleWorkOrder, t],
  );

  const handleOpen = useCallback(
    (id: ID) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      onOpen(id);
    },
    [onOpen],
  );

  const handlePointerDown = useCallback<BarPointerHandler>(
    (e, wo) => {
      if (!canManage || e.button !== 0 || !isMovable(wo)) return;
      const track = e.currentTarget.closest<HTMLElement>("[data-track]");
      if (!track) return;
      session.current = { wo, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, trackW: track.getBoundingClientRect().width, el: e.currentTarget, active: false, cancelled: false, next: null };
    },
    [canManage],
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = session.current;
    if (!d || d.cancelled || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.active) {
      if (Math.abs(dx) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
      d.active = true;
      try {
        d.el.setPointerCapture(d.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    const snap = SNAP[scale];
    const dMs = (dx / Math.max(1, d.trackW)) * range.span * (rtl ? -1 : 1);
    const start = range.start + Math.round((d.wo.plannedStart + dMs - range.start) / snap) * snap;
    let lineId = d.wo.lineId;
    if (grouping === "line" && !isStarted(d.wo) && bodyRef.current) {
      for (const el of bodyRef.current.querySelectorAll<HTMLElement>("[data-row-line]")) {
        const r = el.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          lineId = el.dataset.rowLine ?? lineId;
          break;
        }
      }
    }
    const next: Ghost = { id: d.wo.id, start, end: start + (d.wo.plannedEnd - d.wo.plannedStart), lineId };
    d.next = next;
    setGhost((prev) => (prev && prev.start === next.start && prev.lineId === next.lineId ? prev : next));
  };

  const endDrag = (commitIt: boolean) => {
    const d = session.current;
    if (!d) return;
    session.current = null;
    if (!d.active) return;
    // The click that follows a drag must not open the details panel.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    setGhost(null);
    if (commitIt && !d.cancelled && d.next) commit(d.wo, d.next.start, d.next.end, d.next.lineId);
  };

  const dragging = ghost !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const d = session.current;
      if (!d) return;
      e.preventDefault();
      d.cancelled = true;
      d.next = null;
      setGhost(null);
      announce(t("planning.announce.cancelled", { id: d.wo.id }));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging, announce, t]);

  const handleKeyDown = useCallback<BarKeyHandler>(
    (e, wo) => {
      const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
      const vertical = (e.key === "ArrowUp" || e.key === "ArrowDown") && grouping === "line";
      if (!horizontal && !vertical) return;
      e.preventDefault();
      if (!canManage) {
        announce(t("common.readOnly"));
        return;
      }
      if (!isMovable(wo)) {
        announce(t("planning.announce.closed", { id: wo.id }));
        return;
      }
      let moved = false;
      if (horizontal) {
        const dir = (e.key === "ArrowRight") !== rtl ? 1 : -1;
        const step = (e.shiftKey ? BIG_STEP[scale] : SNAP[scale]) * dir;
        moved = commit(wo, wo.plannedStart + step, wo.plannedEnd + step, wo.lineId);
      } else {
        if (isStarted(wo)) {
          announce(t("planning.announce.lineLocked", { id: wo.id }));
          return;
        }
        const idx = lineIds.indexOf(wo.lineId ?? "");
        const target = lineIds[idx + (e.key === "ArrowDown" ? 1 : -1)];
        if (idx === -1 || !target) return;
        moved = commit(wo, wo.plannedStart, wo.plannedEnd, target);
      }
      if (moved) {
        // The bar may re-mount in another row: keep keyboard focus on it.
        const id = wo.id;
        window.setTimeout(() => bodyRef.current?.querySelector<HTMLElement>(`[data-wo="${id}"]`)?.focus({ preventScroll: true }), 40);
      }
    },
    [announce, canManage, commit, grouping, lineIds, rtl, scale, t],
  );

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const groupLabel = grouping === "line" ? t("common.line") : t("common.workOrder");

  return (
    <div className="overflow-x-auto" role="grid" aria-label={t("planning.gantt.label")} aria-readonly={!canManage}>
      <div className="relative" style={{ minWidth: HEADER_W + TRACK_MIN_W[scale] }}>
        {/* Axis */}
        <div role="row" className="flex border-b border-line-2">
          <div role="columnheader" className="sticky start-0 z-30 flex shrink-0 flex-col justify-end gap-0.5 border-e border-line bg-base px-3 pb-1.5" style={{ width: HEADER_W }}>
            <span className="label">{groupLabel}</span>
            {grouping === "line" && <span className="text-[10.5px] text-ink-3">{t("planning.capacity.short")}</span>}
          </div>
          <div role="columnheader" aria-label={t("planning.axis.label", { from: fmt.dateTime(range.start), to: fmt.dateTime(range.end) })} className="relative min-w-0 flex-1">
            <div className="relative h-8">
              {scale === "day"
                ? axis.shifts.map((s) => {
                    const shift = shiftById.get(s.id);
                    const sup = shift ? look.member(shift.supervisorId) : undefined;
                    return (
                      <div key={s.key} className="absolute inset-y-0 flex min-w-0 flex-col justify-center overflow-hidden border-s border-line px-2 first:border-s-0" style={{ insetInlineStart: `${s.left}%`, width: `${s.width}%` }}>
                        <span className="truncate text-[11.5px] font-semibold leading-tight text-ink">{shift ? tl(shift.name) : s.id}</span>
                        <span className="truncate text-[10.5px] leading-tight text-ink-3">{sup ? tl(sup.name) : t("common.unassigned")}</span>
                      </div>
                    );
                  })
                : axis.days.map((d) => (
                    <div key={d.key} className="absolute inset-y-0 flex min-w-0 items-center gap-1.5 overflow-hidden border-s border-line-2 px-2 first:border-s-0" style={{ insetInlineStart: `${d.left}%`, width: `${d.width}%` }}>
                      {d.start === today && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ink" />}
                      <span className={cn("truncate text-[11.5px]", d.start === today ? "font-semibold text-ink" : "text-ink-2")}>
                        {fmt.weekday(d.start)} <span className="num">{fmt.dateShort(d.start)}</span>
                      </span>
                      {d.start === today && <span className="sr-only">({t("common.today")})</span>}
                    </div>
                  ))}
            </div>
            <div className="relative h-[22px] border-t border-line">
              {scale === "day"
                ? axis.ticks.slice(0, -1).map((tk) => (
                    <span key={tk.ts} className={cn("num absolute inset-y-0 flex items-center border-s ps-1 font-mono text-[10px]", tk.major ? "border-line-2 text-ink-2" : "border-line text-ink-3")} style={{ insetInlineStart: `${tk.left}%` }}>
                      {fmt.time(tk.ts)}
                    </span>
                  ))
                : axis.shifts.map((s) => (
                    <span key={s.key} className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-s border-line font-mono text-[10px] text-ink-3" style={{ insetInlineStart: `${s.left}%`, width: `${s.width}%` }} title={shiftById.get(s.id) ? tl(shiftById.get(s.id)!.name) : s.id}>
                      {td(`planning.shiftShort.${s.id}`)}
                    </span>
                  ))}
              <NowLine range={range} tag />
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="relative" onPointerMove={onPointerMove} onPointerUp={() => endDrag(true)} onPointerCancel={() => endDrag(false)}>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 z-0" style={{ insetInlineStart: HEADER_W }}>
            {axis.shifts.map((s) => (s.id === "C" ? <span key={s.key} className="absolute inset-y-0 bg-ink/[0.035]" style={{ insetInlineStart: `${s.left}%`, width: `${s.width}%` }} /> : null))}
            {axis.ticks.map((tk) => (
              <span key={tk.ts} className={cn("absolute inset-y-0 w-px", tk.major ? "bg-line-2/70" : "bg-line/60")} style={{ insetInlineStart: `${tk.left}%` }} />
            ))}
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title={t("planning.empty.title")} hint={t("planning.empty.hint")} className="relative z-10" />
          ) : (
            rows.map((row) => (
              <GanttRow
                key={row.key}
                row={row}
                grouping={grouping}
                colorMode={colorMode}
                load={row.lineId ? loads.get(row.lineId) : undefined}
                range={range}
                selectedId={selectedId}
                ghost={ghost && (grouping === "line" ? ghost.lineId === row.lineId : row.bars[0]?.wo.id === ghost.id) ? ghost : null}
                draggingId={ghost?.id ?? null}
                canManage={canManage}
                onOpen={handleOpen}
                onPointerDown={handlePointerDown}
                onKeyDown={handleKeyDown}
              />
            ))
          )}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 z-[15]" style={{ insetInlineStart: HEADER_W }}>
            <NowLine range={range} />
          </div>
        </div>
      </div>
    </div>
  );
}
