import type { CSSProperties } from "react";
import type { ForgeData } from "@/domain/types";
import type { Theme } from "@/store/prefs";

export const APP_NAME = "FORGE";
export const APP_VERSION = "1.0.0";

export const TECH_STACK = ["Next.js 16 (App Router)", "React 19", "TypeScript", "Tailwind CSS 4", "Zustand", "Recharts", "three.js / React Three Fiber", "Motion"];

/** localStorage keys used by the demo (data + preferences). */
export const STORAGE_KEY_DATA = "forge-demo-state";

/** Entities shown in the dataset statistics, in reading order. Labels: `settings.data.count.<key>`. */
export const DATASET_KEYS: (keyof ForgeData)[] = [
  "factories",
  "lines",
  "machines",
  "products",
  "workOrders",
  "dailyStats",
  "downtimeEvents",
  "items",
  "movements",
  "warehouses",
  "zones",
  "shipments",
  "suppliers",
  "purchaseOrders",
  "inspections",
  "maintenanceOrders",
  "team",
  "alerts",
  "notifications",
  "activity",
];

/**
 * Token values for the theme preview thumbnails. A preview has to show a theme
 * that is NOT the active one, so it re-declares that theme's CSS variables on
 * its own subtree (mirrors the palettes in app/globals.css). This is the one
 * place outside globals.css where raw colour values are allowed.
 */
export const THEME_PREVIEW_VARS: Record<Theme, CSSProperties> = {
  dark: {
    "--canvas": "#0a0e13",
    "--base": "#101720",
    "--raised": "#17212b",
    "--ink": "#f0f4f5",
    "--ink-3": "#6f808c",
    "--line": "#293642",
    "--forge": "#ff7a36",
    "--ok": "#55d6a3",
  } as CSSProperties,
  light: {
    "--canvas": "#efece6",
    "--base": "#f8f6f2",
    "--raised": "#ffffff",
    "--ink": "#171c22",
    "--ink-3": "#66717b",
    "--line": "#d8d3ca",
    "--forge": "#d4500f",
    "--ok": "#0c7d55",
  } as CSSProperties,
};
