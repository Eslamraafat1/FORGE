/**
 * Digital-twin floor plan. Pure geometry generated from the dataset and shared
 * by the 3D scene and the 2D isometric map, so both always show the same plant.
 *
 * World units are metres-ish. X runs along the production lines (west → east),
 * Z runs across them (north → south), Y is up. The default viewpoint sits at
 * +X/+Z looking back at the origin.
 */
import type { ID, Machine, ProductionLine, Warehouse, WarehouseZone, ZoneKind } from "@/domain/types";

/** The structural subset of the dataset the plan depends on (serialisable, so it can be used as a memo key). */
export interface LayoutSpec {
  lines: Pick<ProductionLine, "id" | "code">[];
  machines: Pick<Machine, "id" | "lineId" | "station" | "kind">[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  /** Shipments physically on site, per warehouse. */
  trucksOnSite: Record<ID, number>;
}

export interface Rect {
  /** Min corner. */
  x: number;
  z: number;
  /** Extent along X. */
  w: number;
  /** Extent along Z. */
  d: number;
}

export const rectCenter = (r: Rect) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 });

/* ------------------------------------------------------------------ */
/* Machine silhouettes                                                 */
/* ------------------------------------------------------------------ */

export type Archetype = "cnc" | "robot" | "furnace" | "bench" | "press" | "pack";
export type PartMaterial = "body" | "trim" | "glass";

export interface Part {
  g: "box" | "cyl";
  /** Centre, local to the machine origin (floor centre). +Z faces the conveyor. */
  p: readonly [number, number, number];
  /** Size (for cylinders: diameter, height, diameter). */
  s: readonly [number, number, number];
  m: PartMaterial;
}

const box = (p: Part["p"], s: Part["s"], m: PartMaterial = "body"): Part => ({ g: "box", p, s, m });
const cyl = (p: Part["p"], s: Part["s"], m: PartMaterial = "body"): Part => ({ g: "cyl", p, s, m });

/** Painter's order for the isometric map: far parts first, stacked parts last. */
function paintOrder(parts: Part[]): Part[] {
  const sorted: Part[] = [];
  const behind = (a: Part, b: Part) => {
    const aMin = a.p[1] - a.s[1] / 2;
    const bMin = b.p[1] - b.s[1] / 2;
    if (aMin >= b.p[1] + b.s[1] / 2 - 0.01) return false; // a sits on top of b
    if (bMin >= a.p[1] + a.s[1] / 2 - 0.01) return true;
    return a.p[0] + a.p[2] <= b.p[0] + b.p[2];
  };
  for (const part of parts) {
    let i = sorted.length;
    while (i > 0 && !behind(sorted[i - 1], part)) i--;
    sorted.splice(i, 0, part);
  }
  return sorted;
}

/** Low-poly part lists. Every machine fits a 4.6 × 3.4 footprint. */
export const MACHINE_PARTS: Record<Archetype, Part[]> = {
  // Enclosed machining centre: cabinet, viewing window, cable duct, control pedestal.
  cnc: paintOrder([
    box([-0.3, 1.2, 0], [3.8, 2.4, 2.6]),
    box([-0.5, 1.45, 1.31], [1.9, 1.0, 0.06], "glass"),
    box([-0.9, 2.55, -0.3], [1.4, 0.3, 1.2], "trim"),
    box([2.0, 0.7, 0.9], [0.5, 1.4, 0.5], "trim"),
  ]),
  // Robot cell: plinth, turret, two-link arm, tool, guard posts.
  robot: paintOrder([
    box([0, 0.1, 0], [4.4, 0.2, 3.2], "trim"),
    box([-2.1, 0.9, -1.5], [0.1, 1.4, 0.1], "trim"),
    box([2.1, 0.9, -1.5], [0.1, 1.4, 0.1], "trim"),
    cyl([0, 0.6, 0], [0.9, 0.8, 0.9]),
    box([0, 1.75, 0], [0.4, 1.5, 0.4]),
    box([0.75, 2.66, 0], [1.9, 0.32, 0.32]),
    box([1.55, 2.2, 0], [0.24, 0.6, 0.24], "trim"),
    box([-2.1, 0.9, 1.5], [0.1, 1.4, 0.1], "trim"),
    box([2.1, 0.9, 1.5], [0.1, 1.4, 0.1], "trim"),
  ]),
  // Furnace / oven: tall chamber, charging door, hood, exhaust stack.
  furnace: paintOrder([
    box([0, 1.5, 0], [3.6, 3.0, 3.0]),
    box([0, 1.1, 1.51], [1.6, 1.5, 0.08], "trim"),
    box([0, 3.2, 0], [2.4, 0.4, 2.0], "trim"),
    cyl([0.6, 4.15, -0.4], [0.7, 1.5, 0.7]),
  ]),
  // Test / measuring bench: table, fixture, portal frame, operator screen.
  bench: paintOrder([
    box([0, 0.5, 0], [3.8, 1.0, 2.0]),
    box([-1.6, 1.8, -0.7], [0.2, 1.6, 0.2], "trim"),
    box([1.6, 1.8, -0.7], [0.2, 1.6, 0.2], "trim"),
    box([0, 2.71, -0.7], [3.6, 0.22, 0.3], "trim"),
    box([-0.5, 1.25, 0.1], [1.0, 0.5, 0.9], "trim"),
    box([1.2, 1.3, 0.5], [0.9, 0.6, 0.08], "glass"),
  ]),
  // Press / casting frame: bed, two columns, crown, ram.
  press: paintOrder([
    box([0, 0.4, 0], [3.2, 0.8, 2.0]),
    box([-1.25, 1.95, 0], [0.7, 2.3, 1.2]),
    box([0, 2.6, 0], [1.2, 1.0, 0.9], "trim"),
    box([1.25, 1.95, 0], [0.7, 2.3, 1.2]),
    box([0, 3.55, 0], [3.2, 0.9, 1.5]),
  ]),
  // Packaging / placement line: belt bed, tunnel, carton, pallet.
  pack: paintOrder([
    box([0, 0.5, -0.2], [4.4, 1.0, 1.5]),
    box([-0.6, 1.7, -0.2], [1.3, 1.4, 1.9], "trim"),
    box([1.5, 1.35, -0.2], [0.8, 0.7, 0.8]),
    box([1.7, 0.35, 1.2], [0.9, 0.7, 0.8], "trim"),
  ]),
};

export const MACHINE_HEIGHT: Record<Archetype, number> = Object.fromEntries(
  (Object.keys(MACHINE_PARTS) as Archetype[]).map((k) => [k, Math.max(...MACHINE_PARTS[k].map((p) => p.p[1] + p.s[1] / 2))]),
) as Record<Archetype, number>;

export const MACHINE_FOOTPRINT = { w: 4.8, d: 3.6 };
/** Beacon mast position, local to the machine. */
export const BEACON = { x: -2.05, z: -1.45, rise: 0.9 };

/** Picks a silhouette from the machine kind (falls back to the station position). */
export function archetypeOf(m: Pick<Machine, "kind" | "station">): Archetype {
  const k = m.kind.en.toLowerCase();
  if (/furnace|oven|heat/.test(k)) return "furnace";
  if (/robot|weld|assembly|coating/.test(k)) return "robot";
  if (/press|casting|blast/.test(k)) return "press";
  if (/test|calibration|measuring|inspection/.test(k)) return "bench";
  if (/packag|placement/.test(k)) return "pack";
  if (/cnc|mill|lathe|hobb|machin|winding/.test(k)) return "cnc";
  return (["cnc", "robot", "bench", "pack"] as const)[m.station % 4];
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export interface MachineSlot {
  id: ID;
  lineId: ID;
  station: number;
  /** Centre on the floor. */
  x: number;
  z: number;
  archetype: Archetype;
  height: number;
}

export interface LineSlot {
  lineId: ID;
  code: string;
  rect: Rect;
  conveyor: Rect;
  machines: MachineSlot[];
}

export interface StackSlot {
  x: number;
  z: number;
}

export interface StorageSlot {
  zone: WarehouseZone;
  rect: Rect;
  /** Pallet levels per stack position. */
  levels: number;
  racked: boolean;
  stacks: StackSlot[];
}

export interface WarehouseSlot {
  warehouse: Warehouse;
  rect: Rect;
  zones: StorageSlot[];
  /** Dock door centres (Z) on the east wall. */
  doors: number[];
  /** Trucks standing at the doors (one per on-site shipment, capped). */
  trucks: number[];
}

export interface FactoryLayout {
  /** Building footprint. */
  building: Rect;
  hall: Rect;
  lines: LineSlot[];
  warehouses: WarehouseSlot[];
  /** Bounding box of the warehouse block. */
  storage: Rect;
  maintenance: Rect;
  /** Paved loading apron outside the east wall. */
  apron: Rect;
  /** Everything, including the apron. */
  bounds: Rect;
}

const LINE_PITCH = 10;
const ZONE = { x: 2, w: 30, d: 8 };
const HALL_W = 34;
const EAST = { x: 37, w: 22 };
const BUILDING_W = 61;
const APRON_W = 14;
const STATION_PITCH = ZONE.w / 4;

export const PALLET = { w: 0.95, h: 0.8, d: 0.85, pitchX: 1.9, pitchZ: 1.25, levelH: 1.05 };
export const TRUCK = { length: 8.4, width: 2.6 };

const LEVELS: Record<ZoneKind, number> = { rack: 3, cold: 3, cage: 2, bulk: 1, staging: 1, dock: 1 };

export function buildLayout(input: LayoutSpec): FactoryLayout {
  const n = Math.max(1, input.lines.length);
  const depth = Math.max(n * LINE_PITCH + 2, 28);
  const z0 = (depth - n * LINE_PITCH) / 2;

  const lines: LineSlot[] = input.lines.map((line, i) => {
    const rect: Rect = { x: ZONE.x, z: z0 + i * LINE_PITCH + 1, w: ZONE.w, d: ZONE.d };
    const machines = input.machines
      .filter((m) => m.lineId === line.id)
      .sort((a, b) => a.station - b.station)
      .map((m, order): MachineSlot => {
        const archetype = archetypeOf(m);
        return {
          id: m.id,
          lineId: line.id,
          station: m.station,
          x: rect.x + STATION_PITCH * (order + 0.5),
          z: rect.z + 2.6,
          archetype,
          height: MACHINE_HEIGHT[archetype],
        };
      });
    return { lineId: line.id, code: line.code, rect, conveyor: { x: rect.x + 0.8, z: rect.z + 5.6, w: rect.w - 1.6, d: 1.1 }, machines };
  });

  // East block: warehouses stacked north → south, maintenance bay in the south-east corner.
  const storageDepth = depth - 14;
  const count = Math.max(1, input.warehouses.length);
  const gap = 1;
  const whDepth = (storageDepth - gap * (count - 1)) / count;
  const warehouses: WarehouseSlot[] = input.warehouses.map((warehouse, i) => {
    const rect: Rect = { x: EAST.x, z: 2 + i * (whDepth + gap), w: EAST.w, d: whDepth };
    const inner: Rect = { x: rect.x + 0.6, z: rect.z + 0.6, w: rect.w - 1.2, d: rect.d - 1.2 };
    // The warehouse grid is turned so its dock rows (highest y) meet the east wall.
    const zones = input.zones
      .filter((zn) => zn.warehouseId === warehouse.id)
      .map((zone): StorageSlot => {
        const r: Rect = {
          x: inner.x + (zone.y / warehouse.rows) * inner.w + 0.2,
          z: inner.z + (zone.x / warehouse.cols) * inner.d + 0.2,
          w: (zone.h / warehouse.rows) * inner.w - 0.4,
          d: (zone.w / warehouse.cols) * inner.d - 0.4,
        };
        const nx = Math.max(1, Math.floor((r.w - 1) / PALLET.pitchX) + 1);
        const nz = Math.max(1, Math.floor((r.d - 1) / PALLET.pitchZ) + 1);
        const ox = r.x + (r.w - (nx - 1) * PALLET.pitchX) / 2;
        const oz = r.z + (r.d - (nz - 1) * PALLET.pitchZ) / 2;
        const stacks: StackSlot[] = [];
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) stacks.push({ x: ox + a * PALLET.pitchX, z: oz + b * PALLET.pitchZ });
        return { zone, rect: r, levels: LEVELS[zone.kind], racked: zone.kind === "rack" || zone.kind === "cold", stacks };
      });
    const doors = [rect.z + rect.d * 0.28, rect.z + rect.d * 0.72];
    const onSite = Math.min(doors.length, input.trucksOnSite[warehouse.id] ?? 0);
    return { warehouse, rect, zones, doors, trucks: doors.slice(0, onSite) };
  });

  const building: Rect = { x: 0, z: 0, w: BUILDING_W, d: depth };
  const apron: Rect = { x: BUILDING_W, z: 1, w: APRON_W, d: storageDepth + 2 };
  return {
    building,
    hall: { x: 0, z: 0, w: HALL_W, d: depth },
    lines,
    warehouses,
    storage: { x: EAST.x, z: 2, w: EAST.w, d: storageDepth },
    maintenance: { x: EAST.x, z: depth - 10, w: 14, d: 8 },
    apron,
    bounds: { x: 0, z: 0, w: BUILDING_W + APRON_W, d: depth },
  };
}

/** How many pallets of a storage zone are filled at the given occupancy (0–1). */
export function filledPallets(slot: StorageSlot, occupancy: number): number {
  return Math.round(Math.max(0, Math.min(1, occupancy)) * slot.stacks.length * slot.levels);
}

/** Static props of the maintenance bay: [centre x, centre z, w, h, d, material]. */
export function maintenanceProps(bay: Rect): { x: number; z: number; w: number; h: number; d: number; m: PartMaterial }[] {
  return [
    { x: bay.x + 3.2, z: bay.z + 1.3, w: 4.4, h: 0.95, d: 1.1, m: "body" }, // workbench
    { x: bay.x + 7.2, z: bay.z + 1.0, w: 1.1, h: 2.0, d: 0.7, m: "trim" }, // tool cabinet
    { x: bay.x + 8.6, z: bay.z + 1.0, w: 1.1, h: 2.0, d: 0.7, m: "trim" },
    { x: bay.x + 11.6, z: bay.z + 1.6, w: 1.6, h: 1.3, d: 1.6, m: "body" }, // parts washer
    { x: bay.x + 6.5, z: bay.z + 5.2, w: 3.4, h: 0.5, d: 2.2, m: "trim" }, // service lift table
  ];
}

/* ------------------------------------------------------------------ */
/* Isometric projection (2D map)                                       */
/* ------------------------------------------------------------------ */

const COS = Math.cos(Math.PI / 6);

export function iso(x: number, z: number, y = 0): [number, number] {
  return [(x - z) * COS, (x + z) * 0.5 - y];
}

const pts = (list: [number, number][]) => list.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(" ");

/** Flat quad on the floor (or at height y). */
export function isoQuad(r: Rect, y = 0): string {
  return pts([iso(r.x, r.z, y), iso(r.x + r.w, r.z, y), iso(r.x + r.w, r.z + r.d, y), iso(r.x, r.z + r.d, y)]);
}

/** The three visible faces of an axis-aligned box given by centre and size. */
export function isoBox(cx: number, cy: number, cz: number, w: number, h: number, d: number): { top: string; left: string; right: string } {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return {
    top: pts([iso(x0, z0, y1), iso(x1, z0, y1), iso(x1, z1, y1), iso(x0, z1, y1)]),
    left: pts([iso(x0, z1, y0), iso(x1, z1, y0), iso(x1, z1, y1), iso(x0, z1, y1)]),
    right: pts([iso(x1, z0, y0), iso(x1, z1, y0), iso(x1, z1, y1), iso(x1, z0, y1)]),
  };
}
