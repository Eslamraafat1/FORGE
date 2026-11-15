"use client";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Ban, CalendarCheck, CheckCircle2, Flag, Gauge, MoreHorizontal, Pause, Pencil, Play, Rows3, Undo2 } from "lucide-react";
import type { ID, Priority, WorkOrder, WorkOrderStatus } from "@/domain/types";
import { WO_TRANSITIONS, woIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Button, Code, Field, IconButton, Input, Progress, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Menu, Modal, type MenuItem } from "@/components/ui/overlay";
import { useCan } from "@/components/ui/page";
import { toast, useAction } from "@/components/ui/toast";
import { WorkOrderFormModal } from "./WorkOrderForm";
import { PRIORITIES } from "./shared";

type DialogKind = "edit" | "progress" | "complete" | "cancel" | "priority" | "assign";
interface DialogState {
  kind: DialogKind;
  id: ID;
}

export interface WorkOrderActions {
  canManage: boolean;
  canProgress: boolean;
  /** Menu entries for one order — only transitions allowed by WO_TRANSITIONS. */
  items(wo: WorkOrder): (MenuItem | null)[];
  open(kind: DialogKind, wo: WorkOrder): void;
  /** Start / resume / pause / schedule / return to draft (no confirmation needed). */
  transition(wo: WorkOrder, to: WorkOrderStatus): void;
  /** Render once per view. */
  dialogs: ReactNode;
}

/** All work-order workflows (edit, assign, priority, progress, status changes) for a view. */
export function useWorkOrderActions(): WorkOrderActions {
  const { t } = useT();
  const run = useAction();
  const canManage = useCan("wo.manage");
  const canProgress = useCan("wo.progress");
  const setStatus = useForge((s) => s.setWorkOrderStatus);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const open = (kind: DialogKind, wo: WorkOrder) => setDialog({ kind, id: wo.id });

  const transition = (wo: WorkOrder, to: WorkOrderStatus) => {
    if (to === "completed") return open("complete", wo);
    if (to === "cancelled") return open("cancel", wo);
    if (to === "scheduled" && !wo.lineId) return open("assign", wo);
    const msg =
      to === "in_progress"
        ? wo.status === "paused"
          ? t("wo.toast.resumed", { id: wo.id })
          : t("wo.toast.started", { id: wo.id })
        : to === "paused"
          ? t("wo.toast.paused", { id: wo.id })
          : to === "scheduled"
            ? t("wo.toast.scheduled", { id: wo.id })
            : t("wo.toast.draft", { id: wo.id });
    run(setStatus(wo.id, to), msg);
  };

  const items = (wo: WorkOrder): (MenuItem | null)[] => {
    if (!woIsOpen(wo)) return [];
    const allowed = WO_TRANSITIONS[wo.status];
    const record: MenuItem[] = [{ label: t("wo.act.edit"), icon: Pencil, disabled: !canManage, onSelect: () => open("edit", wo) }];
    if (wo.status === "draft" || wo.status === "scheduled") {
      record.push({ label: wo.lineId ? t("wo.act.reassign") : t("wo.act.assign"), icon: Rows3, disabled: !canManage, onSelect: () => open("assign", wo) });
    }
    record.push({ label: t("wo.act.priority"), icon: Flag, disabled: !canManage, onSelect: () => open("priority", wo) });
    if (wo.status === "in_progress" || wo.status === "paused") {
      record.push({ label: t("wo.act.progress"), icon: Gauge, disabled: !canProgress, onSelect: () => open("progress", wo) });
    }

    const flow: MenuItem[] = [];
    if (allowed.includes("scheduled")) flow.push({ label: t("wo.act.schedule"), icon: CalendarCheck, disabled: !canManage, onSelect: () => transition(wo, "scheduled") });
    if (allowed.includes("in_progress")) {
      flow.push({ label: wo.status === "paused" ? t("wo.act.resume") : t("wo.act.start"), icon: Play, disabled: !canManage, onSelect: () => transition(wo, "in_progress") });
    }
    if (allowed.includes("paused")) flow.push({ label: t("wo.act.pause"), icon: Pause, disabled: !canManage, onSelect: () => transition(wo, "paused") });
    if (allowed.includes("completed")) flow.push({ label: t("wo.act.complete"), icon: CheckCircle2, disabled: !canManage, onSelect: () => open("complete", wo) });
    if (allowed.includes("draft")) flow.push({ label: t("wo.act.toDraft"), icon: Undo2, disabled: !canManage, onSelect: () => transition(wo, "draft") });

    const out: (MenuItem | null)[] = [...record];
    if (flow.length) out.push(null, ...flow);
    if (allowed.includes("cancelled")) out.push(null, { label: t("wo.act.cancel"), icon: Ban, danger: true, disabled: !canManage, onSelect: () => open("cancel", wo) });
    return out;
  };

  const dialogs = <WorkOrderDialogs dialog={dialog} onClose={() => setDialog(null)} />;
  return { canManage, canProgress, items, open, transition, dialogs };
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function WorkOrderDialogs({ dialog, onClose }: { dialog: DialogState | null; onClose: () => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const workOrders = useForge((s) => s.workOrders);
  const products = useForge((s) => s.products);
  const items = useForge((s) => s.items);
  const lines = useForge((s) => s.lines);
  const setStatus = useForge((s) => s.setWorkOrderStatus);
  const progressFormId = useId();
  const priorityFormId = useId();
  const assignFormId = useId();

  const wo = dialog ? workOrders.find((o) => o.id === dialog.id) : undefined;
  const kind = wo ? dialog?.kind : undefined;
  const product = wo ? products.find((p) => p.id === wo.productId) : undefined;
  const line = wo ? lines.find((l) => l.id === wo.lineId) : undefined;
  const good = wo ? wo.completedQty - wo.rejectedQty : 0;
  const finished = wo ? items.find((i) => i.category === "finished" && i.productId === wo.productId) : undefined;

  return (
    <>
      <WorkOrderFormModal open={kind === "edit"} onClose={onClose} order={wo} />

      <Modal
        open={kind === "progress"}
        onClose={onClose}
        size="sm"
        title={t("wo.progress.title", { id: wo?.id ?? "" })}
        description={t("wo.progress.desc")}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" type="submit" form={progressFormId}>
              {t("wo.progress.submit")}
            </Button>
          </>
        }
      >
        {wo && <ProgressForm key={wo.id} formId={progressFormId} order={wo} onDone={onClose} />}
      </Modal>

      <Modal
        open={kind === "priority"}
        onClose={onClose}
        size="sm"
        title={t("wo.priority.title", { id: wo?.id ?? "" })}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" type="submit" form={priorityFormId}>
              {t("common.apply")}
            </Button>
          </>
        }
      >
        {wo && <PriorityForm key={wo.id} formId={priorityFormId} order={wo} onDone={onClose} />}
      </Modal>

      <Modal
        open={kind === "assign"}
        onClose={onClose}
        size="sm"
        title={t("wo.assign.title", { id: wo?.id ?? "" })}
        description={t("wo.assign.desc")}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" type="submit" form={assignFormId}>
              {t("wo.assign.submit")}
            </Button>
          </>
        }
      >
        {wo && <AssignForm key={wo.id} formId={assignFormId} order={wo} onDone={onClose} />}
      </Modal>

      <ConfirmDialog
        open={kind === "complete"}
        onClose={onClose}
        onConfirm={() => wo && run(setStatus(wo.id, "completed"), t("wo.toast.completed", { id: wo.id }), t("wo.toast.completedBody", { qty: fmt.num(good) }))}
        title={t("wo.complete.title", { id: wo?.id ?? "" })}
        confirmLabel={t("wo.complete.confirm")}
        body={
          wo && (
            <div className="space-y-3">
              <p>{t("wo.complete.body", { completed: fmt.num(wo.completedQty), planned: fmt.num(wo.plannedQty) })}</p>
              {wo.completedQty < wo.plannedQty && (
                <p className="rounded-sm border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-[12.5px] text-ink">
                  {t("wo.complete.short", { missing: fmt.num(wo.plannedQty - wo.completedQty) })}
                </p>
              )}
              <div>
                <p className="label mb-1.5">{t("wo.complete.cascade")}</p>
                <ul className="list-disc space-y-1.5 ps-4 text-[12.5px]">
                  <li>
                    {t("wo.complete.materials")}
                    {product && (
                      <ul className="mt-1 space-y-0.5">
                        {product.bom.map((b) => {
                          const item = items.find((i) => i.id === b.itemId);
                          return (
                            <li key={b.itemId} className="flex items-baseline justify-between gap-3">
                              <span className="min-w-0 truncate">
                                <Code>{b.itemId}</Code> {item ? tl(item.name) : ""}
                              </span>
                              <span className="num shrink-0 text-ink">
                                −{fmt.num(Math.round(b.qtyPerUnit * wo.completedQty * 100) / 100, Number.isInteger(b.qtyPerUnit * wo.completedQty) ? 0 : 1)} {item?.unit}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                  <li>{t("wo.complete.finished", { qty: fmt.num(good), sku: finished?.sku ?? product?.sku ?? "" })}</li>
                  {line && <li>{t("wo.complete.line", { line: line.code })}</li>}
                  <li>{t("wo.complete.final")}</li>
                </ul>
              </div>
            </div>
          )
        }
      />

      <ConfirmDialog
        open={kind === "cancel"}
        onClose={onClose}
        onConfirm={() => wo && run(setStatus(wo.id, "cancelled"), t("wo.toast.cancelled", { id: wo.id }))}
        danger
        title={t("wo.cancel.title", { id: wo?.id ?? "" })}
        confirmLabel={t("wo.cancel.confirm")}
        body={
          wo && (
            <>
              <p>{t("wo.cancel.body")}</p>
              <ul className="mt-2 list-disc space-y-1 ps-4">
                {wo.completedQty > 0 && <li>{t("wo.cancel.produced", { qty: fmt.num(wo.completedQty) })}</li>}
                {wo.status === "in_progress" && line && <li>{t("wo.cancel.line", { line: line.code })}</li>}
                <li>{t("wo.cancel.final")}</li>
              </ul>
            </>
          )
        }
      />
    </>
  );
}

/** Completed + rejected quantities. The store is the validator; its message is shown inline. */
function ProgressForm({ formId, order, onDone }: { formId: string; order: WorkOrder; onDone: () => void }) {
  const { t, tm } = useT();
  const fmt = useFmt();
  const update = useForge((s) => s.updateWorkOrderProgress);
  const [completed, setCompleted] = useState(String(order.completedQty));
  const [rejected, setRejected] = useState(String(order.rejectedQty));
  const [error, setError] = useState<{ key: string; text: string } | null>(null);

  const c = completed.trim() === "" ? NaN : Number(completed);
  const r = rejected.trim() === "" ? NaN : Number(rejected);
  const valid = Number.isFinite(c) && Number.isFinite(r) && c >= 0 && r >= 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = update(order.id, c, r);
    if (result.ok) {
      toast("success", t("wo.progress.saved", { id: order.id }), t("wo.progress.savedBody", { qty: fmt.num(c), total: fmt.num(order.plannedQty) }));
      onDone();
    } else setError({ key: result.error.key, text: tm(result.error) });
  };

  const onRejected = error?.key === "err.rejectedAboveCompleted";
  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-4">
      <div className="rounded-md border border-line bg-canvas/50 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3 text-[12px] text-ink-3">
          <span>{t("wo.progress.preview")}</span>
          <span className="num text-ink">
            {valid ? fmt.num(c) : "—"} / {fmt.num(order.plannedQty)}
          </span>
        </div>
        <Progress className="mt-2" thick value={valid && order.plannedQty > 0 ? c / order.plannedQty : 0} label={t("common.progress")} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
          <span>
            {t("wo.good")}: <span className="num text-ink">{valid ? fmt.num(c - r) : "—"}</span>
          </span>
          <span>
            {t("wo.yield")}: <span className="num text-ink">{valid && c > 0 ? fmt.pct((c - r) / c) : "—"}</span>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wo.completedQty")} error={error && !onRejected ? error.text : null} hint={t("wo.progress.max", { qty: fmt.num(order.plannedQty) })}>
          {(p) => (
            <Input
              {...p}
              data-autofocus
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={completed}
              onChange={(e) => {
                setCompleted(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field label={t("wo.rejectedQty")} error={onRejected ? error.text : null}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={rejected}
              onChange={(e) => {
                setRejected(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
      </div>
      <p className="text-[11.5px] text-ink-3">{t("wo.progress.note")}</p>
    </form>
  );
}

function PriorityForm({ formId, order, onDone }: { formId: string; order: WorkOrder; onDone: () => void }) {
  const { t, td } = useT();
  const run = useAction();
  const update = useForge((s) => s.updateWorkOrder);
  const [priority, setPriority] = useState<Priority>(order.priority);
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (priority === order.priority || run(update(order.id, { priority }), t("wo.toast.priority", { id: order.id, priority: `@priority.${priority}` }))) onDone();
      }}
    >
      <Field label={t("common.priority")}>
        {(p) => (
          <Select {...p} data-autofocus value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {td(`priority.${pr}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </form>
  );
}

function AssignForm({ formId, order, onDone }: { formId: string; order: WorkOrder; onDone: () => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const lines = useForge((s) => s.lines);
  const update = useForge((s) => s.updateWorkOrder);
  const [lineId, setLineId] = useState<ID | "">(order.lineId ?? "");
  const line = lines.find((l) => l.id === lineId);
  return (
    <form
      id={formId}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const next = lineId || null;
        if (next === order.lineId) return onDone();
        const msg = next ? t("wo.toast.assigned", { id: order.id, line: next }) : t("wo.toast.unassigned", { id: order.id });
        if (run(update(order.id, { lineId: next }), msg)) onDone();
      }}
    >
      <Field
        label={t("common.line")}
        hint={
          !line
            ? t("wo.form.noLineHint")
            : line.productId !== order.productId
              ? t("wo.form.changeoverHint", { line: line.code })
              : t("wo.assign.runtime", { duration: fmt.duration((Math.max(0, order.plannedQty - order.completedQty) / line.nominalRate) * 60), rate: fmt.num(line.nominalRate) })
        }
      >
        {(p) => (
          <Select {...p} data-autofocus value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">{t("wo.form.noLine")}</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {tl(l.name)} ({td(`lstatus.${l.status}`)})
              </option>
            ))}
          </Select>
        )}
      </Field>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk dialogs (work order list)                                      */
/* ------------------------------------------------------------------ */

/** Change the priority of every open order in the selection. */
export function BulkPriorityModal({ open, onClose, orders, onDone }: { open: boolean; onClose: () => void; orders: WorkOrder[]; onDone: () => void }) {
  const { t, td } = useT();
  const fmt = useFmt();
  const update = useForge((s) => s.updateWorkOrder);
  const [priority, setPriority] = useState<Priority>("high");
  const eligible = orders.filter(woIsOpen);
  const apply = () => {
    let changed = 0;
    for (const o of eligible) if (o.priority === priority || update(o.id, { priority }).ok) changed++;
    toast(changed > 0 ? "success" : "warning", t("wo.bulk.priorityDone", { n: fmt.num(changed), priority: `@priority.${priority}` }));
    onDone();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t("wo.bulk.priorityTitle")}
      description={t("wo.bulk.priorityDesc", { n: fmt.num(eligible.length), total: fmt.num(orders.length) })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={eligible.length === 0} onClick={apply}>
            {t("common.apply")}
          </Button>
        </>
      }
    >
      <Field label={t("common.priority")}>
        {(p) => (
          <Select {...p} data-autofocus value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((pr) => (
              <option key={pr} value={pr}>
                {td(`priority.${pr}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}

/** "More actions" menu for one order; renders nothing when the order is closed. */
export function WorkOrderMenu({ actions, order, variant = "icon" }: { actions: WorkOrderActions; order: WorkOrder; variant?: "icon" | "button" }) {
  const { t } = useT();
  const items = actions.items(order);
  if (items.length === 0) return null;
  const label = t("wo.actionsFor", { id: order.id });
  return (
    <Menu
      label={label}
      width={232}
      items={items}
      trigger={(p) =>
        variant === "icon" ? (
          <IconButton icon={MoreHorizontal} label={label} size="sm" tooltipSide="top" {...p} />
        ) : (
          <Button icon={MoreHorizontal} aria-label={label} {...p}>
            {t("common.more")}
          </Button>
        )
      }
    />
  );
}
