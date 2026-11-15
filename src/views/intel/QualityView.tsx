"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, ClipboardCheck, ClipboardList, ExternalLink, MoreHorizontal, Plus, ShieldAlert, UserCheck } from "lucide-react";
import type { QualityInspection } from "@/domain/types";
import { QUALITY_FAIL_RATE, QUALITY_WATCH_RATE } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, startOfDay } from "@/lib/time";
import { qualitySummary } from "@/store/selectors";
import { useForge } from "@/store/store";
import { ChartPanel, ChartTooltip, SERIES, STATUS_COLOR, useChartProps } from "@/components/charts/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Menu } from "@/components/ui/overlay";
import { EntityLink, Guard, Kpi, KpiStrip, Member, Page, PageHeader, useCan, useLookup } from "@/components/ui/page";
import { Button, Code, EmptyState, IconButton, LegendItem, Panel, Segmented, Select, SimBadge } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { CreateInspectionDialog, useQualityDialogs } from "./quality-dialogs";
import { CaBadge, DEFECT_CATS, RankPanel, caState, defectColor, isOpenIssue, mainDefect, rateTone, rejectRate, useNarrow, type RankRow } from "./shared";

const STATUSES = ["scheduled", "in_progress", "passed", "conditional", "failed"] as const;

export function QualityView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lookup = useLookup();
  const canManage = useCan("quality.manage");
  const dialogs = useQualityDialogs();

  const inspections = useForge((s) => s.inspections);
  const products = useForge((s) => s.products);
  const team = useForge((s) => s.team);
  const now = useForge((s) => s.now);

  // The create dialog is driven by the URL so the command palette deep link works.
  const createOpen = params.get("new") === "1";
  const presetWo = params.get("wo");
  const openCreate = () => router.replace(`${pathname}?new=1`, { scroll: false });
  const closeCreate = () => router.replace(pathname, { scroll: false });

  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [inspector, setInspector] = useState("");
  const [defect, setDefect] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const activeFilters = [status, product, inspector, defect].filter(Boolean).length + (openOnly ? 1 : 0);
  const clearFilters = () => {
    setStatus("");
    setProduct("");
    setInspector("");
    setDefect("");
    setOpenOnly(false);
  };

  const summary = useMemo(() => qualitySummary(inspections), [inspections]);
  const openIssues = useMemo(() => inspections.filter(isOpenIssue).sort((a, b) => (a.correctiveAction?.dueDate ?? 0) - (b.correctiveAction?.dueDate ?? 0)), [inspections]);
  const inspectorIds = useMemo(() => [...new Set(inspections.map((q) => q.inspectorId))], [inspections]);

  const rows = useMemo(
    () =>
      inspections.filter(
        (q) =>
          (!status || q.status === status) &&
          (!product || q.productId === product) &&
          (!inspector || q.inspectorId === inspector) &&
          (!defect || mainDefect(q)?.category === defect) &&
          (!openOnly || isOpenIssue(q)),
      ),
    [inspections, status, product, inspector, defect, openOnly],
  );

  const defectRows = useMemo<RankRow[]>(() => {
    const totals = new Map<string, number>();
    for (const q of inspections) for (const d of q.defects) totals.set(d.category, (totals.get(d.category) ?? 0) + d.qty);
    const all = [...totals.values()].reduce((s, v) => s + v, 0);
    return DEFECT_CATS.filter((c) => (totals.get(c) ?? 0) > 0)
      .map((c) => {
        const value = totals.get(c) ?? 0;
        return { key: c, label: td(`defect.${c}`), text: td(`defect.${c}`), value, color: defectColor(c), hint: t("quality.defects.share", { share: fmt.pct(all ? value / all : 0) }) };
      })
      .sort((a, b) => b.value - a.value);
  }, [inspections, td, t, fmt]);

  const columns = useMemo<Column<QualityInspection>[]>(
    () => [
      { id: "id", header: t("quality.col.id"), cell: (q) => <Code className="font-semibold">{q.id}</Code>, sortValue: (q) => q.id, hideable: false, mobile: "title" },
      { id: "wo", header: t("common.workOrder"), cell: (q) => <EntityLink entity={{ type: "workOrder", id: q.workOrderId }} />, sortValue: (q) => q.workOrderId },
      { id: "product", header: t("common.product"), cell: (q) => <span className="text-ink-2">{lookup.product(q.productId) ? tl(lookup.product(q.productId)!.name) : q.productId}</span>, sortValue: (q) => lookup.product(q.productId)?.name.en ?? "", mobile: "subtitle" },
      { id: "inspector", header: t("common.inspector"), cell: (q) => <Member id={q.inspectorId} />, sortValue: (q) => lookup.member(q.inspectorId)?.name.en ?? "" },
      { id: "date", header: t("quality.col.date"), cell: (q) => <span className="num whitespace-nowrap">{fmt.dateTime(q.date)}</span>, sortValue: (q) => q.date },
      { id: "inspected", header: t("quality.col.inspected"), align: "end", cell: (q) => fmt.num(q.inspectedQty), sortValue: (q) => q.inspectedQty },
      { id: "passed", header: t("quality.col.passed"), align: "end", cell: (q) => fmt.num(q.passedQty), sortValue: (q) => q.passedQty, defaultHidden: true },
      { id: "rejected", header: t("quality.col.rejected"), align: "end", cell: (q) => fmt.num(q.rejectedQty), sortValue: (q) => q.rejectedQty },
      {
        id: "rate",
        header: t("quality.col.rejectRate"),
        align: "end",
        cell: (q) => (q.inspectedQty > 0 ? <span className={rateTone(rejectRate(q)) === "ok" ? undefined : "font-semibold"}>{fmt.pct(rejectRate(q), 2)}</span> : <span className="text-ink-3">{t("common.notAvailable")}</span>),
        sortValue: (q) => rejectRate(q),
      },
      {
        id: "defect",
        header: t("quality.col.mainDefect"),
        cell: (q) => {
          const d = mainDefect(q);
          return d ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="size-2 rounded-[1px]" style={{ background: defectColor(d.category) }} />
              {td(`defect.${d.category}`)}
            </span>
          ) : (
            <span className="text-ink-3">{t("common.notAvailable")}</span>
          );
        },
        sortValue: (q) => mainDefect(q)?.category ?? "",
      },
      { id: "status", header: t("common.status"), cell: (q) => <StatusBadge kind="inspection" value={q.status} />, sortValue: (q) => q.status, mobile: "badge" },
      { id: "ca", header: t("quality.col.ca"), cell: (q) => <CaBadge state={caState(q, now)} />, sortValue: (q) => caState(q, now) },
    ],
    [t, td, tl, fmt, lookup, now],
  );

  return (
    <Page>
      <PageHeader
        eyebrow={t("quality.eyebrow")}
        title={t("nav.quality")}
        subtitle={t("quality.subtitle")}
        meta={<SimBadge />}
        actions={
          <Guard cap="quality.manage">
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              {t("quality.create.title")}
            </Button>
          </Guard>
        }
      />

      <KpiStrip columns={6}>
        <Kpi label={t("quality.kpi.inspected")} value={summary.inspected} format={fmt.num} unit={t("common.units")} icon={ClipboardList} hint={t("quality.kpi.inspections", { n: inspections.length })} />
        <Kpi label={t("quality.kpi.passed")} value={summary.passed} format={fmt.num} unit={t("common.units")} icon={CheckCircle2} />
        <Kpi label={t("quality.kpi.rejected")} value={summary.rejected} format={fmt.num} unit={t("common.units")} />
        <Kpi label={t("quality.kpi.defectRate")} value={summary.defectRate} format={(v) => fmt.pct(v, 2)} tone={rateTone(summary.defectRate) === "ok" ? undefined : rateTone(summary.defectRate)} hint={t("quality.kpi.limitHint", { fail: fmt.pct(QUALITY_FAIL_RATE) })} />
        <Kpi label={t("quality.kpi.passRate")} value={summary.passRate} format={(v) => fmt.pct(v, 2)} />
        <Kpi label={t("quality.kpi.openIssues")} value={summary.openIssues} format={fmt.num} tone={summary.openIssues > 0 ? "warn" : undefined} icon={ShieldAlert} />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <QualityTrend inspections={inspections} now={now} className="lg:col-span-7" />
        <RankPanel
          className="lg:col-span-5"
          title={t("quality.defects.title")}
          subtitle={t("quality.defects.subtitle")}
          rows={defectRows}
          formatValue={(v) => fmt.num(v)}
          labelHeader={t("quality.col.defectCategory")}
          valueHeader={t("quality.col.rejectedUnits")}
        />
      </div>

      <Panel title={t("quality.issues.title")} subtitle={t("quality.issues.subtitle")} flush actions={openIssues.length > 0 ? <span className="num text-[12px] text-ink-3">{fmt.num(openIssues.length)}</span> : undefined}>
        {openIssues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("quality.issues.empty")} hint={t("quality.issues.emptyHint")} />
        ) : (
          <ul className="divide-y divide-line/70">
            {openIssues.map((q) => {
              const ca = q.correctiveAction;
              const state = caState(q, now);
              const pr = lookup.product(q.productId);
              return (
                <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <EntityLink entity={{ type: "inspection", id: q.id }} className="font-semibold" />
                      <StatusBadge kind="inspection" value={q.status} />
                      <CaBadge state={state} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-2">{ca ? ca.description : t("quality.issues.noCa")}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                      <span>{pr ? tl(pr.name) : q.productId}</span>
                      <span aria-hidden>·</span>
                      <EntityLink entity={{ type: "workOrder", id: q.workOrderId }} />
                      <span aria-hidden>·</span>
                      <span className="num">{t("quality.issues.rate", { rate: fmt.pct(rejectRate(q), 2) })}</span>
                    </p>
                  </div>
                  {ca && (
                    <div className="flex min-w-0 items-center gap-4 text-[12.5px]">
                      <Member id={ca.assigneeId} />
                      <span className={state === "overdue" ? "num font-semibold text-danger" : "num text-ink-2"}>{t("quality.issues.due", { when: fmt.relative(ca.dueDate, now) })}</span>
                    </div>
                  )}
                  <Guard cap="quality.manage">
                    {ca ? (
                      <Button size="sm" icon={CheckCircle2} onClick={() => dialogs.open("resolve", q.id)}>
                        {t("quality.ca.resolve")}
                      </Button>
                    ) : (
                      <Button size="sm" icon={UserCheck} onClick={() => dialogs.open("ca", q.id)}>
                        {t("quality.ca.assign")}
                      </Button>
                    )}
                  </Guard>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(q) => q.id}
        caption={t("quality.table.caption")}
        searchText={(q) => `${q.id} ${q.workOrderId} ${lookup.product(q.productId)?.name.en ?? ""} ${lookup.product(q.productId)?.name.ar ?? ""} ${lookup.member(q.inspectorId)?.name.en ?? ""} ${lookup.member(q.inspectorId)?.name.ar ?? ""}`}
        searchPlaceholder={t("quality.table.search")}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        initialSort={{ id: "date", dir: "desc" }}
        rowHref={(q) => `/quality/${q.id}`}
        empty={{ title: t("quality.table.empty"), hint: t("quality.table.emptyHint") }}
        filters={
          <>
            <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("quality.filter.allStatuses")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`qstatus.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.product")} value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">{t("quality.filter.allProducts")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {tl(p.name)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.inspector")} value={inspector} onChange={(e) => setInspector(e.target.value)}>
              <option value="">{t("quality.filter.allInspectors")}</option>
              {team
                .filter((m) => inspectorIds.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {tl(m.name)}
                  </option>
                ))}
            </Select>
            <Select aria-label={t("quality.col.mainDefect")} value={defect} onChange={(e) => setDefect(e.target.value)}>
              <option value="">{t("quality.filter.allDefects")}</option>
              {DEFECT_CATS.map((c) => (
                <option key={c} value={c}>
                  {td(`defect.${c}`)}
                </option>
              ))}
            </Select>
            <Button variant={openOnly ? "primary" : "secondary"} aria-pressed={openOnly} icon={ShieldAlert} onClick={() => setOpenOnly((v) => !v)}>
              {t("quality.filter.openOnly")}
            </Button>
          </>
        }
        rowActions={(q) => {
          const recordable = q.status === "scheduled" || q.status === "in_progress";
          const ca = q.correctiveAction;
          return (
            <Menu
              label={t("common.more")}
              trigger={(p) => <IconButton icon={MoreHorizontal} label={t("common.more")} size="sm" {...p} />}
              items={[
                { label: t("quality.action.open"), icon: ExternalLink, onSelect: () => router.push(`/quality/${q.id}`) },
                null,
                { label: t("quality.record.title"), icon: ClipboardCheck, disabled: !canManage || !recordable, onSelect: () => dialogs.open("record", q.id) },
                { label: ca ? t("quality.ca.edit") : t("quality.ca.assign"), icon: UserCheck, disabled: !canManage || ca?.status === "resolved" || q.inspectedQty === 0, onSelect: () => dialogs.open("ca", q.id) },
                { label: t("quality.ca.resolve"), icon: CheckCircle2, disabled: !canManage || ca?.status !== "open", onSelect: () => dialogs.open("resolve", q.id) },
              ]}
            />
          );
        }}
      />

      <p className="text-[11.5px] text-ink-3">
        {t("quality.footnote")}{" "}
        <Link href="/analytics" className="underline decoration-dotted underline-offset-[3px] hover:text-ink">
          {t("quality.footnote.link")}
        </Link>
      </p>

      <CreateInspectionDialog open={createOpen && canManage} onClose={closeCreate} presetWorkOrder={presetWo} onCreated={(id) => router.push(`/quality/${id}`)} />
      {dialogs.node}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Trend chart                                                         */
/* ------------------------------------------------------------------ */

type Bucket = { key: string; label: string; full: string; inspected: number; rejected: number; defect: number; pass: number };

function QualityTrend({ inspections, now, className }: { inspections: QualityInspection[]; now: number; className?: string }) {
  const { t } = useT();
  const fmt = useFmt();
  const cp = useChartProps();
  const narrow = useNarrow();
  const [mode, setMode] = useState<"week" | "inspection">("week");
  const [metric, setMetric] = useState<"defect" | "pass">("defect");
  const today = startOfDay(now);

  const data = useMemo<Bucket[]>(() => {
    const done = inspections.filter((q) => q.inspectedQty > 0).sort((a, b) => a.date - b.date);
    const point = (key: string, label: string, full: string, inspected: number, rejected: number): Bucket => ({
      key, label, full, inspected, rejected, defect: inspected ? rejected / inspected : 0, pass: inspected ? 1 - rejected / inspected : 0,
    });
    if (mode === "inspection") return done.map((q) => point(q.id, q.id, `${q.id} · ${fmt.dateTime(q.date)}`, q.inspectedQty, q.rejectedQty));
    // Seven-day buckets ending on the simulated "today".
    const end = today + DAY;
    const weeks = new Map<number, { inspected: number; rejected: number }>();
    for (const q of done) {
      const k = Math.max(0, Math.floor((end - 1 - q.date) / (7 * DAY)));
      const w = weeks.get(k) ?? { inspected: 0, rejected: 0 };
      w.inspected += q.inspectedQty;
      w.rejected += q.rejectedQty;
      weeks.set(k, w);
    }
    return [...weeks.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([k, w]) => {
        const from = end - (k + 1) * 7 * DAY;
        const to = end - k * 7 * DAY - 1;
        return point(String(k), fmt.dateShort(from), `${fmt.dateShort(from)} – ${fmt.dateShort(to)}`, w.inspected, w.rejected);
      });
  }, [inspections, mode, today, fmt]);

  const watch = metric === "defect" ? QUALITY_WATCH_RATE : 1 - QUALITY_WATCH_RATE;
  const fail = metric === "defect" ? QUALITY_FAIL_RATE : 1 - QUALITY_FAIL_RATE;
  const name = metric === "defect" ? t("quality.kpi.defectRate") : t("quality.kpi.passRate");

  return (
    <ChartPanel
      className={className}
      title={t("quality.trend.title")}
      subtitle={mode === "week" ? t("quality.trend.subtitleWeek") : t("quality.trend.subtitleInspection")}
      height={narrow ? 220 : 270}
      empty={data.length === 0}
      actions={
        <>
          <Segmented size="sm" label={t("quality.trend.metric")} value={metric} onChange={setMetric} options={[{ value: "defect", label: t("quality.kpi.defectRate") }, { value: "pass", label: t("quality.kpi.passRate") }]} />
          <Segmented size="sm" label={t("quality.trend.grouping")} value={mode} onChange={setMode} options={[{ value: "week", label: t("quality.trend.weekly") }, { value: "inspection", label: t("quality.trend.perInspection") }]} />
        </>
      }
      legend={
        <>
          <LegendItem shape="line" color={SERIES[0]} label={name} />
          <LegendItem shape="dash" color={STATUS_COLOR.warn} label={t("quality.limit.watch")} value={fmt.pct(watch)} />
          <LegendItem shape="dash" color={STATUS_COLOR.danger} label={t("quality.limit.fail")} value={fmt.pct(fail)} />
        </>
      }
      table={{
        columns: [mode === "week" ? t("quality.trend.weekOf") : t("quality.col.id"), t("quality.col.inspected"), t("quality.col.rejected"), t("quality.kpi.defectRate"), t("quality.kpi.passRate")],
        rows: data.map((d) => [d.full, d.inspected, d.rejected, fmt.pct(d.defect, 2), fmt.pct(d.pass, 2)]),
      }}
    >
      <LineChart data={data} margin={cp.margin}>
        <CartesianGrid {...cp.grid} />
        <XAxis {...cp.xAxis} dataKey="label" />
        <YAxis
          {...cp.yAxis}
          tickFormatter={(v: number) => fmt.pct(v, 1)}
          domain={metric === "defect" ? [0, (max: number) => Math.ceil(Math.max(max, QUALITY_FAIL_RATE * 1.15) * 200) / 200] : [(min: number) => Math.floor(Math.min(min, fail - 0.004) * 200) / 200, 1]}
          width={48}
        />
        <Tooltip
          cursor={cp.cursor}
          content={
            <ChartTooltip
              formatLabel={(_, p) => String(p[0]?.payload?.full ?? "")}
              formatValue={(v) => fmt.pct(v, 2)}
              footer={(p) => t("quality.trend.tooltipFoot", { inspected: fmt.num(Number(p[0]?.payload?.inspected ?? 0)), rejected: fmt.num(Number(p[0]?.payload?.rejected ?? 0)) })}
            />
          }
        />
        <ReferenceLine y={watch} stroke={STATUS_COLOR.warn} strokeDasharray="4 3" />
        <ReferenceLine y={fail} stroke={STATUS_COLOR.danger} strokeDasharray="4 3" />
        <Line {...cp.series} type="linear" dataKey={metric} name={name} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3.5, fill: SERIES[0], stroke: "var(--base)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartPanel>
  );
}
