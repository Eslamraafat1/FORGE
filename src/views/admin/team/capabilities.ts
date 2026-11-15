import type { Department, Role, TeamMember } from "@/domain/types";
import type { Tone } from "@/components/ui/primitives";
import { ROLE_CAPABILITIES, type Capability } from "@/lib/permissions";

/** Capabilities grouped into the areas a reader thinks in. Labels: `team.capGroup.<id>` / `team.cap.<capability>`. */
export const CAPABILITY_GROUPS: { id: string; caps: Capability[] }[] = [
  { id: "operations", caps: ["alerts.manage", "line.control", "machine.control"] },
  { id: "production", caps: ["wo.manage", "wo.progress", "planning.manage"] },
  { id: "inventory", caps: ["inventory.manage", "inventory.adjust"] },
  { id: "procurement", caps: ["po.manage", "po.approve", "po.receive"] },
  { id: "quality", caps: ["quality.manage"] },
  { id: "maintenance", caps: ["maintenance.manage", "maintenance.execute"] },
  { id: "admin", caps: ["team.manage", "reports.export", "settings.reset"] },
];

export const CAPABILITY_COUNT = CAPABILITY_GROUPS.reduce((s, g) => s + g.caps.length, 0);

export function roleCan(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

export const DEPARTMENTS: Department[] = ["operations", "production", "warehouse", "quality", "maintenance", "procurement", "executive", "it"];
export const MEMBER_STATUSES: TeamMember["status"][] = ["on_shift", "active", "away", "offline"];
export const MEMBER_STATUS_TONE: Record<TeamMember["status"], Tone> = { on_shift: "ok", active: "info", away: "warn", offline: "neutral" };
