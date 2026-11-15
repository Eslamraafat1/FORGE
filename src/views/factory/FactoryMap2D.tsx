"use client";
/**
 * 2D isometric map of the plant. Same floor plan, silhouettes and selection
 * behaviour as the 3D scene, drawn as plain SVG: works without WebGL, is fully
 * keyboard operable, and is the default on phones and with reduced motion.
 */
import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { ID } from "@/domain/types";
import { useLookup } from "@/components/ui/page";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import {
  BEACON,
  MACHINE_FOOTPRINT,
  MACHINE_PARTS,
  PALLET,
  TRUCK,
  filledPallets,
  iso,
  isoBox,
  isoQuad,
  maintenanceProps,
  rectCenter,
  type LineSlot,
  type MachineSlot,
  type PartMaterial,
  type Rect,
} from "./layout";
import { GlyphShape, occupancyVar, statusVar, type TwinViewProps } from "./shared";

const mixBase = (pct: number) => `color-mix(in srgb, var(--raised) ${pct}%, var(--ink-2))`;
const shade = (base: string, pct: number) => `color-mix(in srgb, ${base} ${pct}%, black)`;
const faces = (base: string) => ({ top: base, left: shade(base, 88), right: shade(base, 76) });

/** Face fills per material: lit from above, +X face in shade. */
const FILL: Record<PartMaterial | "pallet" | "wall", { top: string; left: string; right: string }> = {
  body: faces(mixBase(78)),
  trim: faces(mixBase(50)),
  glass: faces("color-mix(in srgb, var(--info) 55%, var(--raised))"),
  pallet: faces("color-mix(in srgb, var(--c-muted) 85%, var(--raised))"),
  wall: faces("var(--panel)"),
};

const STROKE = 0.05;

function IsoBox({ c, s, m, stroke = "var(--ink-3)" }: { c: readonly [number, number, number]; s: readonly [number, number, number]; m: keyof typeof FILL; stroke?: string }) {
  const f = isoBox(c[0], c[1], c[2], s[0], s[1], s[2]);
  const fill = FILL[m];
  return (
    <g stroke={stroke} strokeWidth={STROKE} strokeLinejoin="round">
      <polygon points={f.left} fill={fill.left} />
      <polygon points={f.right} fill={fill.right} />
      <polygon points={f.top} fill={fill.top} />
    </g>
  );
}

function FloorLabel({ x, z, children, active }: { x: number; z: number; children: string; active?: boolean }) {
  const [sx, sy] = iso(x, z);
  return (
    <text
      x={sx}
      y={sy}
      fontSize={1.25}
      fontFamily="var(--font-mono)"
      fontWeight={600}
      fill={active ? "var(--forge-text)" : "var(--ink-3)"}
      textAnchor="middle"
      dominantBaseline="middle"
      style={{ pointerEvents: "none" }}
    >
      {children}
    </text>
  );
}

export function FactoryMap2D({ layout, statusOf, usage, mode, selection, onSelect, labels, zoom }: TwinViewProps & { zoom: number }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const nodes = useRef(new Map<ID, SVGGElement>());

  const selectedMachine = selection?.type === "machine" ? selection.id : null;
  const selectedZone = selection?.type === "zone" ? selection.id : null;

  const view = useMemo(() => {
    const b = layout.bounds;
    const left = iso(b.x, b.z + b.d)[0];
    const right = iso(b.x + b.w, b.z)[0];
    const top = iso(b.x, b.z)[1] - 8.5;
    const bottom = iso(b.x + b.w, b.z + b.d)[1];
    const pad = 2.5;
    return `${(left - pad).toFixed(1)} ${(top - pad).toFixed(1)} ${(right - left + pad * 2).toFixed(1)} ${(bottom - top + pad * 2).toFixed(1)}`;
  }, [layout]);

  const grid = useMemo(() => {
    const b = layout.building;
    let d = "";
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const [ax, ay] = iso(x0, z0);
      const [bx, by] = iso(x1, z1);
      d += `M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}`;
    };
    for (let x = 2; x < b.w; x += 2) seg(b.x + x, b.z, b.x + x, b.z + b.d);
    for (let z = 2; z < b.d; z += 2) seg(b.x, b.z + z, b.x + b.w, b.z + z);
    return d;
  }, [layout]);

  /** Static objects of the east block and apron, sorted far → near. */
  const eastObjects = useMemo(() => {
    const wallX = layout.building.x + layout.building.w;
    const out: { key: string; depth: number; c: [number, number, number]; s: [number, number, number]; m: keyof typeof FILL }[] = [];
    const push = (key: string, c: [number, number, number], s: [number, number, number], m: keyof typeof FILL) => out.push({ key, depth: c[0] + c[2] + c[1] * 0.01, c, s, m });
    for (const wh of layout.warehouses) {
      for (const slot of wh.zones) {
        const filled = filledPallets(slot, usage.get(slot.zone.id)?.occupancy ?? 0);
        const n = slot.stacks.length;
        slot.stacks.forEach((stack, i) => {
          const levels = Math.floor(filled / n) + (i < filled % n ? 1 : 0);
          if (levels === 0) return;
          const h = (levels - 1) * PALLET.levelH + PALLET.h;
          push(`${slot.zone.id}-${i}`, [stack.x, 0.1 + h / 2, stack.z], [PALLET.w, h, PALLET.d], "pallet");
        });
      }
      for (const z of wh.doors) push(`${wh.warehouse.id}-door-${z}`, [wallX, 1.45, z], [0.5, 2.9, 3.3], "trim");
      for (const z of wh.trucks) {
        push(`${wh.warehouse.id}-trailer-${z}`, [wallX + 3.5, 1.9, z], [6, 3.1, TRUCK.width], "body");
        push(`${wh.warehouse.id}-cab-${z}`, [wallX + 7.8, 1.3, z], [1.8, 2.3, TRUCK.width - 0.2], "wall");
      }
    }
    for (const [i, p] of maintenanceProps(layout.maintenance).entries()) push(`mnt-${i}`, [p.x, p.h / 2, p.z], [p.w, p.h, p.d], p.m);
    return out.sort((a, b) => a.depth - b.depth);
  }, [layout, usage]);

  const moveFocus = (slot: MachineSlot, e: KeyboardEvent<SVGGElement>) => {
    const li = layout.lines.findIndex((l) => l.lineId === slot.lineId);
    const line = layout.lines[li];
    const si = line.machines.findIndex((m) => m.id === slot.id);
    let next: MachineSlot | undefined;
    if (e.key === "ArrowRight") next = line.machines[si + 1];
    else if (e.key === "ArrowLeft") next = line.machines[si - 1];
    else if (e.key === "ArrowDown") next = layout.lines[li + 1]?.machines[si];
    else if (e.key === "ArrowUp") next = layout.lines[li - 1]?.machines[si];
    else return;
    e.preventDefault();
    if (next) nodes.current.get(next.id)?.focus();
  };

  const activate = (e: KeyboardEvent<SVGGElement>, fn: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

  const dimLines = mode === "warehouse";
  const dimStores = mode === "production" || mode === "equipment";
  const showIds = mode === "equipment";

  const renderMachine = (slot: MachineSlot) => {
    const status = statusOf.get(slot.id) ?? "offline";
    const machine = lookup.machine(slot.id);
    const selected = selectedMachine === slot.id;
    const fp: Rect = { x: slot.x - MACHINE_FOOTPRINT.w / 2, z: slot.z - MACHINE_FOOTPRINT.d / 2, w: MACHINE_FOOTPRINT.w, d: MACHINE_FOOTPRINT.d };
    const hull = isoBox(slot.x, slot.height / 2, slot.z, fp.w, slot.height, fp.d);
    const mastTop = slot.height + BEACON.rise;
    const [bx, by] = iso(slot.x + BEACON.x, slot.z + BEACON.z, 0);
    const [, ty] = iso(slot.x + BEACON.x, slot.z + BEACON.z, mastTop);
    const stroke = selected ? "var(--forge)" : "var(--ink-3)";
    return (
      <g
        key={slot.id}
        ref={(el) => {
          if (el) nodes.current.set(slot.id, el);
          else nodes.current.delete(slot.id);
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={t("factory.aria.machine", { id: slot.id, name: machine ? tl(machine.name) : slot.id, status: td(`mstatus.${status}`) })}
        className="group/m cursor-pointer outline-none"
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ type: "machine", id: slot.id });
        }}
        onKeyDown={(e) => {
          activate(e, () => onSelect({ type: "machine", id: slot.id }));
          moveFocus(slot, e);
        }}
      >
        {/* Footprint: selection frame, keyboard focus frame, status strip. */}
        <polygon
          points={isoQuad(fp)}
          fill={selected ? "color-mix(in srgb, var(--forge) 14%, transparent)" : "transparent"}
          stroke={selected ? "var(--forge)" : "transparent"}
          strokeWidth={0.2}
          style={{ transition: "stroke 120ms, fill 120ms" }}
        />
        <polygon points={isoQuad({ x: fp.x - 0.3, z: fp.z - 0.3, w: fp.w + 0.6, d: fp.d + 0.6 })} fill="none" stroke="var(--ink)" strokeWidth={0.14} strokeDasharray="0.5 0.35" className="opacity-0 group-focus-visible/m:opacity-100" />
        <polygon points={isoQuad({ x: fp.x + 0.2, z: fp.z + fp.d - 0.3, w: fp.w - 0.4, d: 0.3 })} fill={statusVar(status)} />
        <g style={{ transform: selected ? "translateY(-0.45px)" : "none", transition: "transform 140ms cubic-bezier(0.2,0.7,0.2,1)" }}>
          {MACHINE_PARTS[slot.archetype].map((part, i) => (
            <IsoBox key={i} c={[slot.x + part.p[0], part.p[1], slot.z + part.p[2]]} s={part.s} m={part.m} stroke={stroke} />
          ))}
          <line x1={bx} y1={by} x2={bx} y2={ty} stroke="var(--ink-3)" strokeWidth={0.12} />
          <g transform={`translate(${bx.toFixed(2)} ${(ty - 0.5).toFixed(2)})`}>
            <circle r={1.05} fill="var(--base)" stroke="var(--line-2)" strokeWidth={0.08} />
            <GlyphShape status={status} r={0.62} />
          </g>
          {(showIds || selected) && (
            <text x={bx} y={ty - 2.2} fontSize={1.1} fontFamily="var(--font-mono)" fontWeight={600} textAnchor="middle" fill={selected ? "var(--forge-text)" : "var(--ink-2)"} style={{ paintOrder: "stroke", stroke: "var(--base)", strokeWidth: 0.35 }}>
              {slot.id}
            </text>
          )}
        </g>
        {/* Generous, invisible hit area. */}
        <g fill="transparent">
          <polygon points={hull.left} />
          <polygon points={hull.right} />
          <polygon points={hull.top} />
        </g>
      </g>
    );
  };

  const renderLine = (slot: LineSlot) => {
    const line = lookup.line(slot.lineId);
    const selected = selectedZone === slot.lineId;
    const cc = rectCenter(slot.conveyor);
    return (
      <g key={slot.lineId}>
        <g
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={t("factory.aria.zone", { code: slot.code, name: line ? tl(line.name) : "", status: line ? td(`lstatus.${line.status}`) : "" })}
          className="group/z cursor-pointer outline-none"
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ type: "zone", id: slot.lineId });
          }}
          onKeyDown={(e) => activate(e, () => onSelect({ type: "zone", id: slot.lineId }))}
        >
          <polygon
            points={isoQuad(slot.rect)}
            fill="var(--raised)"
            stroke={selected ? "var(--forge)" : "var(--line-2)"}
            strokeWidth={selected ? 0.22 : 0.08}
            style={{ transition: "stroke 120ms" }}
          />
          <polygon points={isoQuad({ x: slot.rect.x - 0.35, z: slot.rect.z - 0.35, w: slot.rect.w + 0.7, d: slot.rect.d + 0.7 })} fill="none" stroke="var(--ink)" strokeWidth={0.14} strokeDasharray="0.5 0.35" className="opacity-0 group-focus-visible/z:opacity-100" />
          <FloorLabel x={slot.rect.x + 2.1} z={slot.rect.z + slot.rect.d - 0.9} active={selected}>
            {slot.code}
          </FloorLabel>
        </g>
        {slot.machines.map(renderMachine)}
        <g style={{ pointerEvents: "none" }}>
          <IsoBox c={[cc.x, 0.275, cc.z]} s={[slot.conveyor.w, 0.55, slot.conveyor.d]} m="trim" />
        </g>
      </g>
    );
  };

  const b = layout.building;
  const aisle = layout.hall.x + layout.hall.w;
  const [a0x, a0y] = iso(aisle + 1.5, b.z + 1.5);
  const [a1x, a1y] = iso(aisle + 1.5, b.z + b.d - 1.5);

  return (
    <div dir="ltr" className="grid-bg h-full w-full overflow-auto overscroll-contain" style={{ touchAction: "pan-x pan-y pinch-zoom" }} onClick={() => onSelect(null)}>
      <div className="flex h-full min-h-full w-full min-w-full">
        <svg
          viewBox={view}
          role="group"
          aria-label={t("factory.map.aria")}
          preserveAspectRatio="xMidYMid meet"
          className="m-auto block shrink-0"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minWidth: Math.round(700 * zoom) }}
        >
          {/* Slab, apron, engineering grid */}
          <polygon points={isoQuad(layout.apron)} fill="color-mix(in srgb, var(--canvas) 55%, var(--base))" stroke="var(--line)" strokeWidth={0.08} />
          <polygon points={isoQuad(b)} fill="var(--base)" stroke="var(--line-2)" strokeWidth={0.14} />
          <path d={grid} stroke="var(--line)" strokeWidth={0.04} opacity={0.7} fill="none" />
          <line x1={a0x} y1={a0y} x2={a1x} y2={a1y} stroke="var(--line-2)" strokeWidth={0.1} strokeDasharray="1.2 0.8" />

          {/* Production hall */}
          <g opacity={dimLines ? 0.42 : 1} style={{ transition: "opacity 160ms" }}>
            {layout.lines.map(renderLine)}
          </g>

          {/* Stores, loading area, maintenance bay */}
          <g opacity={dimStores ? 0.42 : 1} style={{ transition: "opacity 160ms", pointerEvents: "none" }}>
            {layout.warehouses.map((wh) => (
              <g key={wh.warehouse.id}>
                <polygon points={isoQuad(wh.rect)} fill="none" stroke="var(--line-2)" strokeWidth={0.1} />
                {wh.zones.map((slot) => {
                  const occupancy = usage.get(slot.zone.id)?.occupancy ?? 0;
                  return (
                    <g key={slot.zone.id}>
                      <polygon points={isoQuad(slot.rect)} fill="var(--raised)" stroke="var(--line-2)" strokeWidth={0.06} />
                      {mode === "warehouse" && <polygon points={isoQuad(slot.rect)} fill={occupancyVar(occupancy)} opacity={0.2} />}
                    </g>
                  );
                })}
                {wh.doors.map((z) => {
                  const [x0, y0] = iso(layout.apron.x + 0.3, z - 1.9);
                  const [x1, y1] = iso(layout.apron.x + layout.apron.w - 1, z - 1.9);
                  const [x2, y2] = iso(layout.apron.x + 0.3, z + 1.9);
                  const [x3, y3] = iso(layout.apron.x + layout.apron.w - 1, z + 1.9);
                  return <path key={z} d={`M${x0} ${y0}L${x1} ${y1}M${x2} ${y2}L${x3} ${y3}`} stroke="var(--line-2)" strokeWidth={0.08} fill="none" />;
                })}
              </g>
            ))}
            <polygon points={isoQuad(layout.maintenance)} fill="var(--raised)" stroke="var(--line-2)" strokeWidth={0.08} />
            {eastObjects.map((o) => (
              <IsoBox key={o.key} c={o.c} s={o.s} m={o.m} />
            ))}
            {layout.warehouses.map((wh) =>
              mode === "warehouse" ? (
                wh.zones.map((slot) => {
                  const c = rectCenter(slot.rect);
                  const [sx, sy] = iso(c.x, c.z, slot.levels * PALLET.levelH + 1.2);
                  const occupancy = usage.get(slot.zone.id)?.occupancy ?? 0;
                  return (
                    <text key={slot.zone.id} x={sx} y={sy} fontSize={1.05} fontFamily="var(--font-mono)" fontWeight={600} textAnchor="middle" fill="var(--ink)" style={{ paintOrder: "stroke", stroke: "var(--base)", strokeWidth: 0.4 }}>
                      {slot.zone.code}
                      <tspan dx={0.5} fill={occupancyVar(occupancy)}>
                        {fmt.pct(occupancy, 0)}
                      </tspan>
                    </text>
                  );
                })
              ) : (
                <FloorLabel key={wh.warehouse.id} x={wh.rect.x + wh.rect.w / 2} z={wh.rect.z + wh.rect.d + 0.1}>
                  {wh.warehouse.code}
                </FloorLabel>
              ),
            )}
            <FloorLabel x={layout.maintenance.x + layout.maintenance.w / 2} z={layout.maintenance.z + layout.maintenance.d + 0.9}>
              {labels.maintenance}
            </FloorLabel>
            <FloorLabel x={layout.apron.x + layout.apron.w / 2} z={layout.apron.z + layout.apron.d + 1.1}>
              {labels.loading}
            </FloorLabel>
          </g>
        </svg>
      </div>
    </div>
  );
}
