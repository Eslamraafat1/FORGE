"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, History, UserCheck } from "lucide-react";
import { woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { STATUS_COLOR } from "@/components/charts/kit";
import { EntityLink, EntityNotFound, Guard, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { Badge, Button, DataList, EmptyState, Panel, Progress, SegmentBar, SimBadge, cn, toneBg, toneText } from "@/components/ui/primitives";
import { SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { useQualityDialogs } from "./quality-dialogs";
import { CaBadge, DEFECT_CATS, LimitBar, caState, defectColor, rateTone, rejectRate } from "./shared";

export function InspectionDetailView({ id }: { id: string }) {
  const { t, td, tl, tm } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const dialogs = useQualityDialogs();
  const qi = useForge((s) => s.inspections.find((x) => x.id === id));
  const wo = useForge((s) => s.workOrders.find((w) => w.id === qi?.workOrderId));
  const activity = useForge((s) => s.activity);
  const now = useForge((s) => s.now);

  const events = useMemo(() => activity.filter((e) => e.entity?.type === "inspection" && e.entity.id === id), [activity, id]);

  if (!qi) return <EntityNotFound backHref="/quality" backLabel={t("nav.quality")} />;

  const product = lookup.product(qi.productId);
  const line = lookup.line(wo?.lineId);
  const ca = qi.correctiveAction;
  const state = caState(qi, now);
  const rate = rejectRate(qi);
  const hasResults = qi.inspectedQty > 0;
  const recordable = qi.status === "scheduled" || qi.status === "in_progress";
  // An inspection can never cover more units than its order has produced.
  const produced = wo?.completedQty ?? qi.inspectedQty;
  const covered = Math.min(qi.inspectedQty, produced);
  const defects = DEFECT_CATS.map((c) => qi.defects.find((d) => d.category === c)).filter((d) => d !== undefined && d.qty > 0).sort((a, b) => b!.qty - a!.qty) as NonNullable<(typeof qi.defects)[number]>[];
  const maxDefect = Math.max(1, ...defects.map((d) => d.qty));

  return (
    <Page>
      <PageHeader
        back={{ href: "/quality", label: t("nav.quality") }}
        eyebrow={t("entity.inspection")}
        title={<bdi className="code">{qi.id}</bdi>}
        meta={
          <>
            <StatusBadge kind="inspection" value={qi.status} />
            {state !== "none" && <CaBadge state={state} />}
            <SimBadge />
          </>
        }
        subtitle={product ? t("quality.detail.subtitle", { product: product.name, wo: qi.workOrderId }) : undefined}
        actions={
          <Guard cap="quality.manage">
            <div className="flex flex-wrap gap-2">
              {recordable && (
                <Button variant="primary" icon={ClipboardCheck} onClick={() => dialogs.open("record", qi.id)}>
                  {t("quality.record.title")}
                </Button>
              )}
              {hasResults && ca?.status !== "resolved" && (
                <Button icon={UserCheck} onClick={() => dialogs.open("ca", qi.id)}>
                  {ca ? t("quality.ca.edit") : t("quality.ca.assign")}
                </Button>
              )}
              {ca?.status === "open" && (
                <Button icon={CheckCircle2} onClick={() => dialogs.open("resolve", qi.id)}>
                  {t("quality.ca.resolve")}
                </Button>
              )}
            </div>
          </Guard>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-5">
          <Panel title={t("quality.detail.summary")}>
            <DataList
              columns={3}
              items={[
                { label: t("common.workOrder"), value: <EntityLink entity={{ type: "workOrder", id: qi.workOrderId }} /> },
                { label: t("common.product"), value: product ? tl(product.name) : qi.productId },
                { label: t("common.line"), value: line ? <EntityLink entity={{ type: "line", id: line.id }}>{tl(line.name)}</EntityLink> : t("common.notAvailable") },
                { label: t("common.inspector"), value: <Member id={qi.inspectorId} showRole /> },
                { label: t("quality.col.date"), value: <span className="num">{fmt.dateTime(qi.date)}</span> },
                { label: t("common.status"), value: <StatusBadge kind="inspection" value={qi.status} /> },
              ]}
            />
          </Panel>

          <Panel title={t("quality.detail.results")} subtitle={hasResults ? t("quality.detail.resultsSub") : undefined}>
            {!hasResults ? (
              <EmptyState
                icon={ClipboardCheck}
                title={t("quality.detail.noResults")}
                hint={t("quality.detail.noResultsHint")}
                action={
                  recordable ? (
                    <Guard cap="quality.manage">
                      <Button size="sm" icon={ClipboardCheck} onClick={() => dialogs.open("record", qi.id)}>
                        {t("quality.record.title")}
                      </Button>
                    </Guard>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
                  {[
                    { label: t("quality.col.inspected"), value: fmt.num(covered), tone: "text-ink" },
                    { label: t("quality.col.passed"), value: fmt.num(qi.passedQty), tone: "text-ink" },
                    { label: t("quality.col.rejected"), value: fmt.num(qi.rejectedQty), tone: qi.rejectedQty > 0 ? toneText[rateTone(rate)] : "text-ink" },
                  ].map((f) => (
                    <div key={f.label} className="min-w-0 bg-base px-3 py-3 sm:px-4">
                      <div className="label truncate">{f.label}</div>
                      <div className={cn("display num mt-1.5 text-[24px] sm:text-[28px]", f.tone)}>{f.value}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <SegmentBar
                    className="h-3"
                    segments={[
                      { value: qi.passedQty, color: STATUS_COLOR.ok, label: t("quality.col.passed") },
                      { value: qi.rejectedQty, color: STATUS_COLOR.danger, label: t("quality.col.rejected") },
                    ]}
                  />
                  <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] text-ink-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-[1px] bg-ok" />
                      {t("quality.col.passed")} <span className="num font-semibold text-ink">{fmt.pct(1 - rate, 2)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-[1px] bg-danger" />
                      {t("quality.col.rejected")} <span className="num font-semibold text-ink">{fmt.pct(rate, 2)}</span>
                    </span>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="label">{t("quality.detail.rateVsLimits")}</span>
                    <span className={cn("num text-[15px] font-semibold", toneText[rateTone(rate)])}>{fmt.pct(rate, 2)}</span>
                  </div>
                  <LimitBar rate={rate} />
                </div>
              </div>
            )}
          </Panel>

          <Panel title={t("quality.detail.defects")} subtitle={hasResults && defects.length > 0 ? t("quality.detail.defectsSub", { n: fmt.num(qi.rejectedQty) }) : undefined}>
            {defects.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">{hasResults ? t("quality.detail.noDefects") : t("quality.detail.noResultsHint")}</p>
            ) : (
              <ul className="space-y-3.5">
                {defects.map((d) => (
                  <li key={d.category}>
                    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-ink">
                        <span aria-hidden className="size-2 shrink-0 rounded-[1px]" style={{ background: defectColor(d.category) }} />
                        <span className="truncate">{td(`defect.${d.category}`)}</span>
                      </span>
                      <span className="num shrink-0 text-ink-2">
                        <span className="font-semibold text-ink">{fmt.num(d.qty)}</span> {t("common.units")} · {fmt.pct(qi.rejectedQty ? d.qty / qi.rejectedQty : 0)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-[1px] bg-line/60">
                      <div className="h-full rounded-[1px]" style={{ width: `${Math.max(1.5, (d.qty / maxDefect) * 100)}%`, background: defectColor(d.category) }} />
                    </div>
                    {d.note && <p className="mt-1.5 text-[12px] text-ink-2">{d.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("common.notes")}>
            {qi.notes ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2" dir="auto">{qi.notes}</p> : <p className="text-[12.5px] text-ink-3">{t("quality.detail.noNotes")}</p>}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Panel title={t("quality.ca.title")} actions={state !== "none" ? <CaBadge state={state} /> : undefined}>
            {ca ? (
              <div className="space-y-4">
                <p className="text-[13px] leading-relaxed text-ink" dir="auto">{ca.description}</p>
                <DataList
                  columns={1}
                  items={[
                    { label: t("common.assignee"), value: <Member id={ca.assigneeId} showRole /> },
                    {
                      label: t("quality.ca.dueDate"),
                      value: (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="num">{fmt.date(ca.dueDate)}</span>
                          {ca.status === "open" && (
                            <span className={cn("num text-[12px]", state === "overdue" ? "font-semibold text-danger" : "text-ink-3")}>
                              {state === "overdue" ? t("quality.ca.overdueBy", { when: fmt.relative(ca.dueDate, now) }) : fmt.relative(ca.dueDate, now)}
                            </span>
                          )}
                        </span>
                      ),
                    },
                    ...(ca.resolvedAt ? [{ label: t("quality.ca.resolvedAt"), value: <span className="num">{fmt.dateTime(ca.resolvedAt)}</span> }] : []),
                  ]}
                />
                {ca.status === "open" && (
                  <Guard cap="quality.manage">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => dialogs.open("resolve", qi.id)}>
                        {t("quality.ca.resolve")}
                      </Button>
                      <Button size="sm" icon={UserCheck} onClick={() => dialogs.open("ca", qi.id)}>
                        {t("quality.ca.edit")}
                      </Button>
                    </div>
                  </Guard>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12.5px] text-ink-2">{t(state === "required" ? "quality.ca.requiredHint" : hasResults ? "quality.ca.noneHint" : "quality.ca.pendingHint")}</p>
                {hasResults && (
                  <Guard cap="quality.manage">
                    <Button size="sm" variant={state === "required" ? "primary" : "secondary"} icon={UserCheck} onClick={() => dialogs.open("ca", qi.id)}>
                      {t("quality.ca.assign")}
                    </Button>
                  </Guard>
                )}
              </div>
            )}
          </Panel>

          <Panel title={t("quality.detail.linkedWo")} actions={wo ? <StatusBadge kind="wo" value={wo.status} /> : undefined}>
            {wo ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <EntityLink entity={{ type: "workOrder", id: wo.id }} className="text-[14px] font-semibold" />
                  <StatusBadge kind="priority" value={wo.priority} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-ink-2">
                    <span>{t("quality.detail.woProduced")}</span>
                    <span className="num">
                      <span className="font-semibold text-ink">{fmt.num(wo.completedQty)}</span> / {fmt.num(wo.plannedQty)} · {fmt.pct(woProgress(wo), 0)}
                    </span>
                  </div>
                  <Progress value={woProgress(wo)} label={t("quality.detail.woProduced")} thick />
                </div>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-ink-2">
                    <span>{t("quality.detail.woCoverage")}</span>
                    <span className="num">
                      <span className="font-semibold text-ink">{fmt.num(covered)}</span> / {fmt.num(wo.completedQty)}
                    </span>
                  </div>
                  <Progress value={wo.completedQty > 0 ? covered / wo.completedQty : 0} tone="info" label={t("quality.detail.woCoverage")} thick />
                </div>
                <DataList
                  columns={2}
                  items={[
                    { label: t("quality.detail.woRejected"), value: <span className="num">{fmt.num(wo.rejectedQty)}</span> },
                    { label: t("common.due"), value: <span className="num">{fmt.dateShort(wo.dueDate)}</span> },
                  ]}
                />
                <p className="text-[11.5px] text-ink-3">{t("quality.detail.woNote")}</p>
                <Link href={`/work-orders/${wo.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-forge-text hover:underline">
                  {t("quality.detail.openWo")}
                  <ArrowRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
                </Link>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-3">{t("quality.detail.woMissing", { wo: qi.workOrderId })}</p>
            )}
          </Panel>

          <Panel title={t("common.activity")} subtitle={t("quality.detail.activitySub")}>
            {events.length === 0 ? (
              <EmptyState icon={History} title={t("quality.detail.noActivity")} hint={t("quality.detail.noActivityHint")} className="py-6" />
            ) : (
              <ol className="relative space-y-4 border-s border-line ps-4">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span aria-hidden className={cn("absolute -start-[21px] top-1.5 size-2 rounded-full ring-2 ring-base", toneBg[SEVERITY_TONE[e.severity]])} />
                    <p className="text-[12.5px] text-ink">{tm(e.msg)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                      <span className="num">{fmt.dateTime(e.at)}</span>
                      <span aria-hidden>·</span>
                      <span>{e.actorId && lookup.member(e.actorId) ? tl(lookup.member(e.actorId)!.name) : t("notif.system")}</span>
                      <Badge tone={SEVERITY_TONE[e.severity]}>{td(`severity.${e.severity}`)}</Badge>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {dialogs.node}
    </Page>
  );
}
