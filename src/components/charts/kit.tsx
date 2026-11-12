"use client";
/**
 * FORGE chart kit — shared chrome for every Recharts visualisation.
 *
 * Conventions (please follow in every chart):
 *  - Wrap charts in <ChartPanel> (title, legend slot, chart/table toggle, empty state).
 *  - Series identity colours come from SERIES (fixed order, never cycled or
 *    reassigned by rank). Status colours (ok/amber/danger) mean state only.
 *  - One y-axis per chart. Two measures on different scales → two charts.
 *  - Use <ChartTooltip> for tooltips and useChartProps() for axes/grid so RTL,
 *    themes and reduced motion are handled in one place.
 *  - Text is always ink-coloured; the coloured mark beside it carries identity.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useReducedMotion } from "@/store/prefs";
import { EmptyState, IconButton, Panel, cn } from "@/components/ui/primitives";

/** Categorical series colours, in fixed assignment order. */
export const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"] as const;
/** Recessive colour for baselines, previous periods and targets. */
export const MUTED = "var(--c-muted)";
export const STATUS_COLOR = { ok: "var(--ok)", warn: "var(--amber)", danger: "var(--danger)", info: "var(--info)", neutral: "var(--ink-3)" } as const;

/** Stable colour per production line (identity follows the entity, not its rank). */
export function lineColor(lineId: string): string {
  const n = Number(lineId.replace(/\D/g, "")) || 1;
  return SERIES[(n - 1) % SERIES.length];
}

/** Axis, grid and animation props that respect direction, theme and motion. */
export function useChartProps() {
  const { rtl } = useT();
  const reduced = useReducedMotion();
  return {
    rtl,
    animate: !reduced,
    /** Spread onto <XAxis>. */
    xAxis: {
      reversed: rtl,
      tickLine: false,
      axisLine: { stroke: "var(--line)" },
      tickMargin: 8,
      minTickGap: 18,
      interval: "preserveStartEnd" as const,
    },
    /** Spread onto <YAxis>. */
    yAxis: {
      orientation: (rtl ? "right" : "left") as "left" | "right",
      tickLine: false,
      axisLine: false,
      tickMargin: 6,
      width: 44,
    },
    /** Spread onto <CartesianGrid>. */
    grid: { vertical: false, strokeDasharray: "2 4" },
    /** Spread onto <Line>/<Area>/<Bar>. */
    series: { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const },
    margin: { top: 8, right: rtl ? 0 : 8, bottom: 0, left: rtl ? 8 : 0 },
    cursor: { stroke: "var(--line-2)", strokeWidth: 1 },
    barCursor: { fill: "var(--ink)", fillOpacity: 0.05 },
  };
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

export function ChartPanel({
  title,
  subtitle,
  eyebrow,
  legend,
  actions,
  height = 260,
  table,
  empty,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  /** Legend row (use <LegendItem>). Required whenever there are 2+ series. */
  legend?: ReactNode;
  actions?: ReactNode;
  height?: number;
  /** Tabular equivalent of the chart, shown via the table toggle. */
  table?: ChartTable;
  /** Render the empty state instead of the chart. */
  empty?: boolean;
  /** The Recharts chart element (rendered inside a ResponsiveContainer). */
  children: React.ReactElement;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      className={className}
      actions={
        <>
          {actions}
          {table && !empty && (
            <IconButton
              size="sm"
              icon={asTable ? BarChart3 : Table2}
              label={asTable ? t("common.showChart") : t("common.showTable")}
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            />
          )}
        </>
      }
    >
      {legend && !empty && <div className="-mt-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">{legend}</div>}
      {empty ? (
        <div style={{ height }} className="flex items-center justify-center">
          <EmptyState icon={BarChart3} title={t("common.noData")} hint={t("common.noDataHint")} />
        </div>
      ) : asTable && table ? (
        <div style={{ height }} className="overflow-auto">
          <DataGrid table={table} />
        </div>
      ) : (
        // Charts are always laid out LTR; useChartProps mirrors the axes for RTL.
        <div dir="ltr" style={{ height }} className="min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {children}
          </ResponsiveContainer>
        </div>
      )}
      {footer && <div className="mt-3 border-t border-line pt-3">{footer}</div>}
    </Panel>
  );
}

function DataGrid({ table }: { table: ChartTable }) {
  const fmt = useFmt();
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead className="sticky top-0 bg-base">
        <tr>
          {table.columns.map((c, i) => (
            <th key={c} scope="col" className={cn("label border-b border-line px-2 py-1.5 font-normal", i === 0 ? "text-start" : "text-end")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, ri) => (
          <tr key={ri} className="border-b border-line/50">
            {r.map((v, i) => (
              <td key={i} className={cn("num px-2 py-1.5", i === 0 ? "text-start text-ink-2" : "text-end text-ink")}>
                {typeof v === "number" ? fmt.num(v, Number.isInteger(v) ? 0 : 1) : v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
}

/**
 * Custom tooltip body.
 *   <Tooltip content={<ChartTooltip formatValue={(v) => fmt.num(v)} unit="units" />} />
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
  unit,
  hideKeys,
  footer,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatLabel?: (label: string | number, payload: TooltipEntry[]) => string;
  formatValue?: (value: number, key: string) => string;
  unit?: string;
  /** dataKeys to leave out of the tooltip. */
  hideKeys?: string[];
  footer?: (payload: TooltipEntry[]) => ReactNode;
}) {
  const { dir } = useT();
  const fmt = useFmt();
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => !hideKeys?.includes(String(p.dataKey)) && p.value !== undefined && p.value !== null);
  if (rows.length === 0) return null;
  return (
    <div dir={dir} className="min-w-[150px] rounded-md border border-line-2 bg-raised px-3 py-2 shadow-pop">
      {label !== undefined && label !== "" && <p className="label mb-1.5">{formatLabel ? formatLabel(label, payload) : String(label)}</p>}
      <ul className="space-y-1">
        {rows.map((p, i) => {
          const v = Array.isArray(p.value) ? Number(p.value[1]) : Number(p.value);
          return (
            <li key={i} className="flex items-center justify-between gap-4 text-[12px]">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span aria-hidden className="size-2 shrink-0 rounded-[1px]" style={{ background: p.color ?? (p.payload?.fill as string | undefined) ?? "var(--ink-3)" }} />
                {p.name}
              </span>
              <span className="num font-semibold text-ink">
                {formatValue ? formatValue(v, String(p.dataKey)) : fmt.num(v, Number.isInteger(v) ? 0 : 1)}
                {unit && <span className="ms-1 font-normal text-ink-3">{unit}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-[11.5px] text-ink-3">{footer(payload)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small inline charts (pure SVG)                                      */
/* ------------------------------------------------------------------ */

/** Tiny trend line for KPI tiles. Decorative: pair it with the number it describes. */
export function Sparkline({ data, color = "var(--c1)", width = 96, height = 28, fill = true, className }: { data: number[]; color?: string; width?: number; height?: number; fill?: boolean; className?: string }) {
  const { rtl } = useT();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return [rtl ? width - x : x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)}>
      {fill && <path d={`${d} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} stroke="var(--base)" strokeWidth={1} />
    </svg>
  );
}

/** Horizontal ranked bars (pure HTML): label, bar, value. Good for "by cause / by machine". */
export function RankBars({
  rows,
  color = "var(--c1)",
  formatValue,
  max,
  onSelect,
  className,
}: {
  rows: { key: string; label: ReactNode; value: number; color?: string; hint?: string }[];
  color?: string;
  formatValue: (v: number) => string;
  max?: number;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-ink-2">{r.label}</span>
              <span className="num shrink-0 font-semibold text-ink">{formatValue(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-[1px] bg-line/60">
              <div className="h-full rounded-[1px] transition-[width] duration-500 ease-forge" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%`, background: r.color ?? color }} />
            </div>
            {r.hint && <p className="mt-1 text-[11px] text-ink-3">{r.hint}</p>}
          </>
        );
        return (
          <li key={r.key}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(r.key)} className="block w-full rounded-sm text-start hover:bg-raised/60">
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
