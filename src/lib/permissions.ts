import type { Role } from "@/domain/types";

/**
 * Demo role model. This drives which actions the interface offers; it is a
 * client-side illustration only and NOT a security boundary.
 */
export type Capability =
  | "alerts.manage"
  | "line.control"
  | "machine.control"
  | "wo.manage"
  | "wo.progress"
  | "planning.manage"
  | "inventory.manage"
  | "inventory.adjust"
  | "po.manage"
  | "po.approve"
  | "po.receive"
  | "quality.manage"
  | "maintenance.manage"
  | "maintenance.execute"
  | "team.manage"
  | "reports.export"
  | "settings.reset";

const ALL: Capability[] = [
  "alerts.manage", "line.control", "machine.control", "wo.manage", "wo.progress", "planning.manage",
  "inventory.manage", "inventory.adjust", "po.manage", "po.approve", "po.receive", "quality.manage",
  "maintenance.manage", "maintenance.execute", "team.manage", "reports.export", "settings.reset",
];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: ALL,
  ops_manager: ALL.filter((c) => c !== "team.manage"),
  supervisor: ["alerts.manage", "line.control", "machine.control", "wo.manage", "wo.progress", "planning.manage", "reports.export"],
  warehouse_manager: ["alerts.manage", "inventory.manage", "inventory.adjust", "po.receive", "reports.export"],
  inspector: ["alerts.manage", "quality.manage", "reports.export"],
  technician: ["alerts.manage", "machine.control", "maintenance.manage", "maintenance.execute"],
  procurement: ["po.manage", "po.receive", "inventory.manage", "reports.export"],
  viewer: ["reports.export"],
};

export const ROLES: Role[] = ["admin", "ops_manager", "supervisor", "warehouse_manager", "inspector", "technician", "procurement", "viewer"];

export function can(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}
