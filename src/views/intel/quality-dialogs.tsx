"use client";
/**
 * Quality workflows: create inspection, record results, assign / resolve a
 * corrective action. All mutations go through the store actions.
 */
import { useId, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { z } from "zod";
import type { ID } from "@/domain/types";
import { QUALITY_FAIL_RATE, QUALITY_WATCH_RATE, inspectionOutcome } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, fromInput, toInputDate, toInputDateTime } from "@/lib/time";
import { useForge } from "@/store/store";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Button, Code, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { toast, useAction } from "@/components/ui/toast";
import { DEFECT_CATS, LimitBar } from "./shared";

type Errors = Record<string, string>;

function fieldErrors(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function Footer({ formId, onClose, submitLabel, disabled }: { formId: string; onClose: () => void; submitLabel: string; disabled?: boolean }) {
  const { t } = useT();
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button variant="primary" type="submit" form={formId} disabled={disabled}>
        {submitLabel}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Create inspection                                                   */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  workOrderId: z.string().min(1, "err.required"),
  inspectorId: z.string().min(1, "err.required"),
  date: z.number({ error: "err.dateRequired" }),
  notes: z.string().max(600, "quality.err.notesLong"),
});

export function CreateInspectionDialog({ open, onClose, presetWorkOrder, onCreated }: { open: boolean; onClose: () => void; presetWorkOrder?: string | null; onCreated?: (id: ID) => void }) {
  const { t } = useT();
  const formId = useId();
  return (
    <Modal open={open} onClose={onClose} title={t("quality.create.title")} description={t("quality.create.desc")} footer={<Footer formId={formId} onClose={onClose} submitLabel={t("quality.create.submit")} />}>
      <CreateForm formId={formId} presetWorkOrder={presetWorkOrder} onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

function CreateForm({ formId, presetWorkOrder, onClose, onCreated }: { formId: string; presetWorkOrder?: string | null; onClose: () => void; onCreated?: (id: ID) => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const workOrders = useForge((s) => s.workOrders);
  const products = useForge((s) => s.products);
  const team = useForge((s) => s.team);
  const createInspection = useForge((s) => s.createInspection);

  const eligible = useMemo(() => {
    const rank = { in_progress: 0, paused: 1, scheduled: 2, completed: 3, draft: 4, cancelled: 4 } as const;
    return workOrders
      .filter((w) => w.status !== "draft" && w.status !== "cancelled")
      .sort((a, b) => rank[a.status] - rank[b.status] || b.id.localeCompare(a.id));
  }, [workOrders]);
  const inspectors = useMemo(() => team.filter((m) => m.role === "inspector"), [team]);

  const [workOrderId, setWorkOrderId] = useState(() => (presetWorkOrder && eligible.some((w) => w.id === presetWorkOrder) ? presetWorkOrder : ""));
  const [inspectorId, setInspectorId] = useState(() => inspectors[0]?.id ?? "");
  const [date, setDate] = useState(() => toInputDateTime(useForge.getState().now));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const wo = eligible.find((w) => w.id === workOrderId);
  const product = products.find((p) => p.id === wo?.productId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createSchema.safeParse({ workOrderId, inspectorId, date: fromInput(date), notes: notes.trim() });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const result = createInspection({ ...parsed.data, notes: parsed.data.notes || undefined });
    if (run(result, t("quality.create.done"), result.ok && result.id ? t("quality.create.doneBody", { id: result.id, wo: workOrderId }) : undefined)) {
      onClose();
      if (result.ok && result.id) onCreated?.(result.id);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t("common.workOrder")}
        error={errors.workOrderId ? td(errors.workOrderId) : null}
        hint={wo && product ? t("quality.create.woHint", { product: product.name, produced: fmt.num(wo.completedQty), planned: fmt.num(wo.plannedQty) }) : t("quality.create.woEligible")}
        className="sm:col-span-2"
      >
        {(p) => (
          <Select {...p} data-autofocus value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)}>
            <option value="">{t("quality.create.selectWo")}</option>
            {eligible.map((w) => {
              const pr = products.find((x) => x.id === w.productId);
              return (
                <option key={w.id} value={w.id}>
                  {`${w.id} · ${pr ? tl(pr.name) : w.productId} · ${td(`wostatus.${w.status}`)}`}
                </option>
              );
            })}
          </Select>
        )}
      </Field>
      <Field label={t("common.inspector")} error={errors.inspectorId ? td(errors.inspectorId) : null}>
        {(p) => (
          <Select {...p} value={inspectorId} onChange={(e) => setInspectorId(e.target.value)}>
            {inspectors.length === 0 && <option value="">{t("quality.create.noInspectors")}</option>}
            {inspectors.map((m) => (
              <option key={m.id} value={m.id}>
                {tl(m.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("quality.field.dateTime")} error={errors.date ? td(errors.date) : null}>
        {(p) => <Input {...p} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label={t("common.notes")} optional error={errors.notes ? td(errors.notes) : null} className="sm:col-span-2">
        {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("quality.create.notesPh")} />}
      </Field>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Record results                                                      */
/* ------------------------------------------------------------------ */

const recordSchema = (max: number) =>
  z
    .object({
      inspectedQty: z.number({ error: "err.qtyPositive" }).int("err.qtyPositive").positive("err.qtyPositive").max(max, "err.inspAboveProduced"),
      defects: z.array(
        z.object({
          category: z.enum(DEFECT_CATS),
          qty: z.number({ error: "err.qtyInteger" }).int("err.qtyInteger").min(0, "err.qtyInteger"),
          note: z.string().max(200).optional(),
        }),
      ),
      notes: z.string().max(600, "quality.err.notesLong"),
    })
    .refine((v) => v.defects.reduce((s, d) => s + d.qty, 0) <= v.inspectedQty, { path: ["defects"], error: "err.rejectedAboveInspected" });

const toNum = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function RecordResultsDialog({ open, onClose, inspectionId }: { open: boolean; onClose: () => void; inspectionId: ID | null }) {
  const { t } = useT();
  const formId = useId();
  const produced = useForge((s) => {
    const qi = s.inspections.find((x) => x.id === inspectionId);
    return qi ? (s.workOrders.find((w) => w.id === qi.workOrderId)?.completedQty ?? null) : null;
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t("quality.record.title")}
      description={inspectionId ? <Code>{inspectionId}</Code> : undefined}
      footer={<Footer formId={formId} onClose={onClose} submitLabel={t("quality.record.submit")} disabled={produced === 0} />}
    >
      {inspectionId && <RecordForm formId={formId} inspectionId={inspectionId} onClose={onClose} />}
    </Modal>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-base px-3 py-2.5">
      <div className="label">{label}</div>
      <div className="num mt-1 text-[15px] font-semibold text-ink">{children}</div>
    </div>
  );
}

function RecordForm({ formId, inspectionId, onClose }: { formId: string; inspectionId: ID; onClose: () => void }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const run = useAction();
  const qi = useForge((s) => s.inspections.find((x) => x.id === inspectionId));
  const wo = useForge((s) => s.workOrders.find((w) => w.id === qi?.workOrderId));
  const recordInspection = useForge((s) => s.recordInspection);
  const max = wo ? wo.completedQty : Number.POSITIVE_INFINITY;

  const [inspected, setInspected] = useState(() => {
    if (!qi) return "";
    const base = qi.inspectedQty > 0 ? qi.inspectedQty : Number.isFinite(max) ? max : 0;
    return base > 0 ? String(Math.min(base, max)) : "";
  });
  const [rows, setRows] = useState(() =>
    DEFECT_CATS.map((category) => {
      const d = qi?.defects.find((x) => x.category === category);
      return { category, qty: d ? String(d.qty) : "", note: d?.note ?? "" };
    }),
  );
  const [notes, setNotes] = useState(qi?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});

  if (!qi) return null;

  const inspectedN = toNum(inspected);
  const rejected = rows.reduce((s, r) => s + (Number.isFinite(toNum(r.qty)) ? Math.max(0, toNum(r.qty)) : 0), 0);
  const valid = Number.isFinite(inspectedN) && inspectedN > 0;
  const passed = valid ? Math.max(0, inspectedN - rejected) : 0;
  const rate = valid ? Math.min(1, rejected / inspectedN) : 0;
  const outcome = inspectionOutcome(valid ? inspectedN : 0, rejected);

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = recordSchema(max).safeParse({
      inspectedQty: inspectedN,
      defects: rows.map((r) => ({ category: r.category, qty: r.qty.trim() === "" ? 0 : Number(r.qty), note: r.note.trim() || undefined })),
      notes: notes.trim(),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const result = recordInspection(qi.id, parsed.data);
    if (!result.ok) {
      run(result);
      return;
    }
    const final = inspectionOutcome(parsed.data.inspectedQty, rejected);
    if (final === "failed") toast("warning", t("quality.record.doneFailed", { id: qi.id }), t("quality.record.failedBody"));
    else toast("success", t("quality.record.done", { id: qi.id }), t(final === "passed" ? "quality.record.passedBody" : "quality.record.conditionalBody"));
    onClose();
  };

  if (wo && wo.completedQty <= 0) {
    return (
      <form id={formId} onSubmit={(e) => e.preventDefault()}>
        <p className="rounded-md border border-line bg-canvas px-3 py-3 text-[13px] text-ink-2">{t("quality.record.nothingProduced", { wo: wo.id })}</p>
      </form>
    );
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-5">
      <Field
        label={t("quality.field.inspectedQty")}
        error={errors.inspectedQty ? td(errors.inspectedQty, { qty: wo?.completedQty ?? 0 }) : null}
        hint={wo ? t("quality.record.limitHint", { qty: fmt.num(wo.completedQty), wo: wo.id }) : undefined}
        className="max-w-xs"
      >
        {(p) => <Input {...p} data-autofocus type="number" inputMode="numeric" min={1} max={Number.isFinite(max) ? max : undefined} step={1} value={inspected} onChange={(e) => setInspected(e.target.value)} />}
      </Field>

      <fieldset>
        <legend className="text-[12px] font-medium text-ink-2">{t("quality.record.defects")}</legend>
        <p className="mt-0.5 text-[11.5px] text-ink-3">{t("quality.record.defectsHint")}</p>
        <div className="mt-2 divide-y divide-line/70 rounded-md border border-line">
          {rows.map((r, i) => (
            <div key={r.category} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 px-3 py-2 sm:grid-cols-[150px_96px_minmax(0,1fr)]">
              <span className="truncate text-[12.5px] text-ink">{td(`defect.${r.category}`)}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="0"
                aria-label={t("quality.record.qtyFor", { category: td(`defect.${r.category}`) })}
                value={r.qty}
                onChange={(e) => setRow(i, { qty: e.target.value })}
              />
              <Input
                className="col-span-2 sm:col-span-1"
                placeholder={t("quality.record.notePh")}
                aria-label={t("quality.record.noteFor", { category: td(`defect.${r.category}`) })}
                maxLength={200}
                value={r.note}
                onChange={(e) => setRow(i, { note: e.target.value })}
              />
            </div>
          ))}
        </div>
        {errors.defects && (
          <p role="alert" className="mt-1.5 text-[11.5px] text-danger">
            {td(errors.defects)}
          </p>
        )}
      </fieldset>

      <section aria-live="polite" className="rounded-md border border-line bg-canvas/50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="label">{t("quality.record.predicted")}</span>
          {valid ? <StatusBadge kind="inspection" value={outcome} /> : <span className="text-[12px] text-ink-3">{t("quality.record.enterQty")}</span>}
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line">
          <Figure label={t("quality.col.passed")}>{fmt.num(passed)}</Figure>
          <Figure label={t("quality.col.rejected")}>{fmt.num(rejected)}</Figure>
          <Figure label={t("quality.col.rejectRate")}>{fmt.pct(rate, 2)}</Figure>
        </div>
        <LimitBar rate={rate} className="mt-3" />
        <p className="mt-2 text-[11.5px] text-ink-3">{t("quality.record.rule", { watch: fmt.pct(QUALITY_WATCH_RATE), fail: fmt.pct(QUALITY_FAIL_RATE) })}</p>
      </section>

      <Field label={t("common.notes")} optional error={errors.notes ? td(errors.notes) : null}>
        {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Corrective action                                                   */
/* ------------------------------------------------------------------ */

const caSchema = z.object({
  description: z.string().min(5, "quality.err.caDescription").max(600, "quality.err.notesLong"),
  assigneeId: z.string().min(1, "err.required"),
  dueDate: z.number({ error: "err.dateRequired" }),
});

export function CorrectiveActionDialog({ open, onClose, inspectionId }: { open: boolean; onClose: () => void; inspectionId: ID | null }) {
  const { t } = useT();
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("quality.ca.assignTitle")}
      description={inspectionId ? <Code>{inspectionId}</Code> : undefined}
      footer={<Footer formId={formId} onClose={onClose} submitLabel={t("quality.ca.assignSubmit")} />}
    >
      {inspectionId && <CaForm formId={formId} inspectionId={inspectionId} onClose={onClose} />}
    </Modal>
  );
}

function CaForm({ formId, inspectionId, onClose }: { formId: string; inspectionId: ID; onClose: () => void }) {
  const { t, td, tl } = useT();
  const run = useAction();
  const qi = useForge((s) => s.inspections.find((x) => x.id === inspectionId));
  const team = useForge((s) => s.team);
  const assign = useForge((s) => s.assignCorrectiveAction);
  const existing = qi?.correctiveAction;

  const [description, setDescription] = useState(existing?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(existing?.assigneeId ?? "");
  const [due, setDue] = useState(() => toInputDate(existing?.dueDate ?? useForge.getState().now + 5 * DAY));
  const [errors, setErrors] = useState<Errors>({});

  const members = useMemo(() => team.filter((m) => m.role !== "viewer"), [team]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = caSchema.safeParse({ description: description.trim(), assigneeId, dueDate: fromInput(due) });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    // Due at the end of the chosen day so "overdue" starts the day after.
    if (run(assign(inspectionId, { ...parsed.data, dueDate: parsed.data.dueDate + DAY - 1 }), t("quality.ca.assigned"))) onClose();
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label={t("common.description")} error={errors.description ? td(errors.description) : null} className="sm:col-span-2">
        {(p) => <Textarea {...p} data-autofocus rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("quality.ca.descPh")} />}
      </Field>
      <Field label={t("common.assignee")} error={errors.assigneeId ? td(errors.assigneeId) : null}>
        {(p) => (
          <Select {...p} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t("quality.ca.selectAssignee")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {`${tl(m.name)} · ${td(`role.${m.role}`)}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("quality.ca.dueDate")} error={errors.dueDate ? td(errors.dueDate) : null}>
        {(p) => <Input {...p} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
      </Field>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog host shared by the list and the detail page                  */
/* ------------------------------------------------------------------ */

type DialogKind = "record" | "ca" | "resolve";

/**
 * const dialogs = useQualityDialogs();  dialogs.open("record", id);  {dialogs.node}
 * Forms are keyed per opening so they always start from the stored record.
 */
export function useQualityDialogs() {
  const { t } = useT();
  const run = useAction();
  const resolve = useForge((s) => s.resolveCorrectiveAction);
  const [state, setState] = useState<{ kind: DialogKind; id: ID; open: boolean; nonce: number }>({ kind: "record", id: "", open: false, nonce: 0 });
  const close = () => setState((s) => ({ ...s, open: false }));
  const id = state.id || null;
  const key = `${state.id}-${state.nonce}`;
  const node = (
    <>
      <RecordResultsDialog key={`r-${key}`} open={state.open && state.kind === "record"} onClose={close} inspectionId={state.kind === "record" ? id : null} />
      <CorrectiveActionDialog key={`c-${key}`} open={state.open && state.kind === "ca"} onClose={close} inspectionId={state.kind === "ca" ? id : null} />
      <ConfirmDialog
        open={state.open && state.kind === "resolve"}
        onClose={close}
        onConfirm={() => run(resolve(state.id), t("quality.ca.resolved"), t("quality.ca.resolvedBody"))}
        title={t("quality.ca.resolveTitle")}
        body={t("quality.ca.resolveBody", { id: state.id })}
        confirmLabel={t("quality.ca.resolve")}
      />
    </>
  );
  return { open: (kind: DialogKind, target: ID) => setState((s) => ({ kind, id: target, open: true, nonce: s.nonce + 1 })), node };
}
