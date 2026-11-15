"use client";
import { useMemo, useState } from "react";
import { Building2, Network, UserCheck, Users } from "lucide-react";
import type { Department, Role, TeamMember } from "@/domain/types";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Avatar, Kpi, KpiStrip, Page, PageHeader, useLookup } from "@/components/ui/page";
import { Badge, Code, Panel, Progress, Select } from "@/components/ui/primitives";
import { CURRENT_USER_ID } from "@/data/seed";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { ROLES } from "@/lib/permissions";
import { useForge } from "@/store/store";
import { DEPARTMENTS, MEMBER_STATUSES, MEMBER_STATUS_TONE } from "./capabilities";
import { MemberDrawer } from "./MemberDrawer";
import { RoleMatrix, RoleSwitcher } from "./RoleAccess";

const NO_FILTERS = { role: "", department: "", factoryId: "", status: "" };

export function TeamView() {
  const { t, td, tl, tm } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const team = useForge((s) => s.team);
  const factories = useForge((s) => s.factories);
  const now = useForge((s) => s.now);
  const role = useForge((s) => s.role);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [drawer, setDrawer] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });

  const rows = useMemo(
    () =>
      team.filter(
        (m) =>
          (!filters.role || m.role === filters.role) &&
          (!filters.department || m.department === filters.department) &&
          (!filters.factoryId || m.factoryId === filters.factoryId) &&
          (!filters.status || m.status === filters.status),
      ),
    [team, filters],
  );

  const stats = useMemo(() => {
    const onShift = team.filter((m) => m.status === "on_shift").length;
    const byDept = DEPARTMENTS.map((d) => {
      const members = team.filter((m) => m.department === d);
      return { dept: d, count: members.length, onShift: members.filter((m) => m.status === "on_shift").length };
    })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
    const byFactory = factories.map((f) => ({ factory: f, count: team.filter((m) => m.factoryId === f.id).length }));
    return { onShift, byDept, byFactory, roles: new Set(team.map((m) => m.role)).size };
  }, [team, factories]);

  const columns: Column<TeamMember>[] = useMemo(
    () => [
      {
        id: "name",
        header: t("team.col.member"),
        mobile: "title",
        hideable: false,
        sortValue: (m) => tl(m.name),
        cell: (m) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar member={m} size={28} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-ink">{tl(m.name)}</span>
                {m.id === CURRENT_USER_ID && <Badge tone="accent">{t("team.you")}</Badge>}
              </span>
              <Code className="block max-w-[230px] truncate text-[11px] font-normal text-ink-3">{m.email}</Code>
            </span>
          </span>
        ),
      },
      { id: "role", header: t("team.col.role"), mobile: "subtitle", sortValue: (m) => td(`role.${m.role}`), cell: (m) => td(`role.${m.role}`) },
      { id: "department", header: t("team.col.department"), sortValue: (m) => td(`dept.${m.department}`), cell: (m) => <span className="text-ink-2">{td(`dept.${m.department}`)}</span> },
      {
        id: "location",
        header: t("team.col.location"),
        sortValue: (m) => m.factoryId,
        cell: (m) => {
          const f = lookup.factory(m.factoryId);
          return f ? (
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <Code className="text-ink-3">{f.code}</Code>
              {tl(f.name)}
            </span>
          ) : (
            t("common.notAvailable")
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        mobile: "badge",
        sortValue: (m) => MEMBER_STATUSES.indexOf(m.status),
        cell: (m) => (
          <Badge tone={MEMBER_STATUS_TONE[m.status]} dot pulse={m.status === "on_shift"}>
            {td(`memberstatus.${m.status}`)}
          </Badge>
        ),
      },
      {
        id: "activity",
        header: t("team.col.activity"),
        sortValue: (m) => -m.lastActiveAt,
        cell: (m) => (
          <span className="block min-w-0">
            <span className="block text-[12.5px] text-ink">{tm(m.lastActivity)}</span>
            <span className="num block text-[11.5px] text-ink-3">{fmt.relative(m.lastActiveAt, now)}</span>
          </span>
        ),
      },
    ],
    [t, td, tl, tm, fmt, lookup, now],
  );

  const active = Object.values(filters).filter(Boolean).length;
  const set = (key: keyof typeof NO_FILTERS) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const member = team.find((m) => m.id === drawer.id);
  const maxDept = Math.max(1, ...stats.byDept.map((d) => d.count));

  return (
    <Page>
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} meta={<Badge tone="accent">{td(`role.${role}`)}</Badge>} />

      <KpiStrip columns={4}>
        <Kpi label={t("team.kpi.members")} value={team.length} format={fmt.num} icon={Users} hint={stats.byFactory.map((f) => `${f.factory.code} ${fmt.num(f.count)}`).join(" · ")} />
        <Kpi
          label={t("team.kpi.onShift")}
          value={stats.onShift}
          format={fmt.num}
          icon={UserCheck}
          tone="ok"
          hint={t("team.kpi.onShiftHint", { pct: fmt.pct(team.length ? stats.onShift / team.length : 0, 0) })}
        />
        <Kpi label={t("team.kpi.departments")} value={stats.byDept.length} format={fmt.num} icon={Network} hint={stats.byDept[0] ? t("team.kpi.largest", { dept: `@dept.${stats.byDept[0].dept}` }) : undefined} />
        <Kpi label={t("team.kpi.roles")} value={stats.roles} format={fmt.num} icon={Building2} hint={t("team.kpi.rolesHint", { total: fmt.num(ROLES.length) })} />
      </KpiStrip>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
        <RoleSwitcher />
        <Panel title={t("team.dept.title")} subtitle={t("team.dept.subtitle")} className="self-start">
          <ul className="flex flex-col gap-3">
            {stats.byDept.map((d) => (
              <li key={d.dept}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink">{td(`dept.${d.dept}`)}</span>
                  <span className="num text-[11.5px] text-ink-3">
                    <span className="font-semibold text-ink">{fmt.num(d.count)}</span>
                    {" · "}
                    {t("team.dept.onShift", { n: d.onShift })}
                  </span>
                </div>
                <Progress value={d.count / maxDept} tone="neutral" label={td(`dept.${d.dept}`)} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(m) => m.id}
        caption={t("team.table.caption")}
        searchText={(m) => `${m.name.en} ${m.name.ar} ${m.email} ${m.id} ${td(`role.${m.role}`)}`}
        searchPlaceholder={t("team.search")}
        initialSort={{ id: "status", dir: "asc" }}
        pageSize={10}
        activeFilters={active}
        onClearFilters={() => setFilters(NO_FILTERS)}
        onRowClick={(m) => setDrawer({ id: m.id, open: true })}
        activeRowId={drawer.open ? drawer.id : null}
        empty={{ title: t("team.empty") }}
        filters={
          <>
            <Select aria-label={t("team.col.role")} value={filters.role} onChange={set("role")}>
              <option value="">{t("team.filter.allRoles")}</option>
              {ROLES.map((r: Role) => (
                <option key={r} value={r}>
                  {td(`role.${r}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("team.col.department")} value={filters.department} onChange={set("department")}>
              <option value="">{t("team.filter.allDepartments")}</option>
              {DEPARTMENTS.map((d: Department) => (
                <option key={d} value={d}>
                  {td(`dept.${d}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("team.col.location")} value={filters.factoryId} onChange={set("factoryId")}>
              <option value="">{t("team.filter.allLocations")}</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {tl(f.name)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.status")} value={filters.status} onChange={set("status")}>
              <option value="">{t("team.filter.allStatuses")}</option>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`memberstatus.${s}`)}
                </option>
              ))}
            </Select>
          </>
        }
      />

      <RoleMatrix />

      <MemberDrawer member={member} open={drawer.open} onClose={() => setDrawer((d) => ({ ...d, open: false }))} />
    </Page>
  );
}
