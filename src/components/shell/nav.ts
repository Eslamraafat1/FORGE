import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarRange,
  ClipboardList,
  Cog,
  Factory,
  FileText,
  LayoutDashboard,
  Rows3,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { TKey } from "@/i18n";

export interface NavItem {
  href: string;
  label: TKey;
  icon: LucideIcon;
  /** Extra path prefixes that should highlight this item. */
  also?: string[];
}

export interface NavSection {
  label: TKey;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "nav.section.command",
    items: [
      { href: "/overview", label: "nav.overview", icon: LayoutDashboard },
      { href: "/operations", label: "nav.operations", icon: Activity },
      { href: "/factory", label: "nav.factory", icon: Factory },
    ],
  },
  {
    label: "nav.section.production",
    items: [
      { href: "/production", label: "nav.production", icon: Rows3 },
      { href: "/work-orders", label: "nav.workOrders", icon: ClipboardList },
      { href: "/planning", label: "nav.planning", icon: CalendarRange },
    ],
  },
  {
    label: "nav.section.resources",
    items: [
      { href: "/inventory", label: "nav.inventory", icon: Boxes },
      { href: "/warehouse", label: "nav.warehouse", icon: Warehouse },
      { href: "/procurement", label: "nav.procurement", icon: ShoppingCart, also: ["/suppliers"] },
    ],
  },
  {
    label: "nav.section.quality",
    items: [
      { href: "/quality", label: "nav.quality", icon: ShieldCheck },
      { href: "/maintenance", label: "nav.maintenance", icon: Wrench },
      { href: "/equipment", label: "nav.equipment", icon: Cog },
    ],
  },
  {
    label: "nav.section.intelligence",
    items: [
      { href: "/analytics", label: "nav.analytics", icon: BarChart3 },
      { href: "/reports", label: "nav.reports", icon: FileText },
    ],
  },
  {
    label: "nav.section.admin",
    items: [
      { href: "/team", label: "nav.team", icon: Users },
      { href: "/settings", label: "nav.settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);

export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => isActive(i, pathname));
}

/** Report catalogue (shared by the reports page and the command palette). */
export const REPORT_IDS = ["production", "shift", "inventory", "quality", "maintenance", "downtime", "procurement"] as const;
export type ReportId = (typeof REPORT_IDS)[number];
