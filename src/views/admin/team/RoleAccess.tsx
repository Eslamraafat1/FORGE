"use client";
import { Check, Minus, ShieldAlert } from "lucide-react";
import type { Role } from "@/domain/types";
import { Badge, Panel, cn } from "@/components/ui/primitives";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { ROLES, ROLE_CAPABILITIES } from "@/lib/permissions";
import { useForge } from "@/store/store";
import { CAPABILITY_COUNT, CAPABILITY_GROUPS, roleCan } from "./capabilities";

/** Grouped "can / cannot" list for one role. */
export function CapabilityList({ role, compact }: { role: Role; compact?: boolean }) {
  const { t, td } = useT();
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", !compact && "xl:grid-cols-3")}>
      {CAPABILITY_GROUPS.map((g) => (
        <div key={g.id} className="min-w-0">
          <dt className="label">{td(`team.capGroup.${g.id}`)}</dt>
          <dd className="mt-1.5">
            <ul className="space-y-1">
              {g.caps.map((cap) => {
                const allowed = roleCan(role, cap);
                return (
                  <li key={cap} className={cn("flex items-start gap-2 text-[12.5px] leading-snug", allowed ? "text-ink" : "text-ink-3")}>
                    {allowed ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={2.6} /> : <Minus aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                    <span>
                      {td(`team.cap.${cap}`)}
                      <span className="sr-only"> — {allowed ? t("team.matrix.allowed") : t("team.matrix.denied")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Prominent demo control: switch the active role and see what it unlocks. */
export function RoleSwitcher() {
  const { t, td } = useT();
  const fmt = useFmt();
  const role = useForge((s) => s.role);
  const setRole = useForge((s) => s.setRole);

  return (
    <Panel title={t("team.switch.title")} subtitle={t("team.switch.subtitle")} eyebrow={t("team.switch.eyebrow")}>
      <div className="flex flex-col gap-4">
        <div role="note" className="flex items-start gap-3 rounded-md border border-amber/45 bg-amber/10 px-3.5 py-3">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">{t("team.switch.noticeTitle")}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{t("team.switch.noticeBody")}</p>
          </div>
        </div>

        <div role="radiogroup" aria-label={t("team.switch.title")} className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {ROLES.map((r) => {
            const active = r === role;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRole(r)}
                className={cn(
                  "flex min-h-[58px] min-w-0 flex-col items-start justify-center gap-0.5 rounded-md border px-3 py-2 text-start transition-colors",
                  active ? "border-forge bg-forge/10" : "border-line bg-canvas hover:border-line-2 hover:bg-raised",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className={cn("min-w-0 text-[12.5px] font-semibold leading-tight", active ? "text-ink" : "text-ink-2")}>{td(`role.${r}`)}</span>
                  {active && <Check aria-hidden className="size-3.5 shrink-0 text-forge-text" strokeWidth={2.6} />}
                </span>
                <span className="num text-[11px] text-ink-3">{t("team.switch.caps", { n: fmt.num(ROLE_CAPABILITIES[r].length), total: fmt.num(CAPABILITY_COUNT) })}</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-line pt-4" aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-[13px] font-semibold text-ink">{t("team.switch.canDo", { role: `@role.${role}` })}</h3>
            <Badge tone="accent">{t("team.switch.caps", { n: fmt.num(ROLE_CAPABILITIES[role].length), total: fmt.num(CAPABILITY_COUNT) })}</Badge>
          </div>
          <p className="mb-4 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{td(`team.roleDesc.${role}`)}</p>
          <CapabilityList role={role} />
        </div>
      </div>
    </Panel>
  );
}

/** Roles × capabilities matrix, with the active demo role highlighted. */
export function RoleMatrix() {
  const { t, td } = useT();
  const role = useForge((s) => s.role);

  return (
    <Panel title={t("team.matrix.title")} subtitle={t("team.matrix.subtitle")} flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <caption className="sr-only">{t("team.matrix.title")}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[230px] px-4 py-2.5 text-start align-bottom">
                <span className="label">{t("team.matrix.capability")}</span>
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" aria-current={r === role ? "true" : undefined} className={cn("w-[78px] px-1.5 py-2.5 text-center align-bottom", r === role && "bg-forge/10")}>
                  <span className={cn("block text-[11px] font-semibold leading-tight", r === role ? "text-ink" : "text-ink-2")}>{td(`role.${r}`)}</span>
                  {r === role && <span className="mt-1 block text-[10.5px] font-semibold text-forge-text">{t("team.matrix.active")}</span>}
                </th>
              ))}
            </tr>
          </thead>
          {CAPABILITY_GROUPS.map((g) => (
            <tbody key={g.id}>
              <tr className="border-b border-line bg-canvas/50">
                <th scope="colgroup" colSpan={ROLES.length + 1} className="px-4 py-1.5 text-start">
                  <span className="label">{td(`team.capGroup.${g.id}`)}</span>
                </th>
              </tr>
              {g.caps.map((cap) => (
                <tr key={cap} className="border-b border-line/60">
                  <th scope="row" className="px-4 py-2 text-start font-normal text-ink">
                    {td(`team.cap.${cap}`)}
                  </th>
                  {ROLES.map((r) => {
                    const allowed = roleCan(r, cap);
                    return (
                      <td key={r} className={cn("px-1.5 py-2 text-center", r === role && "bg-forge/[0.07]")}>
                        {allowed ? <Check aria-hidden className="mx-auto size-4 text-ok" strokeWidth={2.6} /> : <Minus aria-hidden className="mx-auto size-3.5 text-ink-3/60" />}
                        <span className="sr-only">{allowed ? t("team.matrix.allowed") : t("team.matrix.denied")}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <Check aria-hidden className="size-3.5 text-ok" strokeWidth={2.6} />
          {t("team.matrix.allowed")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Minus aria-hidden className="size-3.5" />
          {t("team.matrix.denied")}
        </span>
        <span>{t("team.matrix.note")}</span>
      </p>
    </Panel>
  );
}
