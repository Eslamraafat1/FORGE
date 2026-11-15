"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, CalendarCheck, Clock, Wand2 } from "lucide-react";
import type { Priority, WorkOrder } from "@/domain/types";
import { woIsOpen, woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { DAY, HOUR, MIN, fromInput, toInputDateTime } from "@/lib/time";
import { useForge } from "@/store/store";
import { Drawer } from "@/components/ui/overlay";
import { Member, useLookup } from "@/components/ui/page";
import { Button, Code, DataList, Field, Input, Progress, Select } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { isLate, isStarted, type Conflict } from "./model";
import { PriorityLabel } from "./parts";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export function OrderDrawer({
  wo,
  conflicts,
  canManage,
  onClose,
  onResolve,
  announce,
}: {
  wo: WorkOrder | null;
  /** Conflicts that involve this order. */
  conflicts: Conflict[];
  canManage: boolean;
  onClose: () => void;
  onResolve: (c: Conflict) => void;
  announce: (text: string) => void;
}) {
  const { t } = useT();
  return (
    <Drawer open={!!wo} onClose={onClose} eyebrow={t("planning.details.eyebrow")} title={wo ? <Code className="text-[15px]">{wo.id}</Code> : ""} width={460}>
      {wo && <OrderBody wo={wo} conflicts={conflicts} canManage={canManage} onResolve={onResolve} announce={announce} />}
    </Drawer>
  );
}

function OrderBody({ wo, conflicts, canManage, onResolve, announce }: { wo: WorkOrder; conflicts: Conflict[]; canManage: boolean; onResolve: (c: Conflict) => void; announce: (text: string) => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const product = look.product(wo.productId);
  const line = look.line(wo.lineId);
  const late = isLate(wo);
  const open = woIsOpen(wo);
  const progress = woProgress(wo);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind="wo" value={wo.status} />
        <span className="inline-flex h-[21px] items-center rounded-sm border border-line-2 px-1.5 text-[11px] font-semibold text-ink-2">
          <PriorityLabel priority={wo.priority} />
        </span>
        <Link href={entityHref({ type: "workOrder", id: wo.id })} className="ms-auto inline-flex items-center gap-1 rounded-sm text-[12px] font-medium text-ink-2 underline decoration-line-2 decoration-dotted underline-offset-[3px] hover:text-forge-text">
          {t("planning.details.openOrder")}
          <ArrowUpRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
        </Link>
      </div>

      {conflicts.map((c) => {
        const other = c.a.id === wo.id ? c.b : c.a;
        return (
          <div key={c.key} role="status" className="flex flex-col gap-2 rounded-md border border-danger/45 bg-danger/10 p-3">
            <p className="flex items-start gap-2 text-[12.5px] text-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
              <span>{t("planning.details.conflict", { other: other.id, line: c.lineId, from: fmt.dateTime(c.from), to: fmt.dateTime(c.to) })}</span>
            </p>
            {canManage && (
              <div className="flex flex-wrap items-center justify-between gap-2 ps-[22px]">
                <span className="text-[11.5px] text-ink-2">{t("planning.conflicts.suggestion", { move: c.move.id, keep: c.keep.id, time: fmt.dateTime(c.newStart) })}</span>
                <Button size="sm" icon={Wand2} onClick={() => onResolve(c)}>
                  {t("planning.conflicts.resolve")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {late && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-amber/45 bg-amber/10 p-3 text-[12.5px] text-ink">
          <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber" />
          <span>{t("planning.details.late", { end: fmt.dateTime(wo.plannedEnd), due: fmt.dateTime(wo.dueDate), by: fmt.duration((wo.plannedEnd - wo.dueDate) / MIN) })}</span>
        </p>
      )}

      <DataList
        items={[
          { label: t("common.product"), value: product ? tl(product.name) : "—" },
          { label: t("common.quantity"), value: <span className="num">{fmt.num(wo.completedQty)} / {fmt.num(wo.plannedQty)} {t("common.units")}</span> },
          { label: t("common.line"), value: line ? <span><Code>{line.code}</Code> · {tl(line.name)}</span> : <span className="text-ink-3">{t("common.unassigned")}</span> },
          { label: t("common.supervisor"), value: <Member id={wo.supervisorId} /> },
          { label: t("planning.field.start"), value: <span className="num">{fmt.dateTime(wo.plannedStart)}</span> },
          { label: t("planning.field.end"), value: <span className="num">{fmt.dateTime(wo.plannedEnd)}</span> },
          { label: t("planning.details.duration"), value: <span className="num">{fmt.duration((wo.plannedEnd - wo.plannedStart) / MIN)}</span> },
          { label: t("common.due"), value: <span className="num">{fmt.dateTime(wo.dueDate)}</span> },
        ]}
      />

      {(isStarted(wo) || wo.status === "completed") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="label">{t("common.progress")}</span>
            <span className="num font-semibold text-ink">{fmt.pct(progress, 0)}</span>
          </div>
          <Progress value={progress} tone={wo.status === "paused" ? "warn" : "ok"} label={t("common.progress")} thick />
        </div>
      )}

      <div className="border-t border-line pt-4">
        {!open ? (
          <p className="text-[12.5px] text-ink-3">{t("planning.details.closed")}</p>
        ) : !canManage ? (
          <p className="text-[12.5px] text-ink-3">{t("common.readOnly")}</p>
        ) : (
          <EditForm key={`${wo.id}:${wo.plannedStart}:${wo.plannedEnd}:${wo.lineId}:${wo.priority}:${wo.status}`} wo={wo} announce={announce} />
        )}
      </div>
    </div>
  );
}

function EditForm({ wo, announce }: { wo: WorkOrder; announce: (text: string) => void }) {
  const { t, td, tl, tm } = useT();
  const fmt = useFmt();
  const lines = useForge((s) => s.lines);
  const scheduleWorkOrder = useForge((s) => s.scheduleWorkOrder);
  const updateWorkOrder = useForge((s) => s.updateWorkOrder);
  const run = useAction();

  const [start, setStart] = useState(toInputDateTime(wo.plannedStart));
  const [end, setEnd] = useState(toInputDateTime(wo.plannedEnd));
  const [lineId, setLineId] = useState(wo.lineId ?? "");
  const [priority, setPriority] = useState<Priority>(wo.priority);
  const [error, setError] = useState<{ field: "start" | "end" | "line"; text: string } | null>(null);

  const draft = wo.status === "draft";
  const lineLocked = isStarted(wo);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = fromInput(start);
    const en = fromInput(end);
    if (!Number.isFinite(s)) return setError({ field: "start", text: t("err.dateRequired") });
    if (!Number.isFinite(en)) return setError({ field: "end", text: t("err.dateRequired") });
    if (en <= s) return setError({ field: "end", text: t("err.endAfterStart") });
    if (draft && !lineId) return setError({ field: "line", text: t("err.woNeedsLine") });
    setError(null);
    const windowChanged = s !== wo.plannedStart || en !== wo.plannedEnd;
    const lineChanged = (lineId || null) !== wo.lineId;
    // Priority first: it never fails on an open order and keeps the patch small.
    if (priority !== wo.priority) {
      const r = updateWorkOrder(wo.id, { priority });
      if (!r.ok) return setError({ field: "line", text: tm(r.error) });
    }
    if (lineId && (draft || windowChanged || lineChanged)) {
      if (run(scheduleWorkOrder(wo.id, { lineId, plannedStart: s, plannedEnd: en }), draft ? t("planning.toast.scheduled", { id: wo.id }) : t("common.saved"))) {
        announce(t("planning.announce.movedLine", { id: wo.id, line: lineId, start: fmt.dateTime(s), end: fmt.dateTime(en) }));
      }
    } else if (windowChanged) {
      run(updateWorkOrder(wo.id, { plannedStart: s, plannedEnd: en }), t("common.saved"));
    } else if (priority !== wo.priority) {
      run({ ok: true }, t("common.saved"));
    }
  };

  const nudge = (delta: number) => {
    const s = wo.plannedStart + delta;
    const en = wo.plannedEnd + delta;
    if (run(updateWorkOrder(wo.id, { plannedStart: s, plannedEnd: en }))) {
      announce(t("planning.announce.moved", { id: wo.id, start: fmt.dateTime(s), end: fmt.dateTime(en) }));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h3 className="label">{draft ? t("planning.details.scheduleTitle") : t("planning.details.editTitle")}</h3>

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">{t("planning.nudge.label")}</div>
        <div className="grid grid-cols-4 gap-1.5">
          <Button size="sm" className="num" onClick={() => nudge(-DAY)}>
            {t("planning.nudge.dayBack")}
          </Button>
          <Button size="sm" className="num" onClick={() => nudge(-HOUR)}>
            {t("planning.nudge.hourBack")}
          </Button>
          <Button size="sm" className="num" onClick={() => nudge(HOUR)}>
            {t("planning.nudge.hourFwd")}
          </Button>
          <Button size="sm" className="num" onClick={() => nudge(DAY)}>
            {t("planning.nudge.dayFwd")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("planning.field.start")} error={error?.field === "start" ? error.text : null}>
          {(p) => <Input {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />}
        </Field>
        <Field label={t("planning.field.end")} error={error?.field === "end" ? error.text : null}>
          {(p) => <Input {...p} type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />}
        </Field>
        <Field label={t("common.line")} hint={lineLocked ? t("err.woLineLocked") : undefined} error={error?.field === "line" ? error.text : null}>
          {(p) => (
            <Select {...p} value={lineId} disabled={lineLocked} onChange={(e) => setLineId(e.target.value)}>
              {!wo.lineId && <option value="">{t("planning.field.pickLine")}</option>}
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {tl(l.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("common.priority")}>
          {(p) => (
            <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {td(`priority.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" icon={draft ? CalendarCheck : undefined}>
          {draft ? t("planning.action.schedule") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
