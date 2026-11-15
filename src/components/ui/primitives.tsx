"use client";
import { clsx, type ClassValue } from "clsx";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, FlaskConical, Minus } from "lucide-react";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useReducedMotion } from "@/store/prefs";

export function cn(...v: ClassValue[]) {
  return clsx(v);
}

/* ------------------------------------------------------------------ */
/* Tones                                                               */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "accent" | "ok" | "warn" | "info" | "danger";

export const toneText: Record<Tone, string> = {
  neutral: "text-ink-2",
  accent: "text-forge-text",
  ok: "text-ok",
  warn: "text-amber",
  info: "text-info",
  danger: "text-danger",
};
export const toneBg: Record<Tone, string> = {
  neutral: "bg-ink-3",
  accent: "bg-forge",
  ok: "bg-ok",
  warn: "bg-amber",
  info: "bg-info",
  danger: "bg-danger",
};
/** CSS colour variable for a tone (for SVG / inline styles). */
export const toneVar: Record<Tone, string> = {
  neutral: "var(--ink-3)",
  accent: "var(--forge)",
  ok: "var(--ok)",
  warn: "var(--amber)",
  info: "var(--info)",
  danger: "var(--danger)",
};
const toneBadge: Record<Tone, string> = {
  neutral: "border-line-2 text-ink-2 bg-ink-3/10",
  accent: "border-forge/45 text-forge-text bg-forge/10",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-amber/45 text-amber bg-amber/10",
  info: "border-info/40 text-info bg-info/10",
  danger: "border-danger/45 text-danger bg-danger/10",
};

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
}

const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-forge text-forge-ink border-forge hover:brightness-110 font-semibold",
  secondary: "bg-raised text-ink border-line-2 hover:border-ink-3 hover:bg-panel",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-raised hover:text-ink",
  danger: "bg-danger/10 text-danger border-danger/50 hover:bg-danger/20",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconEnd: IconEnd, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-[background-color,border-color,filter,transform] duration-100 active:translate-y-px disabled:opacity-45 disabled:active:translate-y-0",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-[34px] px-3 text-[13px]",
        buttonVariant[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.2} />}
      {children}
      {IconEnd && <IconEnd aria-hidden className="size-3.5 shrink-0 rtl:-scale-x-100" strokeWidth={2.2} />}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name; also shown as a tooltip. */
  label: string;
  size?: "sm" | "md";
  active?: boolean;
  tooltipSide?: "top" | "bottom";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = "md", active, className, type = "button", tooltipSide = "bottom", ...rest },
  ref,
) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md border border-transparent text-ink-2 transition-colors duration-100 hover:bg-raised hover:text-ink disabled:opacity-40",
          size === "sm" ? "size-7" : "size-[34px]",
          active && "border-line-2 bg-raised text-ink",
          className,
        )}
        {...rest}
      >
        <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} />
      </button>
    </Tooltip>
  );
});

/* ------------------------------------------------------------------ */
/* Tooltip (CSS-driven, no layout cost)                                */
/* ------------------------------------------------------------------ */

export function Tooltip({ label, children, side = "bottom", className }: { label: string; children: ReactNode; side?: "top" | "bottom" | "end"; className?: string }) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="presentation"
        aria-hidden
        className={cn(
          // display:none at rest so hidden tooltips never add scrollable overflow.
          "pointer-events-none absolute z-50 hidden animate-fade whitespace-nowrap rounded-sm border border-line-2 bg-panel px-2 py-1 text-[11px] font-medium text-ink shadow-pop group-focus-within/tt:block group-hover/tt:block",
          side === "bottom" && "start-1/2 top-full mt-1.5 -translate-x-1/2 rtl:translate-x-1/2",
          side === "top" && "bottom-full start-1/2 mb-1.5 -translate-x-1/2 rtl:translate-x-1/2",
          side === "end" && "start-full top-1/2 ms-2 -translate-y-1/2",
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Badges & status                                                     */
/* ------------------------------------------------------------------ */

export function Badge({ tone = "neutral", children, dot, pulse, icon: Icon, className }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cn("inline-flex h-[21px] items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 text-[11px] font-semibold leading-none", toneBadge[tone], className)}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", toneBg[tone], pulse && "animate-pulse-dot")} />}
      {Icon && <Icon aria-hidden className="size-3" strokeWidth={2.4} />}
      {children}
    </span>
  );
}

/** Identifier / code: monospace and always LTR, even inside Arabic text. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi className={cn("code text-[12px]", className)}>{children}</bdi>;
}

/** Marks a value or panel as simulated demo data. */
export function SimBadge({ label, className }: { label?: string; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border border-dashed border-line-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3", className)}>
      <FlaskConical aria-hidden className="size-3" />
      {label ?? t("common.simulatedData")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  flush,
  as: Tag = "section",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (tables, maps). */
  flush?: boolean;
  as?: "section" | "div" | "article" | "aside";
}) {
  const id = useId();
  return (
    <Tag className={cn("panel flex min-w-0 flex-col", className)} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <header className="flex min-h-[46px] min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2">
          <div className="min-w-0">
            {eyebrow && <div className="label mb-0.5">{eyebrow}</div>}
            {title && (
              <h2 id={id} className="truncate text-[13px] font-semibold text-ink">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Animated number reveal. Counts from the previous value to the new one;
 * renders the final value immediately when motion is reduced.
 */
export function CountUp({ value, format, duration = 650, className }: { value: number; format: (n: number) => string; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = a + (value - a) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return <span className={cn("num", className)}>{format(reduced ? value : shown)}</span>;
}

/** Change versus a baseline. `goodWhen` says which direction is an improvement. */
export function Delta({ value, goodWhen = "up", label, className }: { value: number | null; goodWhen?: "up" | "down"; label?: string; className?: string }) {
  const fmt = useFmt();
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-[11.5px] text-ink-3", className)}>—</span>;
  const flat = Math.abs(value) < 0.0005;
  const good = flat ? null : (value > 0) === (goodWhen === "up");
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-semibold", good === null ? "text-ink-3" : good ? "text-ok" : "text-danger", className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.4} />
      <span className="num">{fmt.signedPct(value)}</span>
      {label && <span className="font-normal text-ink-3">{label}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress & meters                                                   */
/* ------------------------------------------------------------------ */

export function Progress({ value, tone = "accent", marker, className, label, thick }: { value: number; tone?: Tone; /** 0–1 position of a target marker */ marker?: number; className?: string; label?: string; thick?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("relative w-full overflow-visible rounded-[1px] bg-line/70", thick ? "h-2" : "h-1.5", className)}
    >
      <div className={cn("h-full rounded-[1px] transition-[width] duration-500 ease-forge", toneBg[tone])} style={{ width: `${pct}%` }} />
      {marker !== undefined && (
        <span aria-hidden className="absolute -top-1 h-[calc(100%+8px)] w-px bg-ink" style={{ insetInlineStart: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />
      )}
    </div>
  );
}

/** Segmented bar: parts of a whole with a 2px gap between fills. */
export function SegmentBar({ segments, className }: { segments: { value: number; color: string; label: string }[]; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={cn("flex h-2 w-full gap-0.5", className)} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span key={s.label} title={`${s.label}: ${s.value}`} className="h-full rounded-[1px] transition-[flex-grow] duration-500" style={{ flexGrow: s.value / total, background: s.color, minWidth: 3 }} />
        ))}
    </div>
  );
}

/** Compact radial gauge for a 0–1 ratio. */
export function Gauge({ value, size = 76, stroke = 6, tone = "accent", children, label }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneVar[tone]}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control / tabs                                            */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; label: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-canvas p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 font-medium transition-colors duration-100",
              size === "sm" ? "h-6 text-[11.5px]" : "h-7 text-[12.5px]",
              active ? "bg-panel text-ink shadow-[inset_0_-2px_0_var(--forge)]" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.icon && <o.icon aria-hidden className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; label: string; className?: string }) {
  const fmt = useFmt();
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-5 overflow-x-auto border-b border-line", className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 text-[13px] font-medium transition-colors",
              active ? "border-forge text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="num rounded-sm bg-raised px-1.5 py-0.5 text-[10.5px] text-ink-2">{fmt.num(tab.count)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, error, optional, children, className }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode; className?: string }) {
  const { t } = useT();
  const id = useId();
  const descId = `${id}-d`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[12px] font-medium text-ink-2">
        <span>{label}</span>
        {optional && <span className="text-[11px] font-normal text-ink-3">{t("common.optional")}</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} role="alert" className="text-[11.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-[11.5px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("field", (rest.type === "number" || rest.inputMode === "numeric" || rest.inputMode === "decimal") && "num", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn("field", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn("field", className)} {...rest} />;
});

export function Checkbox({ checked, onChange, label, indeterminate, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; indeterminate?: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn("size-3.5 shrink-0 cursor-pointer rounded-[2px] accent-[var(--forge)]", className)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Empty, loading, definition lists                                    */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon: Icon, title, hint, action, className }: { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {Icon && (
        <span className="ticks mb-1 flex size-10 items-center justify-center border border-line text-ink-3">
          <Icon aria-hidden className="size-4.5" />
        </span>
      )}
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[12px] text-ink-3">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden rounded-sm bg-raised", className)}>
      <div className="absolute inset-0 animate-sweep bg-gradient-to-r from-transparent via-ink/5 to-transparent" />
    </div>
  );
}

/** Label / value grid for record details. */
export function DataList({ items, columns = 2, className }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3.5",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="label">{it.label}</dt>
          <dd className="mt-1 break-words text-[13px] text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Legend entry: coloured mark + ink-coloured label. Clickable when onToggle is given. */
export function LegendItem({ color, label, value, hidden, onToggle, shape = "square" }: { color: string; label: string; value?: ReactNode; hidden?: boolean; onToggle?: () => void; shape?: "square" | "line" | "dash" }) {
  const mark = (
    <span
      aria-hidden
      className={cn("shrink-0", shape === "square" ? "size-2 rounded-[1px]" : "h-0.5 w-3.5", hidden && "opacity-30")}
      style={shape === "dash" ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` } : { background: color }}
    />
  );
  const body = (
    <>
      {mark}
      <span className={cn("text-[11.5px] text-ink-2", hidden && "text-ink-3 line-through")}>{label}</span>
      {value !== undefined && <span className="num text-[11.5px] font-semibold text-ink">{value}</span>}
    </>
  );
  return onToggle ? (
    <button type="button" aria-pressed={!hidden} onClick={onToggle} className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-raised">
      {body}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-1 py-0.5">{body}</span>
  );
}
