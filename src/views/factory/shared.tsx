"use client";
import { useCallback, useSyncExternalStore } from "react";
import type { ID, MachineStatus } from "@/domain/types";
import { MACHINE_TONE } from "@/components/ui/status";
import { toneVar } from "@/components/ui/primitives";
import type { ZoneUsage } from "@/store/selectors";
import type { FactoryLayout } from "./layout";

export type ViewMode = "overview" | "production" | "warehouse" | "equipment";
export type Selection = { type: "machine"; id: ID } | { type: "zone"; id: ID } | null;

export const STATUS_ORDER: MachineStatus[] = ["running", "idle", "warning", "maintenance", "offline"];

/** CSS colour for a machine state — same tone mapping as every status badge. */
export const statusVar = (status: MachineStatus) => toneVar[MACHINE_TONE[status]];

/** Occupancy tone thresholds for warehouse zones. */
export function occupancyVar(occupancy: number): string {
  return occupancy >= 0.9 ? "var(--danger)" : occupancy >= 0.75 ? "var(--amber)" : "var(--ok)";
}

/** What the 3D scene and the 2D map both need. */
export interface TwinViewProps {
  layout: FactoryLayout;
  /** Machine id → status. */
  statusOf: Map<ID, MachineStatus>;
  /** Line id → is the line producing right now. */
  runningLines: Set<ID>;
  /** Warehouse zone id → usage. */
  usage: Map<ID, ZoneUsage>;
  mode: ViewMode;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  labels: { maintenance: string; loading: string };
}

/**
 * State glyph. Each machine state has its own shape so the map never relies
 * on colour alone: disc, ring, triangle, diamond, cross.
 */
export function StatusGlyph({ status, size = 10, className }: { status: MachineStatus; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="-5 -5 10 10" className={className} style={{ flexShrink: 0 }}>
      <GlyphShape status={status} r={4} />
    </svg>
  );
}

/** The bare glyph, centred on the origin, for use inside another SVG. */
export function GlyphShape({ status, r }: { status: MachineStatus; r: number }) {
  const c = statusVar(status);
  const sw = r * 0.42;
  switch (status) {
    case "running":
      return <circle r={r} fill={c} />;
    case "idle":
      return <circle r={r - sw / 2} fill="var(--base)" stroke={c} strokeWidth={sw} />;
    case "warning":
      return <path d={`M0 ${-r} L${r} ${r * 0.85} L${-r} ${r * 0.85} Z`} fill={c} />;
    case "maintenance":
      return <path d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`} fill={c} />;
    case "offline":
      return <path d={`M${-r * 0.8} ${-r * 0.8} L${r * 0.8} ${r * 0.8} M${r * 0.8} ${-r * 0.8} L${-r * 0.8} ${r * 0.8}`} stroke={c} strokeWidth={sw * 1.1} fill="none" />;
  }
}

/* ------------------------------------------------------------------ */
/* Environment hooks                                                   */
/* ------------------------------------------------------------------ */

const noopSubscribe = () => () => {};

/** False during SSR / hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

let webglSupport: boolean | null = null;

function detectWebGL(): boolean {
  if (webglSupport === null) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webglSupport = gl !== null;
      // Release the probe context straight away.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Can this browser create a WebGL context? (Probed once.) */
export function useWebGL(): boolean {
  return useSyncExternalStore(noopSubscribe, detectWebGL, () => false);
}
