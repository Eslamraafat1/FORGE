"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, startOfDay } from "@/lib/time";
import { EmptyState, LegendItem, Panel, cn, toneVar } from "@/components/ui/primitives";
import { WO_TONE } from "@/components/ui/status";

const PAST_DAYS = 6;
const FUTURE_DAYS = 4;

interface Bar {
  wo: WorkOrder;
  start: number;
  end: number;
  lane: number;
}

/**
 * Horizontal production timeline for one line: recently completed orders on
 * their actual run window, open orders on their planned window.
 */
export function LineTimeline({ orders, now }: { orders: WorkOrder[]; now: number }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const from = startOfDay(now) - PAST_DAYS * DAY;
  const to = startOfDay(now) + (FUTURE_DAYS + 1) * DAY;
  const span = to - from;

  const { bars, lanes } = useMemo(() => {
    const raw = orders
      .filter((o) => o.status !== "cancelled" && o.status !== "draft")
      .map((o) => {
        const start = o.status === "scheduled" ? o.plannedStart : (o.startedAt ?? o.plannedStart);
        const end = o.status === "completed" ? (o.completedAt ?? o.plannedEnd) : o.status === "scheduled" ? o.plannedEnd : Math.max(o.plannedEnd, now);
        return { wo: o, start, end: Math.max(end, start + 1) };
      })
      .filter((b) => b.end > from && b.start < to)
      .sort((a, b) => a.start - b.start);
    // Greedy lane packing so overlapping windows stay readable.
    const laneEnds: number[] = [];
    const out: Bar[] = raw.map((b) => {
      let lane = laneEnds.findIndex((e) => e <= b.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = b.end;
      return { ...b, lane };
    });
    return { bars: out, lanes: Math.max(1, laneEnds.length) };
  }, [orders, now, from, to]);

  const days = Array.from({ length: PAST_DAYS + FUTURE_DAYS + 1 }, (_, i) => from + i * DAY);
  const pos = (ts: number) => `${(Math.max(0, Math.min(span, ts - from)) / span) * 100}%`;
  const statuses = ["completed", "in_progress", "paused", "scheduled"] as const;

  return (
    <Panel
      title={t("production.timeline.title")}
      subtitle={t("production.timeline.subtitle")}
      actions={
        <div className="flex flex-wrap items-center gap-x-2">
          {statuses.map((s) => (
            <LegendItem key={s} color={toneVar[WO_TONE[s]]} label={td(`wostatus.${s}`)} />
          ))}
        </div>
      }
    >
      {bars.length === 0 ? (
        <EmptyState title={t("production.timeline.empty")} hint={t("production.timeline.emptyHint")} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Day axis */}
            <div className="relative h-6 border-b border-line">
              {days.map((d) => (
                <span
                  key={d}
                  className={cn("num absolute top-0 border-s border-line ps-1.5 text-[11px] text-ink-3", d === startOfDay(now) && "font-semibold text-ink")}
                  style={{ insetInlineStart: pos(d), width: `${(DAY / span) * 100}%` }}
                >
                  {d === startOfDay(now) ? t("common.today") : fmt.dateShort(d)}
                </span>
              ))}
            </div>
            <div className="relative" style={{ height: lanes * 34 + 30 }}>
              {days.map((d) => (
                <span key={d} aria-hidden className="absolute inset-y-0 border-s border-line/60" style={{ insetInlineStart: pos(d) }} />
              ))}
              <ul>
                {bars.map((b) => {
                  const color = toneVar[WO_TONE[b.wo.status]];
                  const title = `${b.wo.id} · ${td(`wostatus.${b.wo.status}`)} · ${fmt.dateTime(b.start)} – ${fmt.dateTime(b.end)}`;
                  return (
                    <li key={b.wo.id}>
                      <Link
                        href={`/work-orders/${b.wo.id}`}
                        title={title}
                        aria-label={title}
                        className={cn(
                          "absolute flex h-[26px] items-center overflow-hidden rounded-sm border px-1.5 text-[11px] font-semibold text-ink hover:brightness-110",
                          b.wo.status === "scheduled" && "border-dashed",
                        )}
                        style={{
                          insetInlineStart: pos(b.start),
                          width: `max(10px, calc(${pos(b.end)} - ${pos(b.start)}))`,
                          top: 8 + b.lane * 34,
                          borderColor: color,
                          background: `color-mix(in srgb, ${color} ${b.wo.status === "scheduled" ? 12 : 26}%, transparent)`,
                        }}
                      >
                        <bdi className="code truncate text-[11px]">{b.wo.id}</bdi>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {/* Now marker */}
              <span aria-hidden className="absolute inset-y-0 w-px bg-forge" style={{ insetInlineStart: pos(now) }} />
              <span className="label absolute bottom-0 -translate-x-1/2 bg-base px-1 text-forge-text rtl:translate-x-1/2" style={{ insetInlineStart: pos(now) }}>
                {t("common.now")}
              </span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
