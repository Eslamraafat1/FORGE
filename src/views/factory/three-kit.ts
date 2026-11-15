/**
 * Shared GPU resources for the digital twin. One unit box and one unit
 * cylinder are scaled into every part; a dozen materials are shared by the
 * whole scene and recoloured in place when the theme changes.
 *
 * This module is only ever loaded in the browser (the scene is imported with
 * next/dynamic, ssr: false).
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from "three";
import type { MachineStatus } from "@/domain/types";
import type { Rect } from "./layout";

const unitBox = new BoxGeometry(1, 1, 1);

export const GEO = {
  box: unitBox,
  cyl: new CylinderGeometry(0.5, 0.5, 1, 10, 1),
  boxEdges: new EdgesGeometry(unitBox),
};

const lambert = () => new MeshLambertMaterial();
const basic = () => new MeshBasicMaterial();

export const MAT = {
  floor: lambert(),
  apron: lambert(),
  plate: lambert(),
  wall: lambert(),
  body: lambert(),
  trim: lambert(),
  pallet: lambert(),
  glass: new MeshLambertMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
  ghost: new MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false }),
  select: basic(),
  edge: new LineBasicMaterial(),
  edgeSelected: new LineBasicMaterial(),
  lines: new LineBasicMaterial(),
  grid: new LineBasicMaterial({ transparent: true, opacity: 0.55 }),
  status: {
    running: basic(),
    idle: basic(),
    maintenance: basic(),
    warning: basic(),
    offline: basic(),
  } satisfies Record<MachineStatus, MeshBasicMaterial>,
  /** Warehouse-zone occupancy wash (warehouse view). */
  occupancy: {
    ok: new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false }),
    warn: new MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false }),
    danger: new MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }),
  },
};

const scratchA = new Color();
const scratchB = new Color();

/**
 * Re-reads the design tokens from <html> and pushes them into the shared
 * materials. Call after the theme changes, then invalidate the frame.
 */
export function applyPalette(): void {
  if (typeof document === "undefined") return;
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const mix = (a: string, b: string, t: number) => scratchA.set(a).lerp(scratchB.set(b), t);

  const canvas = token("--canvas", "#0a0e13");
  const base = token("--base", "#101720");
  const raised = token("--raised", "#17212b");
  const panel = token("--panel", "#1c2934");
  const ink2 = token("--ink-2", "#9aa8b2");
  const ink3 = token("--ink-3", "#6f808c");
  const line = token("--line", "#293642");
  const line2 = token("--line-2", "#3a4a58");
  const forge = token("--forge", "#ff7a36");
  const ok = token("--ok", "#55d6a3");
  const amber = token("--amber", "#eab85c");
  const info = token("--info", "#61c8e8");
  const danger = token("--danger", "#f16b70");
  const muted = token("--c-muted", "#56677a");

  MAT.floor.color.set(base);
  MAT.apron.color.copy(mix(canvas, base, 0.45));
  MAT.plate.color.set(raised);
  MAT.wall.color.set(panel);
  MAT.body.color.copy(mix(raised, ink2, 0.24));
  MAT.trim.color.copy(mix(raised, ink2, 0.52));
  MAT.pallet.color.copy(mix(muted, raised, 0.15));
  MAT.glass.color.set(info);
  MAT.ghost.color.set(ink3);
  MAT.select.color.set(forge);
  MAT.edge.color.set(ink3);
  MAT.edgeSelected.color.set(forge);
  MAT.lines.color.set(line2);
  MAT.grid.color.set(line);
  MAT.status.running.color.set(ok);
  MAT.status.idle.color.set(ink3);
  MAT.status.maintenance.color.set(info);
  MAT.status.warning.color.set(amber);
  MAT.status.offline.color.set(danger);
  MAT.occupancy.ok.color.set(ok);
  MAT.occupancy.warn.color.set(amber);
  MAT.occupancy.danger.color.set(danger);
}

applyPalette();

/* ------------------------------------------------------------------ */
/* Merged line geometry (one draw call for all blueprint lines)        */
/* ------------------------------------------------------------------ */

export class LineBuilder {
  private readonly positions: number[] = [];

  segment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    this.positions.push(x0, y0, z0, x1, y1, z1);
    return this;
  }

  /** Rectangle outline on a horizontal plane. */
  rect(r: Rect, y: number): this {
    const x1 = r.x + r.w, z1 = r.z + r.d;
    return this.segment(r.x, y, r.z, x1, y, r.z).segment(x1, y, r.z, x1, y, z1).segment(x1, y, z1, r.x, y, z1).segment(r.x, y, z1, r.x, y, r.z);
  }

  /** Wireframe of an axis-aligned box standing on y0. */
  frame(r: Rect, y0: number, y1: number): this {
    this.rect(r, y0).rect(r, y1);
    for (const [x, z] of [[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]] as const) this.segment(x, y0, z, x, y1, z);
    return this;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    return geometry;
  }
}
