"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import type { Department, EntityRef, Role, TeamMember } from "@/domain/types";
import { maintenanceIsOpen, woIsOpen } from "@/domain/rules";
import { Drawer } from "@/components/ui/overlay";
import { Avatar, EntityLink, useCan, useLookup } from "@/components/ui/page";
import { Badge, Button, Code, DataList, Field, Select, cn, toneBg } from "@/components/ui/primitives";
import { SEVERITY_TONE } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { CURRENT_USER_ID } from "@/data/seed";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { ROLES, ROLE_CAPABILITIES } from "@/lib/permissions";
import { useForge } from "@/store/store";
import { CAPABILITY_COUNT, DEPARTMENTS, MEMBER_STATUSES, MEMBER_STATUS_TONE } from "./capabilities";
import { CapabilityList } from "./RoleAccess";

const MAX_LINKS = 6;

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Edit role / department / location / status. Keyed by the member so it resets after a save. */
function AccessForm({ member }: { member: TeamMember }) {
  const { t, td, tl } = useT();
  const factories = useForge((s) => s.factories);
  const updateMember = useForge((s) => s.updateMember);
  const allowed = useCan("team.manage");
  const run = useAction();
  const [role, setRole] = useState<Role>(member.role);
  const [department, setDepartment] = useState<Department>(member.department);
  const [factoryId, setFactoryId] = useState(member.factoryId);
  const [status, setStatus] = useState<TeamMember["status"]>(member.status);

  const dirty = role !== member.role || department !== member.department || factoryId !== member.factoryId || status !== member.status;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!allowed || !dirty) return;
        run(updateMember(member.id, { role, department, factoryId, status }), t("team.saved"), tl(member.name));
      }}
    >
      {!allowed && (
        <p role="note" className="flex items-start gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-[12px] leading-snug text-ink-2">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          {t("team.drawer.readOnly")}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("team.col.role")}>
          {(p) => (
            <Select {...p} disabled={!allowed} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {td(`role.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("team.col.department")}>
          {(p) => (
            <Select {...p} disabled={!allowed} value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {td(`dept.${d}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("team.col.location")}>
          {(p) => (
            <Select {...p} disabled={!allowed} value={factoryId} onChange={(e) => setFactoryId(e.target.value)}>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {tl(f.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("common.status")}>
          {(p) => (
            <Select {...p} disabled={!allowed} value={status} onChange={(e) => setStatus(e.target.value as TeamMember["status"])}>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`memberstatus.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <p className="text-[11.5px] leading-snug text-ink-3">{t("team.drawer.accessNote")}</p>
      {allowed && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setRole(member.role);
              setDepartment(member.department);
              setFactoryId(member.factoryId);
              setStatus(member.status);
            }}
          >
            {t("common.reset")}
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function AssignedWork({ member }: { member: TeamMember }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lines = useForge((s) => s.lines);
  const workOrders = useForge((s) => s.workOrders);
  const maintenanceOrders = useForge((s) => s.maintenanceOrders);
  const inspections = useForge((s) => s.inspections);
  const alerts = useForge((s) => s.alerts);
  const purchaseOrders = useForge((s) => s.purchaseOrders);
  const warehouses = useForge((s) => s.warehouses);

  const groups = useMemo(() => {
    const id = member.id;
    const ref = (type: EntityRef["type"]) => (x: { id: string }): { ref: EntityRef; label?: string } => ({ ref: { type, id: x.id } });
    return [
      { key: "lines", label: t("team.work.lines"), items: lines.filter((l) => l.supervisorId === id).map((l) => ({ ref: { type: "line" as const, id: l.id }, label: `${l.code} · ${tl(l.name)}` })) },
      { key: "warehouses", label: t("team.work.warehouses"), items: warehouses.filter((w) => w.managerId === id).map((w) => ({ ref: { type: "warehouse" as const, id: w.id }, label: `${w.code} · ${tl(w.name)}` })) },
      { key: "wo", label: t("team.work.workOrders"), items: workOrders.filter((o) => o.supervisorId === id && woIsOpen(o)).map(ref("workOrder")) },
      { key: "mo", label: t("team.work.maintenance"), items: maintenanceOrders.filter((o) => o.technicianId === id && maintenanceIsOpen(o.status)).map(ref("maintenance")) },
      { key: "qi", label: t("team.work.inspections"), items: inspections.filter((q) => q.inspectorId === id && (q.status === "scheduled" || q.status === "in_progress")).map(ref("inspection")) },
      { key: "ca", label: t("team.work.correctiveActions"), items: inspections.filter((q) => q.correctiveAction?.assigneeId === id && q.correctiveAction.status === "open").map(ref("inspection")) },
      { key: "alerts", label: t("team.work.alerts"), items: alerts.filter((a) => a.assigneeId === id && a.status !== "resolved").map((a) => ({ ref: a.entity, label: `${a.id} · ${a.entity.id}` })) },
      { key: "po", label: t("team.work.purchaseOrders"), items: purchaseOrders.filter((p) => p.requestedById === id && p.status !== "received" && p.status !== "cancelled").map(ref("po")) },
    ].filter((g) => g.items.length > 0);
  }, [member.id, lines, warehouses, workOrders, maintenanceOrders, inspections, alerts, purchaseOrders, t, tl]);

  if (groups.length === 0) return <p className="text-[12.5px] text-ink-3">{t("team.drawer.noWork")}</p>;

  return (
    <dl className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.key}>
          <dt className="flex items-center gap-2">
            <span className="label">{g.label}</span>
            <span className="num rounded-sm bg-raised px-1.5 py-0.5 text-[10.5px] text-ink-2">{fmt.num(g.items.length)}</span>
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px]">
            {g.items.slice(0, MAX_LINKS).map((it, i) => (
              <EntityLink key={`${it.ref.id}-${i}`} entity={it.ref}>
                {it.label ? <bdi>{it.label}</bdi> : undefined}
              </EntityLink>
            ))}
            {g.items.length > MAX_LINKS && <span className="num text-ink-3">{t("team.work.more", { n: g.items.length - MAX_LINKS })}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentActivity({ member }: { member: TeamMember }) {
  const { t, tm } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const activity = useForge((s) => s.activity);
  const events = useMemo(() => activity.filter((e) => e.actorId === member.id).slice(0, 8), [activity, member.id]);

  return (
    <ol className="flex flex-col">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-2.5 border-b border-line/60 py-2 last:border-b-0">
          <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneBg[SEVERITY_TONE[e.severity]])} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-snug text-ink">{tm(e.msg)}</p>
            <p className="num mt-0.5 text-[11.5px] text-ink-3">{fmt.relative(e.at, now)}</p>
          </div>
          {e.entity && <EntityLink entity={e.entity} className="shrink-0 text-[12px]" />}
        </li>
      ))}
      {/* The seeded "last activity" line is always available, even before any logged event. */}
      <li className="flex items-start gap-2.5 py-2">
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-snug text-ink-2">{tm(member.lastActivity)}</p>
          <p className="num mt-0.5 text-[11.5px] text-ink-3">{fmt.relative(member.lastActiveAt, now)}</p>
        </div>
      </li>
      {events.length === 0 && <li className="pt-1 text-[11.5px] text-ink-3">{t("team.drawer.noActivity")}</li>}
    </ol>
  );
}

export function MemberDrawer({ member, open, onClose }: { member: TeamMember | undefined; open: boolean; onClose: () => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const lookup = useLookup();

  return (
    <Drawer open={open && !!member} onClose={onClose} eyebrow={t("team.drawer.eyebrow")} title={member ? tl(member.name) : ""} width={480}>
      {member && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3.5">
            <Avatar member={member} size={48} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={MEMBER_STATUS_TONE[member.status]} dot>
                  {td(`memberstatus.${member.status}`)}
                </Badge>
                {member.id === CURRENT_USER_ID && <Badge tone="accent">{t("team.you")}</Badge>}
              </div>
              <p className="mt-1.5 truncate">
                <Code className="text-ink-2">{member.email}</Code>
              </p>
            </div>
          </div>

          <DataList
            items={[
              { label: t("common.id"), value: <Code>{member.id}</Code> },
              { label: t("team.col.role"), value: td(`role.${member.role}`) },
              { label: t("team.col.department"), value: td(`dept.${member.department}`) },
              { label: t("team.col.location"), value: lookup.factory(member.factoryId) ? tl(lookup.factory(member.factoryId)!.name) : t("common.notAvailable") },
              { label: t("team.drawer.lastActive"), value: <span className="num">{fmt.relative(member.lastActiveAt, now)}</span> },
              { label: t("team.drawer.lastSeen"), value: <span className="num">{fmt.dateTime(member.lastActiveAt)}</span> },
            ]}
          />

          <Section title={t("team.drawer.access")}>
            <AccessForm key={`${member.id}|${member.role}|${member.department}|${member.factoryId}|${member.status}`} member={member} />
          </Section>

          <Section
            title={t("team.drawer.capabilities")}
            aside={<span className="num text-[11.5px] text-ink-3">{t("team.switch.caps", { n: fmt.num(ROLE_CAPABILITIES[member.role].length), total: fmt.num(CAPABILITY_COUNT) })}</span>}
          >
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">{td(`team.roleDesc.${member.role}`)}</p>
            <CapabilityList role={member.role} compact />
          </Section>

          <Section title={t("team.drawer.work")}>
            <AssignedWork member={member} />
          </Section>

          <Section title={t("team.drawer.activity")}>
            <RecentActivity member={member} />
          </Section>
        </div>
      )}
    </Drawer>
  );
}
