"use client";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import type { ID, WorkOrder } from "@/domain/types";
import { woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useLookup } from "@/components/ui/page";
import { Code, EmptyState, Progress, cn } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { daySegments, isLate, isStarted, type ColorMode, type TimeRange } from "./model";
import { PriorityLabel, STATUS_COLOR, productColor } from "./parts";

interface DayGroup {
  key: string;
  start: number;
  count: number;
  lines: { lineId: ID; orders: WorkOrder[] }[];
}

/** Phone layout: the same schedule as a list grouped by day, then by line. */
export function Agenda({
  range,
  today,
  visible,
  lineIds,
  conflictIds,
  colorMode,
  selectedId,
  onOpen,
}: {
  range: TimeRange;
  today: number;
  visible: WorkOrder[];
  lineIds: ID[];
  conflictIds: Set<ID>;
  colorMode: ColorMode;
  selectedId: ID | null;
  onOpen: (id: ID) => void;
}) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();

  const days = useMemo<DayGroup[]>(
    () =>
      daySegments(range).map((d) => {
        const inDay = visible.filter((wo) => wo.plannedStart < d.end && wo.plannedEnd > d.start);
        const lines = lineIds
          .map((lineId) => ({ lineId, orders: inDay.filter((wo) => wo.lineId === lineId).sort((a, b) => a.plannedStart - b.plannedStart || a.id.localeCompare(b.id)) }))
          .filter((g) => g.orders.length > 0);
        return { key: d.key, start: d.start, count: inDay.length, lines };
      }),
    [range, visible, lineIds],
  );

  if (visible.length === 0) {
    return <EmptyState icon={CalendarClock} title={t("planning.empty.title")} hint={t("planning.empty.hint")} />;
  }

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={day.key} aria-label={fmt.date(day.start)} className="border-b border-line last:border-b-0">
          <header className="flex items-center justify-between gap-2 bg-canvas/50 px-4 py-2">
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              {day.start === today && <span aria-hidden className="size-1.5 rounded-full bg-ink" />}
              {fmt.weekday(day.start)} <span className="num">{fmt.dateShort(day.start)}</span>
              {day.start === today && <span className="font-normal text-ink-3">· {t("common.today")}</span>}
            </h3>
            <span className="num text-[11.5px] text-ink-3">{t("planning.agenda.count", { n: day.count })}</span>
          </header>
          {day.lines.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-ink-3">{t("planning.agenda.none")}</p>
          ) : (
            day.lines.map((group) => {
              const line = look.line(group.lineId);
              return (
                <div key={group.lineId} className="px-4 py-2.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-ink-2">
                    <Code className="font-semibold text-ink">{line?.code ?? group.lineId}</Code>
                    <span className="truncate">{line ? tl(line.name) : ""}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {group.orders.map((wo) => {
                      const product = look.product(wo.productId);
                      const color = colorMode === "status" ? STATUS_COLOR[wo.status] : productColor(wo.productId);
                      const conflict = conflictIds.has(wo.id);
                      const late = isLate(wo);
                      return (
                        <li key={wo.id}>
                          <button
                            type="button"
                            onClick={() => onOpen(wo.id)}
                            aria-pressed={selectedId === wo.id}
                            className={cn(
                              "relative flex w-full flex-col gap-1.5 overflow-hidden rounded-md border bg-raised py-2 pe-3 ps-4 text-start",
                              conflict ? "border-danger" : "border-line",
                              wo.status === "draft" && "border-dashed",
                              selectedId === wo.id && "outline-2 outline-offset-1 outline-forge",
                            )}
                          >
                            <span aria-hidden className="absolute inset-y-0 start-0 w-1" style={{ background: color }} />
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Code className="font-semibold text-ink">{wo.id}</Code>
                              <StatusBadge kind="wo" value={wo.status} />
                              {conflict && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
                                  <AlertTriangle aria-hidden className="size-3" />
                                  {t("planning.flag.conflict")}
                                </span>
                              )}
                              {late && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber">
                                  <Clock aria-hidden className="size-3" />
                                  {t("planning.flag.late")}
                                </span>
                              )}
                            </span>
                            <span className="truncate text-[12.5px] text-ink">{product ? tl(product.name) : wo.productId}</span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
                              <span className="num">
                                {fmt.dateTime(wo.plannedStart)} → {fmt.dateTime(wo.plannedEnd)}
                              </span>
                              <span className="num">
                                {fmt.num(wo.plannedQty)} {t("common.units")}
                              </span>
                              <PriorityLabel priority={wo.priority} />
                            </span>
                            {isStarted(wo) && <Progress value={woProgress(wo)} tone={wo.status === "paused" ? "warn" : "ok"} label={t("common.progress")} className="h-1" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}
