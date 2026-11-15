"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, FileQuestion } from "lucide-react";
import type { EntityRef, ID, L10n, TeamMember } from "@/domain/types";
import { useT, type TKey } from "@/i18n";
import { can, type Capability } from "@/lib/permissions";
import { entityHref } from "@/lib/routes";
import { useForge } from "@/store/store";
import { Code, CountUp, Delta, EmptyState, Tooltip, cn, toneText, type Tone } from "./primitives";

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

/** Standard page container: consistent gutters and vertical rhythm. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 pb-10 pt-5 sm:px-6 lg:gap-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small technical label above the title (module code, record ID…). */
  eyebrow?: ReactNode;
  /** Contextual action area. */
  actions?: ReactNode;
  /** Badges / status shown beside the title. */
  meta?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft aria-hidden className="size-3.5 rtl:-scale-x-100" />
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="label mb-1.5 flex items-center gap-2">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="display text-[30px] text-ink sm:text-[34px]">{title}</h1>
          {meta && <div className="flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Shown by detail routes when the record ID is not in the dataset. */
export function EntityNotFound({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const { t } = useT();
  return (
    <Page>
      <div className="panel">
        <EmptyState
          icon={FileQuestion}
          title={t("shell.notFound.title")}
          hint={t("shell.notFound.entity")}
          action={
            <Link href={backHref} className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium hover:bg-panel">
              <ArrowLeft aria-hidden className="size-3.5 rtl:-scale-x-100" />
              {t("shell.backTo", { page: backLabel })}
            </Link>
          }
        />
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

/**
 * Stat tile. Deliberately plain: label, hero number, optional unit / delta /
 * footnote / trailing visual. Compose several inside a <KpiStrip>.
 */
export function Kpi({
  label,
  value,
  format,
  unit,
  delta,
  deltaGoodWhen,
  deltaLabel,
  hint,
  tone,
  icon: Icon,
  visual,
  href,
  className,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  unit?: string;
  /** Relative change vs baseline (0.04 = +4%). Omit to hide. */
  delta?: number | null;
  deltaGoodWhen?: "up" | "down";
  deltaLabel?: string;
  hint?: ReactNode;
  /** Colours the value when it carries a state (e.g. danger when below target). */
  tone?: Tone;
  icon?: LucideIcon;
  /** Trailing visual such as a <Sparkline> or <Gauge>. */
  visual?: ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {Icon && <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <CountUp value={value} format={format} className={cn("display text-[30px]", tone ? toneText[tone] : "text-ink")} />
            {unit && <span className="text-[12px] text-ink-3">{unit}</span>}
          </div>
          {(delta !== undefined || hint) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {delta !== undefined && <Delta value={delta} goodWhen={deltaGoodWhen} label={deltaLabel} />}
              {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
            </div>
          )}
        </div>
        {visual}
      </div>
    </>
  );
  const cls = cn("block min-w-0 bg-base px-4 py-3.5", href && "transition-colors hover:bg-raised", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row of KPI tiles separated by hairlines (one bordered band, not N cards). */
export function KpiStrip({ children, className, columns = 4 }: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 | 5 | 6 }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-md border border-line bg-line",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        columns === 5 && "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
        columns === 6 && "grid-cols-2 md:grid-cols-3 2xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entity helpers                                                      */
/* ------------------------------------------------------------------ */

/** Link to any record by reference; renders the ID as a code. */
export function EntityLink({ entity, children, className }: { entity: EntityRef; children?: ReactNode; className?: string }) {
  return (
    <Link href={entityHref(entity)} className={cn("rounded-sm text-ink underline decoration-line-2 decoration-dotted underline-offset-[3px] hover:text-forge-text hover:decoration-forge", className)}>
      {children ?? <Code>{entity.id}</Code>}
    </Link>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ member, size = 24 }: { member: Pick<TeamMember, "name" | "id">; size?: number }) {
  // Initials come from the Latin name so avatars are stable across languages.
  const hue = (Number(member.id.replace(/\D/g, "")) * 47) % 360;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-sm border border-line-2 font-mono font-semibold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `color-mix(in oklch, oklch(0.62 0.09 ${hue}) 26%, var(--raised))` }}
    >
      {initials(member.name.en)}
    </span>
  );
}

/** Avatar + localized name for a team member ID. Shows "Unassigned" for null. */
export function Member({ id, showRole, size = 22 }: { id: ID | null | undefined; showRole?: boolean; size?: number }) {
  const { t, tl, td } = useT();
  const member = useForge((s) => (id ? s.team.find((m) => m.id === id) : undefined));
  if (!member) return <span className="text-ink-3">{t("common.unassigned")}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar member={member} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-ink">{tl(member.name)}</span>
        {showRole && <span className="block truncate text-[11.5px] text-ink-3">{td(`role.${member.role}`)}</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Does the active demo role have this capability? (Interface gating only.) */
export function useCan(cap: Capability): boolean {
  return useForge((s) => can(s.role, cap));
}

/**
 * Wrap an action control that needs a capability: renders children when
 * allowed, otherwise a disabled-looking hint so the role model is visible.
 */
export function Guard({ cap, children, fallback }: { cap: Capability; children: ReactNode; fallback?: ReactNode }) {
  const allowed = useCan(cap);
  const { t } = useT();
  if (allowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  return (
    <Tooltip label={t("common.readOnly")} side="top">
      <span className="inline-flex cursor-not-allowed opacity-45 [&_*]:pointer-events-none" aria-disabled="true">
        {children}
      </span>
    </Tooltip>
  );
}

/** ID → record lookups over the reference data, memoised per array identity. */
export function useLookup() {
  const products = useForge((s) => s.products);
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const team = useForge((s) => s.team);
  const items = useForge((s) => s.items);
  const suppliers = useForge((s) => s.suppliers);
  const warehouses = useForge((s) => s.warehouses);
  const zones = useForge((s) => s.zones);
  const factories = useForge((s) => s.factories);
  return useMemo(() => {
    const index = <T extends { id: ID }>(list: T[]) => {
      const m = new Map(list.map((x) => [x.id, x]));
      return (id: ID | null | undefined) => (id ? m.get(id) : undefined);
    };
    return {
      product: index(products),
      line: index(lines),
      machine: index(machines),
      member: index(team),
      item: index(items),
      supplier: index(suppliers),
      warehouse: index(warehouses),
      zone: index(zones),
      factory: index(factories),
    };
  }, [products, lines, machines, team, items, suppliers, warehouses, zones, factories]);
}

/** Translate a bilingual name or fall back to a dash. */
export function useName() {
  const { tl } = useT();
  return (v: { name: L10n } | undefined | null) => (v ? tl(v.name) : "—");
}

export type { TKey };
