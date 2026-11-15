"use client";
/**
 * Shared pieces for the Quality and Analytics views: enum orders with fixed
 * colours, quality helpers, chart helpers and the ranked-bars panel.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { BarChart3, Lightbulb, Table2 } from "lucide-react";
import type { Defect, DowntimeCause, InventoryCategory, QualityInspection } from "@/domain/types";
import { QUALITY_FAIL_RATE, QUALITY_WATCH_RATE } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { RankBars, SERIES, STATUS_COLOR } from "@/components/charts/kit";
import { Badge, EmptyState, IconButton, LegendItem, Panel, cn, toneBg, type Tone } from "@/components/ui/primitives";

/* ------------------------------------------------------------------ */
/* Enum orders — colour follows the entity, in this fixed order        */
/* ------------------------------------------------------------------ */

export const DEFECT_CATS = ["dimensional", "surface", "assembly", "material", "functional", "cosmetic"] as const;
export const CAUSES: readonly DowntimeCause[] = ["mechanical", "electrical", "changeover", "material", "quality", "planned"];
export const INV_CATS: readonly InventoryCategory[] = ["raw", "component", "wip", "finished", "packaging", "spare"];

export const defectColor = (c: string) => SERIES[Math.max(0, DEFECT_CATS.indexOf(c as (typeof DEFECT_CATS)[number])) % SERIES.length];
export const causeColor = (c: DowntimeCause) => SERIES[CAUSES.indexOf(c) % SERIES.length];
export const invCatColor = (c: InventoryCategory) => SERIES[INV_CATS.indexOf(c) % SERIES.length];

/* ------------------------------------------------------------------ */
/* Quality helpers                                                     */
/* ------------------------------------------------------------------ */

/** Same definition as `qualitySummary().openIssues` so every count agrees. */
export function isOpenIssue(q: QualityInspection): boolean {
  return q.correctiveAction?.status === "open" || (q.status === "failed" && !q.correctiveAction);
}

export type CaState = "open" | "overdue" | "resolved" | "required" | "none";

export function caState(q: QualityInspection, now: number): CaState {
  const ca = q.correctiveAction;
  if (!ca) return q.status === "failed" ? "required" : "none";
  if (ca.status === "resolved") return "resolved";
  return ca.dueDate < now ? "overdue" : "open";
}

const CA_TONE: Record<CaState, Tone> = { open: "warn", overdue: "danger", resolved: "ok", required: "danger", none: "neutral" };

export function CaBadge({ state }: { state: CaState }) {
  const { t } = useT();
  if (state === "none") return <span className="text-ink-3">{t("common.notAvailable")}</span>;
  return (
    <Badge tone={CA_TONE[state]} dot>
      {t(`quality.ca.state.${state}`)}
    </Badge>
  );
}

export function mainDefect(q: QualityInspection): Defect | null {
  let top: Defect | null = null;
  for (const d of q.defects) if (!top || d.qty > top.qty) top = d;
  return top;
}

export function rejectRate(q: Pick<QualityInspection, "inspectedQty" | "rejectedQty">): number {
  return q.inspectedQty > 0 ? q.rejectedQty / q.inspectedQty : 0;
}

export function rateTone(rate: number): Tone {
  return rate > QUALITY_FAIL_RATE ? "danger" : rate > QUALITY_WATCH_RATE ? "warn" : "ok";
}

/** Reject rate drawn against the two release limits (markers). */
export function LimitBar({ rate, className }: { rate: number; className?: string }) {
  const { t } = useT();
  const fmt = useFmt();
  const max = Math.max(0.06, rate * 1.15);
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className={className}>
      <div
        className="relative h-2.5 w-full rounded-[1px] bg-line/70"
        role="img"
        aria-label={t("quality.limitBar.aria", { rate: fmt.pct(rate, 2), watch: fmt.pct(QUALITY_WATCH_RATE), fail: fmt.pct(QUALITY_FAIL_RATE) })}
      >
        <div className={cn("h-full rounded-[1px] transition-[width] duration-300 ease-forge", toneBg[rateTone(rate)])} style={{ width: pos(rate) }} />
        <span aria-hidden className="absolute -top-1 h-[calc(100%+8px)] w-0.5 bg-amber" style={{ insetInlineStart: pos(QUALITY_WATCH_RATE) }} />
        <span aria-hidden className="absolute -top-1 h-[calc(100%+8px)] w-0.5 bg-danger" style={{ insetInlineStart: pos(QUALITY_FAIL_RATE) }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendItem shape="line" color={STATUS_COLOR.warn} label={t("quality.limit.watch")} value={fmt.pct(QUALITY_WATCH_RATE)} />
        <LegendItem shape="line" color={STATUS_COLOR.danger} label={t("quality.limit.fail")} value={fmt.pct(QUALITY_FAIL_RATE)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chart helpers                                                       */
/* ------------------------------------------------------------------ */

const NARROW = "(max-width: 639px)";
function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True on phone-width viewports (charts use fewer ticks and shorter labels). */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

/** Day labels for time axes: "Nov 12" on desktop, "12/11" on phones; full date for tooltips. */
export function useDayLabel() {
  const fmt = useFmt();
  const narrow = useNarrow();
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(fmt.locale, { day: "numeric", month: "numeric" });
    return {
      tick: (ts: number | string) => (narrow ? short.format(Number(ts)) : fmt.dateShort(Number(ts))),
      full: (ts: number | string) => `${fmt.weekday(Number(ts))} · ${fmt.date(Number(ts))}`,
    };
  }, [fmt, narrow]);
}

/** Series visibility for legends. The last visible series cannot be hidden. */
export function useSeriesToggle<K extends string>(keys: readonly K[]) {
  const [hidden, setHidden] = useState<ReadonlySet<K>>(() => new Set());
  const toggle = useCallback(
    (k: K) =>
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else if (keys.filter((x) => !next.has(x)).length > 1) next.add(k);
        return next;
      }),
    [keys],
  );
  return { hidden, toggle, isHidden: (k: K) => hidden.has(k) };
}

/** A one-line finding computed from the data shown above it. */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-2">
      <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export interface RankRow {
  key: string;
  label: ReactNode;
  /** Plain-text label for the table view. */
  text: string;
  value: number;
  color?: string;
  hint?: string;
}

/**
 * Ranked horizontal bars with the same chrome as a ChartPanel: title,
 * chart/table toggle, empty state and optional footer.
 */
export function RankPanel({
  title,
  subtitle,
  rows,
  formatValue,
  valueHeader,
  labelHeader,
  max,
  color,
  footer,
  legend,
  minHeight = 200,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  rows: RankRow[];
  formatValue: (v: number) => string;
  valueHeader: string;
  labelHeader: string;
  max?: number;
  color?: string;
  footer?: ReactNode;
  legend?: ReactNode;
  minHeight?: number;
  className?: string;
}) {
  const { t } = useT();
  const [asTable, setAsTable] = useState(false);
  const empty = rows.length === 0;
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      className={className}
      actions={
        !empty && (
          <IconButton
            size="sm"
            icon={asTable ? BarChart3 : Table2}
            label={asTable ? t("common.showChart") : t("common.showTable")}
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          />
        )
      }
    >
      {empty ? (
        <div style={{ minHeight }} className="flex items-center justify-center">
          <EmptyState icon={BarChart3} title={t("common.noData")} hint={t("common.noDataHint")} />
        </div>
      ) : asTable ? (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="label border-b border-line px-2 py-1.5 text-start font-normal">
                {labelHeader}
              </th>
              <th scope="col" className="label border-b border-line px-2 py-1.5 text-end font-normal">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/50">
                <td className="px-2 py-1.5 text-start text-ink-2">{r.text}</td>
                <td className="num px-2 py-1.5 text-end text-ink">{formatValue(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {legend && <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">{legend}</div>}
          <RankBars rows={rows} formatValue={formatValue} max={max} color={color} />
        </>
      )}
      {footer && !empty && <div className="mt-4 space-y-1.5 border-t border-line pt-3">{footer}</div>}
    </Panel>
  );
}
