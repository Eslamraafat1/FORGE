"use client";
/**
 * Warehouse floor plan + zone inspector.
 *
 * The plan is a physical layout, so it is drawn in a fixed orientation in both
 * languages (it does not mirror in RTL); only the labels are localised.
 * Occupancy uses one hue, light → dark. Docks and staging lanes carry a hatch
 * pattern and a text label so they never rely on colour alone.
 */
import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, MousePointerClick } from "lucide-react";
import type { ID, Warehouse, WarehouseZone, ZoneKind } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { zoneUsage, type ZoneUsage } from "@/store/selectors";
import { useForge } from "@/store/store";
import { useReducedMotion } from "@/store/prefs";
import { Badge, Button, Code, DataList, Progress, cn } from "@/components/ui/primitives";
import { ItemRef, MOVEMENT_TONE, SignedQty, useQty } from "./shared";

const HUE = "var(--c5)";
const STEPS = [12, 30, 50, 70, 90] as const;
const HATCH = "color-mix(in srgb, var(--ink) 30%, transparent)";

function stepOf(occupancy: number): number {
  return Math.max(0, Math.min(STEPS.length - 1, Math.floor(occupancy * STEPS.length - 1e-9)));
}
function fillOf(step: number): string {
  return `color-mix(in oklab, ${HUE} ${STEPS[step]}%, var(--base))`;
}
function patternOf(kind: ZoneKind): string | undefined {
  if (kind === "dock") return `repeating-linear-gradient(45deg, ${HATCH} 0 1px, transparent 1px 7px)`;
  if (kind === "staging") return `repeating-linear-gradient(90deg, ${HATCH} 0 1px, transparent 1px 6px)`;
  return undefined;
}
const isTransit = (kind: ZoneKind) => kind === "dock" || kind === "staging";

/** zoneId → usage for a set of zones (live from the store). */
export function useZoneUsage(zones: WarehouseZone[]): Map<ID, ZoneUsage> {
  const items = useForge((s) => s.items);
  const shipments = useForge((s) => s.shipments);
  return useMemo(() => new Map(zones.map((z) => [z.id, zoneUsage(z, items, shipments)])), [zones, items, shipments]);
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

export function ZoneMap({
  warehouse,
  zones,
  usage,
  selectedId,
  onSelect,
  size = "md",
}: {
  warehouse: Warehouse;
  zones: WarehouseZone[];
  usage: Map<ID, ZoneUsage>;
  selectedId?: ID | null;
  /** Omit for a static (non-interactive) map. */
  onSelect?: (id: ID) => void;
  size?: "mini" | "md" | "lg";
}) {
  const { t, td, tl, dir } = useT();
  const fmt = useFmt();
  const rowMin = size === "mini" ? 14 : size === "lg" ? 46 : 38;
  const ratio = size === "lg" ? 0.56 : size === "mini" ? 0.5 : 0.6;
  const grid: CSSProperties = {
    gridTemplateColumns: `repeat(${warehouse.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${warehouse.rows}, minmax(${rowMin}px, 1fr))`,
    aspectRatio: `${warehouse.cols} / ${warehouse.rows * ratio}`,
  };
  const name = tl(warehouse.name);

  if (size === "mini" || !onSelect) {
    const selected = zones.find((z) => z.id === selectedId);
    return (
      <div dir="ltr" role="img" aria-label={selected ? t("warehouse.map.miniAria", { zone: selected.code, name }) : t("warehouse.map.aria", { name })} className="grid gap-0.5 rounded-md border border-line bg-canvas p-1" style={grid}>
        {zones.map((z) => {
          const on = z.id === selectedId;
          return (
            <div
              key={z.id}
              className={cn("flex items-center justify-center overflow-hidden rounded-[2px] border", on ? "border-forge bg-forge/25 shadow-[inset_0_0_0_1px_var(--forge)]" : "border-line bg-raised", z.kind === "staging" && !on && "border-dashed")}
              style={{ gridColumn: `${z.x + 1} / span ${z.w}`, gridRow: `${z.y + 1} / span ${z.h}`, backgroundImage: on ? undefined : patternOf(z.kind) }}
            >
              <span className={cn("code text-[10px]", on ? "font-semibold text-ink" : "text-ink-3")}>{z.code}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div dir="ltr" role="group" aria-label={t("warehouse.map.aria", { name })} className="grid gap-1 rounded-md border border-line bg-canvas p-1.5" style={grid}>
      {zones.map((z) => {
        const u = usage.get(z.id);
        const occ = u?.occupancy ?? 0;
        const on = z.id === selectedId;
        const transit = isTransit(z.kind);
        const pct = fmt.pct(occ, 0);
        const tall = z.h >= 2;
        return (
          <button
            key={z.id}
            type="button"
            dir={dir}
            aria-pressed={on}
            aria-label={t("warehouse.map.zoneAria", { code: z.code, name: tl(z.name), kind: td(`zonekind.${z.kind}`), pct })}
            onClick={() => onSelect(z.id)}
            className={cn(
              "group/zone relative flex min-w-0 gap-1 overflow-hidden rounded-sm border p-1 text-start transition-[border-color,box-shadow] duration-100 focus-visible:z-10",
              tall ? "flex-col items-start justify-between" : "flex-row flex-wrap items-center",
              on ? "z-[1] border-forge shadow-[inset_0_0_0_2px_var(--forge)]" : "border-line-2 hover:border-ink-2",
              z.kind === "staging" && !on && "border-dashed",
            )}
            style={{ gridColumn: `${z.x + 1} / span ${z.w}`, gridRow: `${z.y + 1} / span ${z.h}`, backgroundColor: fillOf(stepOf(occ)), backgroundImage: patternOf(z.kind) }}
          >
            <span className="inline-flex max-w-full items-baseline gap-1.5 rounded-[2px] bg-base/90 px-1 py-0.5">
              <span className="code text-[11px] font-semibold text-ink">{z.code}</span>
              <span className="num text-[11px] text-ink-2">{pct}</span>
            </span>
            {(tall || transit) && (
              <span className={cn("max-w-full truncate rounded-[2px] bg-base/90 px-1 py-0.5 text-[10.5px] leading-tight text-ink-2", !transit && "hidden sm:inline-block", transit && "font-semibold uppercase")}>
                {transit ? td(`zonekind.${z.kind}`) : tl(z.name)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ZoneLegend({ className }: { className?: string }) {
  const { t, td } = useT();
  const fmt = useFmt();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-2", className)}>
      <div className="flex items-center gap-2">
        <span>{t("warehouse.legend.occupancy")}</span>
        <span className="text-ink-3 num">{fmt.pct(0, 0)}</span>
        <span className="flex" dir="ltr" role="img" aria-label={t("warehouse.legend.scaleAria")}>
          {STEPS.map((_, i) => (
            <span key={i} title={`${fmt.pct(i / STEPS.length, 0)} – ${fmt.pct((i + 1) / STEPS.length, 0)}`} className="h-3 w-6 border-y border-e border-line-2 first:border-s" style={{ background: fillOf(i) }} />
          ))}
        </span>
        <span className="text-ink-3 num">{fmt.pct(1, 0)}</span>
      </div>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 border border-line-2 bg-raised" style={{ backgroundImage: patternOf("dock") }} />
        {td("zonekind.dock")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 border border-dashed border-line-2 bg-raised" style={{ backgroundImage: patternOf("staging") }} />
        {td("zonekind.staging")}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

function occTone(o: number) {
  return o >= 0.9 ? "danger" : o >= 0.8 ? "warn" : "accent";
}

export function ZoneInspector({
  zones,
  usage,
  selectedId,
  onSelect,
  className,
}: {
  zones: WarehouseZone[];
  usage: Map<ID, ZoneUsage>;
  selectedId: ID | null;
  onSelect: (id: ID | null) => void;
  className?: string;
}) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const q = useQty();
  const now = useForge((s) => s.now);
  const items = useForge((s) => s.items);
  const movements = useForge((s) => s.movements);
  const shipments = useForge((s) => s.shipments);
  const zone = zones.find((z) => z.id === selectedId) ?? null;

  const stored = useMemo(() => (zone ? items.filter((i) => i.zoneId === zone.id) : []), [items, zone]);
  const recent = useMemo(() => {
    if (!zone) return [];
    const ids = new Set(stored.map((i) => i.id));
    return movements.filter((m) => ids.has(m.itemId)).slice().sort((a, b) => b.at - a.at).slice(0, 6);
  }, [movements, stored, zone]);

  if (!zone) {
    return (
      <aside className={cn("panel flex min-w-0 flex-col", className)} aria-label={t("warehouse.inspector.title")}>
        <header className="border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <MousePointerClick aria-hidden className="size-3.5 text-ink-3" />
            {t("warehouse.inspector.title")}
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-3">{t("warehouse.inspector.prompt")}</p>
        </header>
        <ul className="divide-y divide-line/70">
          {zones.map((z) => {
            const u = usage.get(z.id);
            return (
              <li key={z.id}>
                <button type="button" onClick={() => onSelect(z.id)} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-raised">
                  <Code className="w-11 shrink-0 font-semibold text-ink">{z.code}</Code>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink-2">{tl(z.name)}</span>
                    <Progress value={u?.occupancy ?? 0} tone={occTone(u?.occupancy ?? 0)} className="mt-1.5" label={t("warehouse.occupancy")} />
                  </span>
                  <span className="num w-10 shrink-0 text-end text-[12px] font-semibold text-ink">{fmt.pct(u?.occupancy ?? 0, 0)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  const u = usage.get(zone.id) ?? zoneUsage(zone, items, shipments);
  const transit = isTransit(zone.kind);
  return (
    <aside className={cn("panel flex min-w-0 animate-fade flex-col", className)} aria-label={t("warehouse.inspector.title")} key={zone.id}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="label mb-1">{t("warehouse.inspector.zone")}</div>
          <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
            <Code className="!text-[14px]">{zone.code}</Code>
            <span className="min-w-0 truncate">{tl(zone.name)}</span>
          </h3>
        </div>
        <Button size="sm" variant="ghost" icon={ArrowLeft} className="rtl:[&>svg]:-scale-x-100" onClick={() => onSelect(null)}>
          {t("warehouse.inspector.allZones")}
        </Button>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="label">{t("warehouse.occupancy")}</span>
            <span className="num text-[12px] text-ink-2">{t("warehouse.usedOf", { used: u.used, cap: u.capacity })}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="num display text-[28px] text-ink">{fmt.pct(u.occupancy, 0)}</span>
            <Progress value={u.occupancy} tone={occTone(u.occupancy)} thick label={t("warehouse.occupancy")} />
          </div>
          {transit && stored.length === 0 && <p className="mt-1.5 text-[11.5px] text-ink-3">{t("warehouse.inspector.transitNote")}</p>}
        </div>

        <DataList
          items={[
            { label: t("warehouse.inspector.kind"), value: <Badge tone={transit ? "info" : "neutral"}>{td(`zonekind.${zone.kind}`)}</Badge> },
            { label: t("warehouse.inspector.capacity"), value: <span className="num">{t("warehouse.nPositions", { n: u.capacity })}</span> },
            { label: t("warehouse.inspector.available"), value: <span className="num">{t("warehouse.nPositions", { n: u.free })}</span> },
            { label: t("warehouse.inspector.stockValue"), value: <span className="num">{fmt.money(u.value)}</span> },
            {
              label: t("warehouse.inspector.categories"),
              value: zone.categories.length ? zone.categories.map((c) => td(`invcat.${c}`)).join(" · ") : <span className="text-ink-3">{t("warehouse.inspector.noCategories")}</span>,
            },
            { label: t("warehouse.inspector.itemCount"), value: <span className="num">{fmt.num(u.itemCount)}</span> },
          ]}
        />

        <div>
          <h4 className="label mb-1.5">{t("warehouse.inspector.items")}</h4>
          {stored.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">{t("warehouse.inspector.noItems")}</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {stored.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <ItemRef item={i} />
                  <span className="num shrink-0 text-[12.5px] text-ink">
                    {q.qty(i.quantity)} <span className="text-ink-3">{i.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="label mb-1.5">{t("warehouse.inspector.activity")}</h4>
          {recent.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">{t("warehouse.inspector.noActivity")}</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={MOVEMENT_TONE[m.type]}>{td(`mvtype.${m.type}`)}</Badge>
                      <Code className="text-ink-2">{m.itemId}</Code>
                    </span>
                    <span className="num mt-0.5 block text-[11.5px] text-ink-3">{fmt.relative(m.at, now)}</span>
                  </span>
                  <SignedQty value={m.qty} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Map + legend + inspector                                            */
/* ------------------------------------------------------------------ */

export function WarehouseFloor({
  warehouse,
  size = "md",
  selectedId: controlled,
  onSelect: onControlledSelect,
}: {
  warehouse: Warehouse;
  size?: "md" | "lg";
  selectedId?: ID | null;
  onSelect?: (id: ID | null) => void;
}) {
  const allZones = useForge((s) => s.zones);
  const zones = useMemo(() => allZones.filter((z) => z.warehouseId === warehouse.id), [allZones, warehouse.id]);
  const usage = useZoneUsage(zones);
  const reduced = useReducedMotion();
  const [inner, setInner] = useState<ID | null>(null);
  const selectedId = controlled !== undefined ? controlled : inner;
  const inspector = useRef<HTMLDivElement>(null);

  const select = (id: ID | null) => {
    const next = id !== null && id === selectedId ? null : id;
    setInner(next);
    onControlledSelect?.(next);
    // On narrow screens the inspector sits below the map: bring it into view.
    if (next) requestAnimationFrame(() => inspector.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }));
  };

  return (
    <div className={cn("grid min-w-0 gap-4", size === "lg" ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "lg:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="min-w-0">
        <ZoneMap warehouse={warehouse} zones={zones} usage={usage} selectedId={selectedId} onSelect={select} size={size} />
        <ZoneLegend className="mt-3" />
      </div>
      <div ref={inspector} className="min-w-0 scroll-mb-24 scroll-mt-20">
        <ZoneInspector zones={zones} usage={usage} selectedId={selectedId} onSelect={select} className="lg:max-h-[560px] lg:overflow-y-auto" />
      </div>
    </div>
  );
}
