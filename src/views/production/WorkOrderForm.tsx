"use client";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import type { ID, Priority, WorkOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, HOUR, fromInput, toInputDateTime } from "@/lib/time";
import { useForge, type WorkOrderInput } from "@/store/store";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useAction } from "@/components/ui/toast";
import { PRIORITIES } from "./shared";

/** Messages are dictionary keys. The store re-validates everything on submit. */
const schema = z
  .object({
    productId: z.string().min(1, "err.required"),
    lineId: z.string(),
    plannedQty: z.number("err.qtyPositive").int("err.qtyPositive").positive("err.qtyPositive"),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    plannedStart: z.number("err.dateRequired"),
    plannedEnd: z.number("err.dateRequired"),
    dueDate: z.number("err.dateRequired"),
    supervisorId: z.string().min(1, "err.required"),
    notes: z.string().max(400, "wo.form.notesTooLong"),
  })
  .superRefine((v, ctx) => {
    if (Number.isFinite(v.plannedStart) && Number.isFinite(v.plannedEnd) && !(v.plannedEnd > v.plannedStart)) {
      ctx.addIssue({ code: "custom", path: ["plannedEnd"], message: "err.endAfterStart" });
    }
    if (Number.isFinite(v.plannedStart) && Number.isFinite(v.dueDate) && v.dueDate < v.plannedStart) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "wo.form.dueBeforeStart" });
    }
  });

interface FormState {
  productId: ID;
  lineId: ID | "";
  plannedQty: string;
  priority: Priority;
  plannedStart: string;
  plannedEnd: string;
  dueDate: string;
  supervisorId: ID;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

function WorkOrderFormBody({ formId, order, defaultLineId, onDone }: { formId: string; order?: WorkOrder; defaultLineId?: ID; onDone: (id?: ID) => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const products = useForge((s) => s.products);
  const lines = useForge((s) => s.lines);
  const team = useForge((s) => s.team);
  const now = useForge((s) => s.now);
  const createWorkOrder = useForge((s) => s.createWorkOrder);
  const updateWorkOrder = useForge((s) => s.updateWorkOrder);

  const [form, setForm] = useState<FormState>(() => {
    if (order) {
      return {
        productId: order.productId,
        lineId: order.lineId ?? "",
        plannedQty: String(order.plannedQty),
        priority: order.priority,
        plannedStart: toInputDateTime(order.plannedStart),
        plannedEnd: toInputDateTime(order.plannedEnd),
        dueDate: toInputDateTime(order.dueDate),
        supervisorId: order.supervisorId,
        notes: order.notes ?? "",
      };
    }
    const line = lines.find((l) => l.id === defaultLineId);
    const start = Math.ceil((now + 1) / HOUR) * HOUR + HOUR;
    return {
      productId: line?.productId ?? products[0]?.id ?? "",
      lineId: line?.id ?? "",
      plannedQty: "",
      priority: "medium",
      plannedStart: toInputDateTime(start),
      plannedEnd: toInputDateTime(start + 8 * HOUR),
      dueDate: toInputDateTime(start + 2 * DAY),
      supervisorId: line?.supervisorId ?? team.find((m) => m.role === "supervisor")?.id ?? "",
      notes: "",
    };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const supervisors = useMemo(
    () => team.filter((m) => m.role === "supervisor" || m.role === "ops_manager" || m.id === order?.supervisorId),
    [team, order?.supervisorId],
  );

  const lineLocked = order?.status === "in_progress" || order?.status === "paused";
  const productLocked = (order?.completedQty ?? 0) > 0;
  const line = lines.find((l) => l.id === form.lineId);
  const qty = form.plannedQty.trim() === "" ? NaN : Number(form.plannedQty);
  const runMinutes = line && Number.isFinite(qty) && qty > 0 ? (qty / line.nominalRate) * 60 : null;
  const startTs = fromInput(form.plannedStart);

  const onLineChange = (lineId: ID | "") => {
    const next = lines.find((l) => l.id === lineId);
    setForm((f) => ({
      ...f,
      lineId,
      // New orders follow the line: its supervisor and the product it is set up for.
      supervisorId: !order && next ? next.supervisorId : f.supervisorId,
    }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      productId: form.productId,
      lineId: form.lineId,
      plannedQty: qty,
      priority: form.priority,
      plannedStart: startTs,
      plannedEnd: fromInput(form.plannedEnd),
      dueDate: fromInput(form.dueDate),
      supervisorId: form.supervisorId,
      notes: form.notes,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    const v = parsed.data;
    const input: WorkOrderInput = { ...v, lineId: v.lineId || null, notes: v.notes.trim() || undefined };
    if (order) {
      if (run(updateWorkOrder(order.id, input), t("wo.updated", { id: order.id }))) onDone(order.id);
    } else {
      const result = createWorkOrder(input);
      const body = input.lineId ? t("wo.created.scheduled", { line: input.lineId }) : t("wo.created.draft");
      if (run(result, t("wo.created", { id: result.ok ? (result.id ?? "") : "" }), body)) onDone(result.ok ? result.id : undefined);
    }
  };

  const err = (key: keyof FormState) => (errors[key] ? td(errors[key]) : null);

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
      <Field label={t("common.product")} error={err("productId")} hint={productLocked ? t("wo.form.productLocked") : undefined}>
        {(p) => (
          <Select {...p} data-autofocus value={form.productId} disabled={productLocked} onChange={(e) => set("productId", e.target.value)}>
            {products.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.sku} — {tl(pr.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t("common.line")}
        optional={!order}
        error={err("lineId")}
        hint={
          lineLocked
            ? t("wo.form.lineLocked")
            : !line
              ? t("wo.form.noLineHint")
              : line.productId !== form.productId
                ? t("wo.form.changeoverHint", { line: line.code })
                : t("wo.form.lineHint", { rate: fmt.num(line.nominalRate) })
        }
      >
        {(p) => (
          <Select {...p} value={form.lineId} disabled={lineLocked} onChange={(e) => onLineChange(e.target.value)}>
            <option value="">{t("wo.form.noLine")}</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {tl(l.name)} ({td(`lstatus.${l.status}`)})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t("wo.plannedQty")}
        error={err("plannedQty")}
        hint={order && order.completedQty > 0 ? t("wo.form.qtyFloor", { qty: fmt.num(order.completedQty) }) : t("wo.form.qtyHint")}
      >
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} step={1} value={form.plannedQty} onChange={(e) => set("plannedQty", e.target.value)} />}
      </Field>
      <Field label={t("common.priority")}>
        {(p) => (
          <Select {...p} value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            {PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {td(`priority.${pr}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("wo.plannedStart")} error={err("plannedStart")}>
        {(p) => <Input {...p} type="datetime-local" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} />}
      </Field>
      <Field
        label={t("wo.plannedEnd")}
        error={err("plannedEnd")}
        hint={
          runMinutes !== null ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t("wo.form.runtimeHint", { duration: fmt.duration(runMinutes) })}</span>
              {Number.isFinite(startTs) && (
                <button type="button" className="font-medium text-forge-text underline underline-offset-2" onClick={() => set("plannedEnd", toInputDateTime(startTs + Math.ceil(runMinutes) * 60_000))}>
                  {t("wo.form.useEstimate")}
                </button>
              )}
            </span>
          ) : undefined
        }
      >
        {(p) => <Input {...p} type="datetime-local" value={form.plannedEnd} onChange={(e) => set("plannedEnd", e.target.value)} />}
      </Field>
      <Field label={t("wo.dueDate")} error={err("dueDate")}>
        {(p) => <Input {...p} type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}
      </Field>
      <Field label={t("common.supervisor")} error={err("supervisorId")}>
        {(p) => (
          <Select {...p} value={form.supervisorId} onChange={(e) => set("supervisorId", e.target.value)}>
            {supervisors.map((m) => (
              <option key={m.id} value={m.id}>
                {tl(m.name)} — {td(`role.${m.role}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("common.notes")} optional error={err("notes")} className="sm:col-span-2">
        {(p) => <Textarea {...p} rows={3} maxLength={600} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}
      </Field>
    </form>
  );
}

/** Create (no `order`) or edit a work order. Mounts a fresh form each time it opens. */
export function WorkOrderFormModal({ open, onClose, order, defaultLineId, onSaved }: { open: boolean; onClose: () => void; order?: WorkOrder; defaultLineId?: ID; onSaved?: (id?: ID) => void }) {
  const { t } = useT();
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={order ? t("wo.edit.title", { id: order.id }) : t("wo.create.title")}
      description={order ? t("wo.edit.desc") : t("wo.create.desc")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {order ? t("common.save") : t("wo.create.submit")}
          </Button>
        </>
      }
    >
      <WorkOrderFormBody
        key={order?.id ?? "new"}
        formId={formId}
        order={order}
        defaultLineId={defaultLineId}
        onDone={(id) => {
          onSaved?.(id);
          onClose();
        }}
      />
    </Modal>
  );
}
