"use client";
/**
 * 3D digital twin (react-three-fiber).
 *
 * Rendering budget:
 *  - frameloop="demand": a frame is drawn only when React commits a change,
 *    the camera moves, or a short transition is in flight. Idle GPU use is nil.
 *  - one unit box + one unit cylinder scaled into every part, shared materials
 *    (three-kit.ts), pallets and conveyor carriers instanced, every blueprint
 *    line merged into a single LineSegments.
 *  - no shadows, no post-processing, no textures, fonts or HDR maps.
 */
import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, ReactNode } from "react";
import { Object3D, Vector3, type Group, type InstancedMesh, type Material } from "three";
import type { MachineStatus } from "@/domain/types";
import { cn } from "@/components/ui/primitives";
import { useFmt } from "@/lib/format";
import type { Theme } from "@/store/prefs";
import { useForge } from "@/store/store";
import {
  BEACON,
  MACHINE_FOOTPRINT,
  MACHINE_PARTS,
  PALLET,
  TRUCK,
  filledPallets,
  maintenanceProps,
  rectCenter,
  type FactoryLayout,
  type LineSlot,
  type MachineSlot,
  type Rect,
} from "./layout";
import type { TwinViewProps, ViewMode } from "./shared";
import { GEO, LineBuilder, MAT, applyPalette } from "./three-kit";

export interface FactorySceneProps extends TwinViewProps {
  theme: Theme;
  reducedMotion: boolean;
  /** Bump to fly the camera back to the current preset. */
  resetKey: number;
}

type V3 = [number, number, number];

const WALL_H = 1.4;
const ROOF_H = 7.5;
const CONVEYOR_H = 0.55;
const CARRIERS_PER_LINE = 7;
/** Longest frame delta used by transitions (the demand loop can sleep for seconds). */
const MAX_DT = 0.05;

const noRaycast = () => null;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function setCursor(e: ThreeEvent<PointerEvent>, cursor: string) {
  (e.nativeEvent.target as HTMLElement | null)?.style?.setProperty("cursor", cursor);
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

function cameraPreset(mode: ViewMode, layout: FactoryLayout, aspect: number): { position: V3; target: V3 } {
  // Narrow (portrait) canvases need more distance to keep the plant in frame.
  const k = Math.min(2.8, Math.max(1, 1.75 / Math.max(0.3, aspect)));
  const at = (c: { x: number; z: number }, r: number, dir: V3) => ({
    target: [c.x, 0, c.z] as V3,
    position: [c.x + dir[0] * r * k, dir[1] * r * k, c.z + dir[2] * r * k] as V3,
  });
  const hallR = Math.max(layout.hall.w, layout.hall.d);
  switch (mode) {
    case "production":
      return at(rectCenter(layout.hall), hallR * 1.15, [0.3, 0.8, 0.85]);
    case "warehouse":
      return at({ x: layout.storage.x + layout.storage.w / 2 + 3, z: layout.storage.z + layout.storage.d / 2 }, Math.max(36, layout.storage.d + 8) * 1.1, [0.85, 0.78, 0.45]);
    case "equipment":
      return at(rectCenter(layout.hall), hallR * 1.25, [0.04, 1.2, 0.5]);
    default:
      return at(rectCenter(layout.bounds), Math.max(layout.bounds.w, layout.bounds.d * 1.5) * 1.12, [0.42, 0.66, 0.78]);
  }
}

interface Flight {
  mode: ViewMode;
  layout: FactoryLayout;
  t: number;
  started: boolean;
  from: Vector3;
  to: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
}

function CameraRig({ layout, mode, resetKey, reducedMotion }: { layout: FactoryLayout; mode: ViewMode; resetKey: number; reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const invalidate = useThree((s) => s.invalidate);
  const flight = useRef<Flight | null>(null);
  const first = useRef(true);
  const reduced = useRef(reducedMotion);

  useEffect(() => {
    reduced.current = reducedMotion;
  }, [reducedMotion]);

  // A new preset (view mode, factory, or an explicit reset) starts a flight.
  useEffect(() => {
    flight.current = {
      mode,
      layout,
      t: first.current || reduced.current ? 1 : 0,
      started: false,
      from: new Vector3(),
      to: new Vector3(),
      fromTarget: new Vector3(),
      toTarget: new Vector3(),
    };
    first.current = false;
    invalidate();
  }, [mode, layout, resetKey, invalidate]);

  useFrame((state, dt) => {
    const f = flight.current;
    const c = controls.current;
    if (!f || !c) return;
    if (!f.started) {
      const preset = cameraPreset(f.mode, f.layout, state.size.width / Math.max(1, state.size.height));
      f.to.set(...preset.position);
      f.toTarget.set(...preset.target);
      f.from.copy(state.camera.position);
      f.fromTarget.copy(c.target);
      f.started = true;
    }
    f.t = Math.min(1, f.t + Math.min(dt, MAX_DT) / 0.7);
    const k = ease(f.t);
    state.camera.position.lerpVectors(f.from, f.to, k);
    c.target.lerpVectors(f.fromTarget, f.toTarget, k);
    c.update();
    if (f.t >= 1) flight.current = null;
    else state.invalidate();
  });

  const limits = useMemo(() => {
    const b = layout.bounds;
    return { min: new Vector3(b.x - 4, 0, b.z - 4), max: new Vector3(b.x + b.w + 4, 0, b.z + b.d + 4), far: Math.max(b.w, b.d) * 3 };
  }, [layout]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      screenSpacePanning={false}
      minDistance={12}
      maxDistance={limits.far}
      minPolarAngle={0.1}
      maxPolarAngle={1.42}
      onStart={() => {
        flight.current = null;
      }}
      onChange={() => {
        // Keep the orbit pivot on the plant.
        controls.current?.target.clamp(limits.min, limits.max);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

/** Floating technical label. Uses the DOM so it follows the app fonts and theme. */
function Tag({ position, children, active }: { position: V3; children: ReactNode; active?: boolean }) {
  return (
    <Html position={position} center pointerEvents="none" zIndexRange={[5, 0]}>
      <span
        dir="ltr"
        className={cn(
          "pointer-events-none flex select-none items-center gap-1 whitespace-nowrap rounded-sm border px-1 py-0.5 font-mono text-[10px] leading-none",
          active ? "border-forge bg-base text-ink" : "border-line-2 bg-base/85 text-ink-2",
        )}
      >
        {children}
      </span>
    </Html>
  );
}

/** Four thin bars around a rectangle — the selection mark. */
function SelectionFrame({ rect, y = 0.1, t = 0.16 }: { rect: Rect; y?: number; t?: number }) {
  const cx = rect.x + rect.w / 2;
  const cz = rect.z + rect.d / 2;
  return (
    <group>
      <mesh geometry={GEO.box} material={MAT.select} position={[cx, y, rect.z]} scale={[rect.w + t, 0.06, t]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={MAT.select} position={[cx, y, rect.z + rect.d]} scale={[rect.w + t, 0.06, t]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={MAT.select} position={[rect.x, y, cz]} scale={[t, 0.06, rect.d + t]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={MAT.select} position={[rect.x + rect.w, y, cz]} scale={[t, 0.06, rect.d + t]} raycast={noRaycast} />
    </group>
  );
}

/** A box with hairline edges. */
function Block({ position, scale, material, edges = true }: { position: V3; scale: V3; material: Material; edges?: boolean }) {
  return (
    <>
      <mesh geometry={GEO.box} material={material} position={position} scale={scale} raycast={noRaycast} />
      {edges && <lineSegments geometry={GEO.boxEdges} material={MAT.edge} position={position} scale={scale} raycast={noRaycast} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Building shell                                                      */
/* ------------------------------------------------------------------ */

function Shell({ layout, ghost }: { layout: FactoryLayout; ghost: boolean }) {
  const { building: b, apron } = layout;

  const { lines, grid } = useMemo(() => {
    const lb = new LineBuilder();
    // Ghost roof volume and the back-wall columns.
    lb.frame(b, 0.02, ROOF_H);
    for (let x = 10; x < b.w; x += 10) lb.segment(b.x + x, 0, b.z, b.x + x, ROOF_H, b.z);
    for (let z = 10; z < b.d; z += 10) lb.segment(b.x, 0, b.z + z, b.x, ROOF_H, b.z + z);
    // Main aisle between the production hall and the stores.
    const aisle = layout.hall.x + layout.hall.w;
    lb.segment(aisle + 0.4, 0.03, 1.5, aisle + 0.4, 0.03, b.d - 1.5).segment(aisle + 2.6, 0.03, 1.5, aisle + 2.6, 0.03, b.d - 1.5);
    for (const line of layout.lines) lb.rect(line.rect, 0.075);
    for (const wh of layout.warehouses) {
      lb.rect(wh.rect, 0.03);
      for (const slot of wh.zones) {
        lb.rect(slot.rect, 0.075);
        if (!slot.racked) continue;
        // One rack frame per row of stacks.
        const rows = [...new Set(slot.stacks.map((s) => s.x))];
        for (const x of rows) lb.frame({ x: x - 0.6, z: slot.rect.z + 0.25, w: 1.2, d: slot.rect.d - 0.5 }, 0.08, slot.levels * PALLET.levelH + 0.15);
      }
      // Truck lanes on the apron.
      for (const door of wh.doors) {
        lb.segment(apron.x + 0.3, 0.02, door - 1.9, apron.x + apron.w - 1, 0.02, door - 1.9);
        lb.segment(apron.x + 0.3, 0.02, door + 1.9, apron.x + apron.w - 1, 0.02, door + 1.9);
      }
    }
    lb.rect(layout.maintenance, 0.075);
    // Overhead hoist frame in the maintenance bay.
    const m = layout.maintenance;
    lb.frame({ x: m.x + 4, z: m.z + 3.6, w: 5, d: 3.2 }, 0.08, 3.4);
    lb.rect(apron, 0.02);

    const gb = new LineBuilder();
    for (let x = 2; x < b.w; x += 2) gb.segment(b.x + x, 0.012, b.z + 0.2, b.x + x, 0.012, b.z + b.d - 0.2);
    for (let z = 2; z < b.d; z += 2) gb.segment(b.x + 0.2, 0.012, b.z + z, b.x + b.w - 0.2, 0.012, b.z + z);
    return { lines: lb.build(), grid: gb.build() };
  }, [layout, b, apron]);

  useEffect(
    () => () => {
      lines.dispose();
      grid.dispose();
    },
    [lines, grid],
  );

  const wall = ghost ? MAT.ghost : MAT.wall;
  const cx = b.x + b.w / 2;
  const cz = b.z + b.d / 2;
  return (
    <group>
      <mesh geometry={GEO.box} material={MAT.floor} position={[cx, -0.1, cz]} scale={[b.w, 0.2, b.d]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={MAT.apron} position={[apron.x + apron.w / 2, -0.12, apron.z + apron.d / 2]} scale={[apron.w, 0.2, apron.d]} raycast={noRaycast} />
      <lineSegments geometry={grid} material={MAT.grid} raycast={noRaycast} />
      <lineSegments geometry={lines} material={MAT.lines} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={wall} position={[cx, WALL_H / 2, b.z]} scale={[b.w + 0.3, WALL_H, 0.3]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={wall} position={[cx, WALL_H / 2, b.z + b.d]} scale={[b.w + 0.3, WALL_H, 0.3]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={wall} position={[b.x, WALL_H / 2, cz]} scale={[0.3, WALL_H, b.d]} raycast={noRaycast} />
      <mesh geometry={GEO.box} material={wall} position={[b.x + b.w, WALL_H / 2, cz]} scale={[0.3, WALL_H, b.d]} raycast={noRaycast} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Production zones & machines                                         */
/* ------------------------------------------------------------------ */

function LineZone({ slot, selected, onSelect }: { slot: LineSlot; selected: boolean; onSelect: TwinViewProps["onSelect"] }) {
  const { rect, conveyor } = slot;
  const c = rectCenter(rect);
  const cc = rectCenter(conveyor);
  return (
    <group>
      <mesh
        geometry={GEO.box}
        material={MAT.plate}
        position={[c.x, 0.03, c.z]}
        scale={[rect.w, 0.06, rect.d]}
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onSelect({ type: "zone", id: slot.lineId });
        }}
        onPointerOver={(e) => setCursor(e, "pointer")}
        onPointerOut={(e) => setCursor(e, "")}
      />
      <Block position={[cc.x, CONVEYOR_H / 2 + 0.06, cc.z]} scale={[conveyor.w, CONVEYOR_H, conveyor.d]} material={MAT.trim} />
      {selected && <SelectionFrame rect={rect} />}
      <Tag position={[rect.x + 1.6, 0.4, rect.z + rect.d - 0.7]} active={selected}>
        {slot.code}
      </Tag>
    </group>
  );
}

function MachineMesh({
  slot,
  status,
  selected,
  showLabel,
  reducedMotion,
  onSelect,
}: {
  slot: MachineSlot;
  status: MachineStatus;
  selected: boolean;
  showLabel: boolean;
  reducedMotion: boolean;
  onSelect: TwinViewProps["onSelect"];
}) {
  const lift = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    invalidate();
  }, [selected, invalidate]);

  // Selected machine lifts off the floor: ~150 ms, then the loop goes back to sleep.
  useFrame((state, dt) => {
    const g = lift.current;
    if (!g) return;
    const target = selected ? 0.45 : 0;
    const d = target - g.position.y;
    if (d === 0) return;
    if (reducedMotion || Math.abs(d) < 0.004) {
      g.position.y = target;
      return;
    }
    g.position.y += d * Math.min(1, Math.min(dt, MAX_DT) * 16);
    state.invalidate();
  });

  const parts = MACHINE_PARTS[slot.archetype];
  const edge = selected ? MAT.edgeSelected : MAT.edge;
  const lamp = MAT.status[status];
  const mastTop = slot.height + BEACON.rise;
  const footprint: Rect = { x: slot.x - MACHINE_FOOTPRINT.w / 2, z: slot.z - MACHINE_FOOTPRINT.d / 2, w: MACHINE_FOOTPRINT.w, d: MACHINE_FOOTPRINT.d };

  return (
    <group>
      {selected && <SelectionFrame rect={footprint} y={0.12} t={0.14} />}
      <group
        ref={lift}
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onSelect({ type: "machine", id: slot.id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(e, "pointer");
        }}
        onPointerOut={(e) => setCursor(e, "")}
      >
        <group position={[slot.x, 0.06, slot.z]}>
          {parts.map((part, i) => (
            <group key={i} position={part.p as V3} scale={part.s as V3}>
              <mesh geometry={part.g === "box" ? GEO.box : GEO.cyl} material={MAT[part.m]} />
              {part.g === "box" && part.m !== "glass" && <lineSegments geometry={GEO.boxEdges} material={edge} raycast={noRaycast} />}
            </group>
          ))}
          {/* Status strip along the operator side + beacon mast. */}
          <mesh geometry={GEO.box} material={lamp} position={[0, 0.04, MACHINE_FOOTPRINT.d / 2 - 0.05]} scale={[MACHINE_FOOTPRINT.w - 0.4, 0.07, 0.2]} />
          <mesh geometry={GEO.box} material={MAT.trim} position={[BEACON.x, mastTop / 2, BEACON.z]} scale={[0.09, mastTop, 0.09]} raycast={noRaycast} />
          <mesh geometry={GEO.box} material={lamp} position={[BEACON.x, mastTop + 0.2, BEACON.z]} scale={[0.42, 0.42, 0.42]} />
        </group>
        {showLabel && (
          <Tag position={[slot.x + BEACON.x, slot.height + BEACON.rise + 1.25, slot.z + BEACON.z]} active={selected}>
            {slot.id}
          </Tag>
        )}
      </group>
    </group>
  );
}

/**
 * Work pieces on the conveyors. On running lines they advance half a pitch per
 * simulation tick (one short eased step every few seconds) — never a
 * free-running loop, and not at all when reduced motion is on.
 */
function Carriers({ layout, runningLines, reducedMotion }: { layout: FactoryLayout; runningLines: Set<string>; reducedMotion: boolean }) {
  const tick = useForge((s) => s.tick);
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<InstancedMesh>(null);
  const anim = useRef({ value: 0, from: 0, to: 0, t: 1, dirty: true });
  const dummy = useMemo(() => new Object3D(), []);
  const count = layout.lines.length * CARRIERS_PER_LINE;

  useEffect(() => {
    const a = anim.current;
    const target = reducedMotion ? 0 : tick;
    if (reducedMotion || Math.abs(target - a.value) > 1.5) {
      a.value = a.from = a.to = target;
      a.t = 1;
    } else {
      a.from = a.value;
      a.to = target;
      a.t = 0;
    }
    a.dirty = true;
    invalidate();
  }, [tick, reducedMotion, layout, runningLines, invalidate]);

  useFrame((state, dt) => {
    const a = anim.current;
    const m = mesh.current;
    if (!m || (!a.dirty && a.t >= 1)) return;
    if (a.t < 1) {
      a.t = Math.min(1, a.t + Math.min(dt, MAX_DT) / 0.8);
      a.value = a.from + (a.to - a.from) * ease(a.t);
    }
    a.dirty = false;
    let i = 0;
    for (const line of layout.lines) {
      const phase = runningLines.has(line.lineId) ? a.value * 0.5 : 0;
      const span = line.conveyor.w - 1.2;
      const z = line.conveyor.z + line.conveyor.d / 2;
      for (let n = 0; n < CARRIERS_PER_LINE; n++) {
        const u = (((n + phase) % CARRIERS_PER_LINE) + CARRIERS_PER_LINE) % CARRIERS_PER_LINE;
        dummy.position.set(line.conveyor.x + 0.6 + (u / CARRIERS_PER_LINE) * span, CONVEYOR_H + 0.06 + 0.2, z);
        dummy.scale.set(0.7, 0.4, 0.66);
        dummy.updateMatrix();
        m.setMatrixAt(i++, dummy.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (a.t < 1) state.invalidate();
  });

  if (count === 0) return null;
  return <instancedMesh key={count} ref={mesh} args={[GEO.box, undefined, count]} material={MAT.body} frustumCulled={false} raycast={noRaycast} />;
}

/* ------------------------------------------------------------------ */
/* Warehouse, loading area, maintenance bay                            */
/* ------------------------------------------------------------------ */

function OccupancyTag({ code, occupancy }: { code: string; occupancy: number }) {
  const fmt = useFmt();
  return (
    <>
      <span>{code}</span>
      <span className="num text-ink">{fmt.pct(occupancy, 0)}</span>
    </>
  );
}

/** Every pallet in the factory's stores: one instanced draw call. Fill follows live stock. */
function Pallets({ layout, usage, ghost }: { layout: FactoryLayout; usage: TwinViewProps["usage"]; ghost: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const positions = useMemo(() => {
    const out: number[] = [];
    for (const wh of layout.warehouses) {
      for (const slot of wh.zones) {
        const filled = filledPallets(slot, usage.get(slot.zone.id)?.occupancy ?? 0);
        for (let k = 0; k < filled; k++) {
          const stack = slot.stacks[k % slot.stacks.length];
          const level = Math.floor(k / slot.stacks.length);
          out.push(stack.x, 0.1 + level * PALLET.levelH + PALLET.h / 2, stack.z);
        }
      }
    }
    return out;
  }, [layout, usage]);
  const count = positions.length / 3;

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    dummy.scale.set(PALLET.w, PALLET.h, PALLET.d);
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [positions, count, invalidate]);

  if (count === 0) return null;
  return <instancedMesh key={count} ref={mesh} args={[GEO.box, undefined, count]} material={ghost ? MAT.ghost : MAT.pallet} frustumCulled={false} raycast={noRaycast} />;
}

function Stores({ layout, usage, mode, labels }: Pick<TwinViewProps, "layout" | "usage" | "mode" | "labels">) {
  const ghost = mode === "equipment";
  const wallX = layout.building.x + layout.building.w;
  return (
    <group>
      <Pallets layout={layout} usage={usage} ghost={ghost} />
      {layout.warehouses.map((wh) => (
        <group key={wh.warehouse.id}>
          {wh.zones.map((slot) => {
            const c = rectCenter(slot.rect);
            const occupancy = usage.get(slot.zone.id)?.occupancy ?? 0;
            const wash = occupancy >= 0.9 ? MAT.occupancy.danger : occupancy >= 0.75 ? MAT.occupancy.warn : MAT.occupancy.ok;
            return (
              <group key={slot.zone.id}>
                <mesh geometry={GEO.box} material={MAT.plate} position={[c.x, 0.03, c.z]} scale={[slot.rect.w, 0.06, slot.rect.d]} raycast={noRaycast} />
                {mode === "warehouse" && (
                  <>
                    <mesh geometry={GEO.box} material={wash} position={[c.x, 0.09, c.z]} scale={[slot.rect.w, 0.04, slot.rect.d]} raycast={noRaycast} />
                    <Tag position={[c.x, slot.levels * PALLET.levelH + 1.5, c.z]}>
                      <OccupancyTag code={slot.zone.code} occupancy={occupancy} />
                    </Tag>
                  </>
                )}
              </group>
            );
          })}
          {mode !== "warehouse" && <Tag position={[wh.rect.x + 1.8, 0.4, wh.rect.z + wh.rect.d - 0.6]}>{wh.warehouse.code}</Tag>}
          {wh.doors.map((z) => (
            <Block key={z} position={[wallX, 1.45, z]} scale={[0.5, 2.9, 3.3]} material={ghost ? MAT.ghost : MAT.trim} edges={!ghost} />
          ))}
          {wh.trucks.map((z) => (
            <group key={z}>
              <Block position={[wallX + 0.5 + TRUCK.length / 2, 0.6, z]} scale={[TRUCK.length, 0.5, TRUCK.width - 0.3]} material={MAT.trim} edges={false} />
              <Block position={[wallX + 0.5 + 3, 2.15, z]} scale={[6, 2.6, TRUCK.width]} material={MAT.body} />
              <Block position={[wallX + 0.5 + 6.4 + 0.9, 1.75, z]} scale={[1.8, 1.9, TRUCK.width - 0.2]} material={MAT.wall} />
            </group>
          ))}
        </group>
      ))}
      <Tag position={[layout.apron.x + layout.apron.w - 2.5, 0.4, layout.apron.z + layout.apron.d - 0.8]}>{labels.loading}</Tag>
    </group>
  );
}

function MaintenanceBay({ bay, label }: { bay: Rect; label: string }) {
  const c = rectCenter(bay);
  return (
    <group>
      <mesh geometry={GEO.box} material={MAT.plate} position={[c.x, 0.03, c.z]} scale={[bay.w, 0.06, bay.d]} raycast={noRaycast} />
      {maintenanceProps(bay).map((p, i) => (
        <Block key={i} position={[p.x, 0.06 + p.h / 2, p.z]} scale={[p.w, p.h, p.d]} material={MAT[p.m]} />
      ))}
      <Tag position={[bay.x + 1.9, 0.4, bay.z + bay.d - 0.6]}>{label}</Tag>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function World({ layout, statusOf, runningLines, usage, mode, selection, onSelect, labels, theme, reducedMotion, resetKey }: FactorySceneProps) {
  const invalidate = useThree((s) => s.invalidate);

  // Theme tokens → shared materials.
  useEffect(() => {
    applyPalette();
    invalidate();
  }, [theme, invalidate]);

  // Any committed change (status, selection, mode…) needs exactly one new frame.
  useEffect(() => {
    invalidate();
  });

  const selectedMachine = selection?.type === "machine" ? selection.id : null;
  const selectedZone = selection?.type === "zone" ? selection.id : null;

  return (
    <group dispose={null}>
      <ambientLight intensity={1.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.9} />
      <CameraRig layout={layout} mode={mode} resetKey={resetKey} reducedMotion={reducedMotion} />
      <Shell layout={layout} ghost={mode === "equipment"} />
      {layout.lines.map((slot) => (
        <group key={slot.lineId}>
          <LineZone slot={slot} selected={selectedZone === slot.lineId} onSelect={onSelect} />
          {slot.machines.map((m) => (
            <MachineMesh
              key={m.id}
              slot={m}
              status={statusOf.get(m.id) ?? "offline"}
              selected={selectedMachine === m.id}
              showLabel={mode === "equipment" || selectedMachine === m.id}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
            />
          ))}
        </group>
      ))}
      <Carriers layout={layout} runningLines={runningLines} reducedMotion={reducedMotion} />
      <Stores layout={layout} usage={usage} mode={mode} labels={labels} />
      <MaintenanceBay bay={layout.maintenance} label={labels.maintenance} />
    </group>
  );
}

function FactoryScene(props: FactorySceneProps) {
  const [camera] = useState(() => cameraPreset("overview", props.layout, 1.6).position);
  const { onSelect } = props;
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 34, near: 2, far: 900, position: camera }}
      onPointerMissed={() => onSelect(null)}
    >
      <World {...props} />
    </Canvas>
  );
}

export default memo(FactoryScene);
