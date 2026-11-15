"use client";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import type { ID, PurchaseOrder } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, fromInput, startOfDay, toInputDate } from "@/lib/time";
import { useForge } from "@/store/store";
import { Button, Code, Field, IconButton, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useAction } from "@/components/ui/toast";
import { DemoNotice } from "./parts";
import { onOrderByItem, suggestedOrderQty } from "./logic";

export interface PoPrefill {
  supplierId?: ID | null;
  itemId?: ID | null;
}

interface LineDraft {
  itemId: ID | "";
  qty: string;
}

const NOTES_MAX = 400;

/** Messages are dictionary keys, translated when rendered. */
function buildSchema(minDate: number) {
  return z
    .object({
      supplierId: z.string().min(1, "err.poSupplier"),
      expectedDate: z.number("err.dateRequired"),
      lines: z
        .array(
          z.object({
            itemId: z.string().min(1, "procurement.form.errItem"),
            qty: z.number("err.qtyPositive").int("err.qtyPositive").positive("err.qtyPositive"),
          }),
        )
        .min(1, "err.poNoLines"),
      notes: z.string().max(NOTES_MAX, "procurement.form.errNotes"),
    })
    .superRefine((v, ctx) => {
      if (Number.isFinite(v.expectedDate) && v.expectedDate < minDate) {
        ctx.addIssue({ code: "custom", message: "procurement.form.errDatePast", path: ["expectedDate"] });
      }
      const seen = new Set<string>();
      v.lines.forEach((ln, i) => {
        if (!ln.itemId) return;
        if (seen.has(ln.itemId)) ctx.addIssue({ code: "custom", message: "procurement.form.errDuplicate", path: ["lines", i, "itemId"] });
        seen.add(ln.itemId);
      });
    });
}

export function PoFormModal({
  open,
  onClose,
  edit,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Draft being edited; omit to create a new request. */
  edit?: PurchaseOrder;
  prefill?: PoPrefill;
  onSaved: (id: ID) => void;
}) {
  const { t } = useT();
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={edit ? t("procurement.form.editTitle", { id: edit.id }) : t("procurement.form.createTitle")}
      description={t("procurement.form.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {edit ? t("common.save") : t("procurement.form.submit")}
          </Button>
        </>
      }
    >
      {/* Mounted only while the dialog is open, so every opening starts from fresh state. */}
      <PoFormBody formId={formId} edit={edit} prefill={prefill} onSaved={onSaved} />
    </Modal>
  );
}

function PoFormBody({ formId, edit, prefill, onSaved }: { formId: string; edit?: PurchaseOrder; prefill?: PoPrefill; onSaved: (id: ID) => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const suppliers = useForge((s) => s.suppliers);
  const items = useForge((s) => s.items);
  const orders = useForge((s) => s.purchaseOrders);
  const createPurchaseOrder = useForge((s) => s.createPurchaseOrder);
  const updatePurchaseOrder = useForge((s) => s.updatePurchaseOrder);

  const [form, setForm] = useState(() => {
    const state = useForge.getState();
    if (edit) {
      return {
        supplierId: edit.supplierId as ID | "",
        date: toInputDate(edit.expectedDate),
        lines: edit.lines.map((ln): LineDraft => ({ itemId: ln.itemId, qty: String(ln.qty) })),
        notes: edit.notes ?? "",
      };
    }
    const item = prefill?.itemId ? state.items.find((i) => i.id === prefill.itemId && i.supplierId) : undefined;
    const supplier = state.suppliers.find((s) => s.id === (item?.supplierId ?? prefill?.supplierId));
    let lines: LineDraft[] = [{ itemId: "", qty: "" }];
    if (item) {
      const suggested = suggestedOrderQty(item, onOrderByItem(state.purchaseOrders).get(item.id) ?? 0);
      lines = [{ itemId: item.id, qty: String(suggested > 0 ? suggested : Math.max(1, Math.ceil(item.reorderLevel))) }];
    }
    return {
      supplierId: (supplier?.id ?? "") as ID | "",
      date: supplier ? toInputDate(state.now + supplier.leadTimeDays * DAY) : "",
      lines,
      notes: "",
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const supplier = suppliers.find((s) => s.id === form.supplierId);
  const supplierItems = useMemo(() => items.filter((i) => form.supplierId && i.supplierId === form.supplierId), [items, form.supplierId]);
  const onOrder = useMemo(() => onOrderByItem(orders.filter((o) => o.id !== edit?.id)), [orders, edit?.id]);
  const itemById = (id: ID | "") => (id ? supplierItems.find((i) => i.id === id) : undefined);

  const total = form.lines.reduce((sum, ln) => {
    const item = itemById(ln.itemId);
    const qty = Number(ln.qty);
    return item && Number.isFinite(qty) && qty > 0 ? sum + qty * item.unitCost : sum;
  }, 0);
  const filled = form.lines.filter((ln) => ln.itemId).length;
  const canAddLine = !!supplier && form.lines.length < supplierItems.length;

  const clearError = (...paths: string[]) =>
    setErrors((prev) => {
      if (!paths.some((p) => p in prev)) return prev;
      const next = { ...prev };
      for (const p of paths) delete next[p];
      return next;
    });

  const changeSupplier = (id: string) => {
    const next = suppliers.find((s) => s.id === id);
    // Lines are tied to the supplier: changing it restarts the material list and the default date.
    setForm((f) => ({
      ...f,
      supplierId: next?.id ?? "",
      date: next ? toInputDate(useForge.getState().now + next.leadTimeDays * DAY) : f.date,
      lines: [{ itemId: "", qty: "" }],
    }));
    setErrors({});
  };

  const setLine = (index: number, patch: Partial<LineDraft>) => {
    setForm((f) => ({ ...f, lines: f.lines.map((ln, i) => (i === index ? { ...ln, ...patch } : ln)) }));
    clearError(`lines.${index}.itemId`, `lines.${index}.qty`, "lines");
  };

  const pickItem = (index: number, id: string) => {
    const item = supplierItems.find((i) => i.id === id);
    const current = form.lines[index];
    let qty = current.qty;
    if (item && !qty.trim()) {
      const suggested = suggestedOrderQty(item, onOrder.get(item.id) ?? 0);
      if (suggested > 0) qty = String(suggested);
    }
    setLine(index, { itemId: item?.id ?? "", qty });
  };

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...f.lines, { itemId: "", qty: "" }] }));
    clearError("lines");
  };

  const removeLine = (index: number) => {
    setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== index) : [{ itemId: "", qty: "" }] }));
    setErrors({});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const now = useForge.getState().now;
    const parsed = buildSchema(startOfDay(now)).safeParse({
      supplierId: form.supplierId,
      expectedDate: fromInput(form.date),
      lines: form.lines.map((ln) => ({ itemId: ln.itemId, qty: ln.qty.trim() === "" ? NaN : Number(ln.qty) })),
      notes: form.notes.trim(),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!(path in next)) next[path] = issue.message;
      }
      setErrors(next);
      return;
    }
    const input = { ...parsed.data, notes: parsed.data.notes || undefined };
    if (edit) {
      if (run(updatePurchaseOrder(edit.id, input), t("procurement.toast.updated", { id: edit.id }), t("procurement.toast.draftBody"))) onSaved(edit.id);
      return;
    }
    const result = createPurchaseOrder(input);
    if (run(result, t("procurement.toast.created", { id: result.ok ? (result.id ?? "") : "" }), t("procurement.toast.draftBody")) && result.ok && result.id) onSaved(result.id);
  };

  const err = (path: string) => (errors[path] ? td(errors[path], { max: NOTES_MAX }) : null);

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.supplier")} error={err("supplierId")} hint={supplier ? t("procurement.form.supplierHint", { days: supplier.leadTimeDays, terms: supplier.paymentTerms }) : undefined}>
          {(p) => (
            <Select {...p} value={form.supplierId} onChange={(e) => changeSupplier(e.target.value)} data-autofocus={form.supplierId ? undefined : true}>
              <option value="">{t("procurement.form.selectSupplier")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("procurement.field.expected")} error={err("expectedDate")} hint={supplier ? t("procurement.form.dateHint", { days: supplier.leadTimeDays }) : undefined}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.date}
              onChange={(e) => {
                setForm((f) => ({ ...f, date: e.target.value }));
                clearError("expectedDate");
              }}
            />
          )}
        </Field>
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
          <span className="text-[12px] font-medium text-ink-2">{t("procurement.form.materials")}</span>
          {supplier && <span className="text-[11.5px] text-ink-3">{t("procurement.form.materialsHint", { supplier: supplier.name })}</span>}
        </legend>

        {!supplier ? (
          <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-[12.5px] text-ink-3">{t("procurement.form.pickSupplierFirst")}</p>
        ) : supplierItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-[12.5px] text-ink-3">{t("procurement.form.noMaterials")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {form.lines.map((ln, index) => {
              const item = itemById(ln.itemId);
              const qty = Number(ln.qty);
              const lineTotal = item && Number.isFinite(qty) && qty > 0 ? qty * item.unitCost : 0;
              const itemErr = err(`lines.${index}.itemId`);
              const qtyErr = err(`lines.${index}.qty`);
              const taken = new Set(form.lines.filter((_, i) => i !== index).map((x) => x.itemId));
              const n = index + 1;
              return (
                <li key={index} className="px-3 py-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-[1_1_220px]">
                      <Select
                        aria-label={t("procurement.form.itemLabel", { n })}
                        aria-invalid={itemErr ? true : undefined}
                        value={ln.itemId}
                        onChange={(e) => pickItem(index, e.target.value)}
                        data-autofocus={index === 0 && form.supplierId && !ln.itemId ? true : undefined}
                      >
                        <option value="">{t("procurement.form.selectItem")}</option>
                        {supplierItems.map((i) => (
                          <option key={i.id} value={i.id} disabled={taken.has(i.id)}>
                            {i.sku} · {tl(i.name)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-[0_1_180px] items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        aria-label={t("procurement.form.qtyLabel", { n })}
                        aria-invalid={qtyErr ? true : undefined}
                        placeholder={t("common.quantity")}
                        value={ln.qty}
                        onChange={(e) => setLine(index, { qty: e.target.value })}
                      />
                      <span className="w-8 shrink-0 text-[12px] text-ink-3">{item?.unit ?? ""}</span>
                    </div>
                    <IconButton icon={Trash2} label={t("procurement.form.removeLine", { n })} onClick={() => removeLine(index)} className="ms-auto" />
                  </div>
                  {(itemErr || qtyErr) && (
                    <p role="alert" className="mt-1.5 text-[11.5px] text-danger">
                      {itemErr ?? qtyErr}
                    </p>
                  )}
                  {item && (
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                      <span className="num">
                        {t("procurement.form.stockHint", {
                          onHand: fmt.num(item.quantity),
                          reorder: fmt.num(item.reorderLevel),
                          onOrder: fmt.num(onOrder.get(item.id) ?? 0),
                          unit: item.unit,
                        })}
                      </span>
                      <span className="num">
                        {fmt.money(item.unitCost, 2)} / {item.unit}
                        <span className="ms-3 text-[12.5px] font-semibold text-ink">{fmt.money(lineTotal)}</span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {err("lines") && (
          <p role="alert" className="mt-1.5 text-[11.5px] text-danger">
            {err("lines")}
          </p>
        )}
        {supplier && supplierItems.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={Plus} onClick={addLine} disabled={!canAddLine}>
              {t("procurement.form.addLine")}
            </Button>
            {!canAddLine && <span className="text-[11.5px] text-ink-3">{t("procurement.form.allItemsAdded")}</span>}
          </div>
        )}
      </fieldset>

      <Field label={t("common.notes")} optional error={err("notes")}>
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={NOTES_MAX + 50}
            value={form.notes}
            placeholder={t("procurement.form.notesPlaceholder")}
            onChange={(e) => {
              setForm((f) => ({ ...f, notes: e.target.value }));
              clearError("notes");
            }}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-canvas/50 px-4 py-3" aria-live="polite">
        <div className="text-[12px] text-ink-3">
          <div className="label">{t("procurement.form.total")}</div>
          <div className="mt-1">
            {t("procurement.itemsCount", { n: filled })}
            {supplier && (
              <>
                {" · "}
                <Code>{supplier.id}</Code>
              </>
            )}
          </div>
        </div>
        <div className="display num text-[28px] text-ink">{fmt.money(total)}</div>
      </div>

      <DemoNotice>{t("procurement.form.demoNote")}</DemoNotice>
    </form>
  );
}
