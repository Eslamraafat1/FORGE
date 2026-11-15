"use client";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { CalendarCheck, Inbox } from "lucide-react";
import type { ID, ProductionLine, WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { MIN, fromInput, toInputDateTime } from "@/lib/time";
import { useForge } from "@/store/store";
import { Modal } from "@/components/ui/overlay";
import { useLookup } from "@/components/ui/page";
import { Button, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { useAction } from "@/components/ui/toast";
import { PriorityLabel } from "./parts";

/** Prefer the line that already builds this product. */
function defaultLine(wo: WorkOrder | undefined, lines: ProductionLine[]): ID {
  if (!wo) return lines[0]?.id ?? "";
  return wo.lineId ?? lines.find((l) => l.productId === wo.productId)?.id ?? lines[0]?.id ?? "";
}

export function ScheduleModal({ open, initialId, onClose, onScheduled }: { open: boolean; initialId: ID | null; onClose: () => void; onScheduled: (wo: WorkOrder, start: number) => void }) {
  const { t } = useT();
  const formId = useId();
  const hasDrafts = useForge((s) => s.workOrders.some((w) => w.status === "draft"));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("planning.schedule.title")}
      description={t("planning.schedule.desc")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={CalendarCheck} disabled={!hasDrafts}>
            {t("planning.action.schedule")}
          </Button>
        </>
      }
    >
      <ScheduleForm formId={formId} initialId={initialId} onClose={onClose} onScheduled={onScheduled} />
    </Modal>
  );
}

function ScheduleForm({ formId, initialId, onClose, onScheduled }: { formId: string; initialId: ID | null; onClose: () => void; onScheduled: (wo: WorkOrder, start: number) => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const workOrders = useForge((s) => s.workOrders);
  const lines = useForge((s) => s.lines);
  const scheduleWorkOrder = useForge((s) => s.scheduleWorkOrder);
  const run = useAction();

  const drafts = workOrders.filter((w) => w.status === "draft");
  const first = drafts.find((w) => w.id === initialId) ?? drafts[0];

  const [orderId, setOrderId] = useState<ID>(first?.id ?? "");
  const [lineId, setLineId] = useState<ID>(defaultLine(first, lines));
  const [start, setStart] = useState(first ? toInputDateTime(first.plannedStart) : "");
  const [end, setEnd] = useState(first ? toInputDateTime(first.plannedEnd) : "");
  const [error, setError] = useState<{ field: "start" | "end" | "line"; text: string } | null>(null);

  const order = drafts.find((w) => w.id === orderId);

  if (!order) {
    return <EmptyState icon={Inbox} title={t("planning.unscheduled.empty")} hint={t("planning.unscheduled.emptyHint")} />;
  }

  const pickOrder = (id: ID) => {
    const next = drafts.find((w) => w.id === id);
    setOrderId(id);
    if (next) {
      setLineId(defaultLine(next, lines));
      setStart(toInputDateTime(next.plannedStart));
      setEnd(toInputDateTime(next.plannedEnd));
    }
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = fromInput(start);
    const en = fromInput(end);
    if (!lineId) return setError({ field: "line", text: t("err.woNeedsLine") });
    if (!Number.isFinite(s)) return setError({ field: "start", text: t("err.dateRequired") });
    if (!Number.isFinite(en)) return setError({ field: "end", text: t("err.dateRequired") });
    if (en <= s) return setError({ field: "end", text: t("err.endAfterStart") });
    setError(null);
    if (run(scheduleWorkOrder(order.id, { lineId, plannedStart: s, plannedEnd: en }), t("planning.toast.scheduled", { id: order.id }), t("planning.toast.scheduledBody", { line: lineId, start: fmt.dateTime(s) }))) {
      onScheduled(order, s);
      onClose();
    }
  };

  const product = look.product(order.productId);
  const s = fromInput(start);
  const en = fromInput(end);
  const duration = Number.isFinite(s) && Number.isFinite(en) && en > s ? fmt.duration((en - s) / MIN) : null;

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label={t("common.workOrder")}>
        {(p) => (
          <Select {...p} data-autofocus value={orderId} onChange={(e) => pickOrder(e.target.value)}>
            {drafts.map((w) => {
              const pr = look.product(w.productId);
              return (
                <option key={w.id} value={w.id}>
                  {w.id} — {pr ? tl(pr.name) : w.productId} · {fmt.num(w.plannedQty)}
                </option>
              );
            })}
          </Select>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md border border-line bg-canvas/50 px-3 py-2 text-[12px] text-ink-2">
        <span className="min-w-0 truncate text-ink">{product ? tl(product.name) : order.productId}</span>
        <span className="num">
          {fmt.num(order.plannedQty)} {t("common.units")}
        </span>
        <PriorityLabel priority={order.priority} />
        <span className="num">
          {t("common.due")}: {fmt.dateTime(order.dueDate)}
        </span>
      </div>

      <Field label={t("common.line")} error={error?.field === "line" ? error.text : null}>
        {(p) => (
          <Select {...p} value={lineId} onChange={(e) => setLineId(e.target.value)}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {tl(l.name)}
                {l.productId === order.productId ? ` (${t("planning.schedule.sameProduct")})` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("planning.field.start")} error={error?.field === "start" ? error.text : null}>
          {(p) => <Input {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />}
        </Field>
        <Field label={t("planning.field.end")} error={error?.field === "end" ? error.text : null} hint={duration ? t("planning.schedule.duration", { duration }) : undefined}>
          {(p) => <Input {...p} type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />}
        </Field>
      </div>

      {Number.isFinite(en) && en > order.dueDate && (
        <p role="status" className="text-[12px] text-amber">
          {t("planning.schedule.lateWarning", { due: fmt.dateTime(order.dueDate) })}
        </p>
      )}
    </form>
  );
}
