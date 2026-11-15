"use client";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import type { InventoryItem } from "@/domain/types";
import { useT } from "@/i18n";
import { useForge } from "@/store/store";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useAction } from "@/components/ui/toast";
import { CATEGORIES } from "./shared";

interface FormState {
  sku: string;
  nameEn: string;
  nameAr: string;
  category: string;
  unit: string;
  warehouseId: string;
  zoneId: string;
  reorderLevel: string;
  unitCost: string;
  unitsPerPallet: string;
  supplierId: string;
  quantity: string;
}

/** Numeric text field → number. Messages are dictionary keys. */
const numeric = (positive?: boolean) =>
  z
    .string()
    .trim()
    .min(1, "err.required")
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n) && (positive ? n > 0 : n >= 0), positive ? "inventory.form.errPositive" : "err.nonNegative");

const schema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "err.required")
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9][A-Z0-9-]{2,19}$/.test(v), "inventory.form.errSku"),
  nameEn: z.string().trim().min(2, "inventory.form.errName"),
  nameAr: z.string().trim().min(2, "inventory.form.errName"),
  category: z.enum(CATEGORIES, "err.required"),
  unit: z.string().trim().min(1, "err.required").max(8, "inventory.form.errUnit"),
  warehouseId: z.string().min(1, "err.required"),
  zoneId: z.string().min(1, "err.required"),
  reorderLevel: numeric(),
  unitCost: numeric(),
  unitsPerPallet: numeric(true),
  supplierId: z.string(),
  quantity: numeric(),
});

type Errors = Partial<Record<keyof FormState, string>>;

export function ItemFormModal({ open, onClose, item }: { open: boolean; onClose: () => void; item?: InventoryItem | null }) {
  const { t } = useT();
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? t("inventory.form.editTitle") : t("inventory.form.addTitle")}
      description={item ? t("inventory.form.editDesc") : t("inventory.form.addDesc")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {item ? t("common.save") : t("inventory.addItem")}
          </Button>
        </>
      }
    >
      <ItemForm formId={formId} item={item ?? null} onDone={onClose} />
    </Modal>
  );
}

function ItemForm({ formId, item, onDone }: { formId: string; item: InventoryItem | null; onDone: () => void }) {
  const { t, td, tl } = useT();
  const run = useAction();
  const items = useForge((s) => s.items);
  const warehouses = useForge((s) => s.warehouses);
  const zones = useForge((s) => s.zones);
  const suppliers = useForge((s) => s.suppliers);
  const addItem = useForge((s) => s.addItem);
  const updateItem = useForge((s) => s.updateItem);

  // Docks are transit areas: stock is never slotted there.
  const storageZones = useMemo(() => zones.filter((z) => z.kind !== "dock"), [zones]);
  const firstZone = (warehouseId: string) => storageZones.find((z) => z.warehouseId === warehouseId)?.id ?? "";

  const [f, setF] = useState<FormState>(() => {
    if (item) {
      return {
        sku: item.sku,
        nameEn: item.name.en,
        nameAr: item.name.ar,
        category: item.category,
        unit: item.unit,
        warehouseId: item.warehouseId,
        zoneId: item.zoneId,
        reorderLevel: String(item.reorderLevel),
        unitCost: String(item.unitCost),
        unitsPerPallet: String(item.unitsPerPallet),
        supplierId: item.supplierId ?? "",
        quantity: "0",
      };
    }
    const wh = warehouses[0]?.id ?? "";
    return { sku: "", nameEn: "", nameAr: "", category: "component", unit: "pcs", warehouseId: wh, zoneId: firstZone(wh), reorderLevel: "0", unitCost: "0", unitsPerPallet: "100", supplierId: "", quantity: "0" };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setF((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const err = (key: keyof FormState) => (errors[key] ? td(errors[key]) : null);

  const zoneOptions = storageZones.filter((z) => z.warehouseId === f.warehouseId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(f);
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!next[key]) next[key] = issue.message;
      }
    }
    if (!item && parsed.success && items.some((i) => i.sku === parsed.data.sku)) next.sku = "inventory.form.errSkuExists";
    if (!next.zoneId && !zoneOptions.some((z) => z.id === f.zoneId)) next.zoneId = "inventory.form.errZone";
    setErrors(next);
    if (!parsed.success || Object.keys(next).length > 0) return;
    const d = parsed.data;
    const base = {
      name: { en: d.nameEn, ar: d.nameAr },
      category: d.category,
      unit: d.unit,
      warehouseId: d.warehouseId,
      zoneId: d.zoneId,
      reorderLevel: d.reorderLevel,
      unitCost: d.unitCost,
      unitsPerPallet: d.unitsPerPallet,
      supplierId: d.supplierId || undefined,
    };
    const done = item
      ? run(updateItem(item.id, base), t("inventory.form.updated", { sku: item.sku }))
      : run(addItem({ ...base, sku: d.sku, quantity: d.quantity }), t("inventory.form.added", { sku: d.sku }), d.quantity > 0 ? t("inventory.form.addedBody", { qty: d.quantity, unit: d.unit }) : undefined);
    if (done) onDone();
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6">
      <Field label={t("common.sku")} error={err("sku")} hint={item ? t("inventory.form.skuLocked") : t("inventory.form.skuHint")} className="sm:col-span-2">
        {(p) => <Input {...p} dir="ltr" className="code uppercase" value={f.sku} disabled={!!item} data-autofocus={item ? undefined : true} autoComplete="off" maxLength={20} onChange={(e) => set("sku", e.target.value)} />}
      </Field>
      <Field label={t("common.category")} error={err("category")} className="sm:col-span-2">
        {(p) => (
          <Select {...p} value={f.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {td(`invcat.${c}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("common.unit")} error={err("unit")} hint={t("inventory.form.unitHint")} className="sm:col-span-2">
        {(p) => <Input {...p} value={f.unit} maxLength={8} autoComplete="off" onChange={(e) => set("unit", e.target.value)} />}
      </Field>

      <Field label={t("inventory.form.nameEn")} error={err("nameEn")} className="sm:col-span-3">
        {(p) => <Input {...p} dir="ltr" lang="en" value={f.nameEn} data-autofocus={item ? true : undefined} autoComplete="off" onChange={(e) => set("nameEn", e.target.value)} />}
      </Field>
      <Field label={t("inventory.form.nameAr")} error={err("nameAr")} className="sm:col-span-3">
        {(p) => <Input {...p} dir="rtl" lang="ar" value={f.nameAr} autoComplete="off" onChange={(e) => set("nameAr", e.target.value)} />}
      </Field>

      <Field label={t("common.warehouse")} error={err("warehouseId")} className="sm:col-span-3">
        {(p) => (
          <Select
            {...p}
            value={f.warehouseId}
            onChange={(e) => {
              const wh = e.target.value;
              setF((prev) => ({ ...prev, warehouseId: wh, zoneId: firstZone(wh) }));
              setErrors((prev) => ({ ...prev, warehouseId: undefined, zoneId: undefined }));
            }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {tl(w.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("common.zone")} error={err("zoneId")} hint={t("inventory.form.zoneHint")} className="sm:col-span-3">
        {(p) => (
          <Select {...p} value={f.zoneId} onChange={(e) => set("zoneId", e.target.value)}>
            {zoneOptions.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} · {tl(z.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t("inventory.col.reorder")} error={err("reorderLevel")} hint={t("inventory.form.reorderHint")} className="sm:col-span-2">
        {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="any" value={f.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />}
      </Field>
      <Field label={t("inventory.form.unitCost")} error={err("unitCost")} className="sm:col-span-2">
        {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="any" value={f.unitCost} onChange={(e) => set("unitCost", e.target.value)} />}
      </Field>
      <Field label={t("inventory.form.unitsPerPallet")} error={err("unitsPerPallet")} hint={t("inventory.form.palletHint")} className="sm:col-span-2">
        {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="any" value={f.unitsPerPallet} onChange={(e) => set("unitsPerPallet", e.target.value)} />}
      </Field>

      <Field label={t("common.supplier")} optional error={err("supplierId")} className={item ? "sm:col-span-6" : "sm:col-span-3"}>
        {(p) => (
          <Select {...p} value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
            <option value="">{t("inventory.form.noSupplier")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {!item && (
        <Field label={t("inventory.form.opening")} error={err("quantity")} hint={t("inventory.form.openingHint")} className="sm:col-span-3">
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="any" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />}
        </Field>
      )}
    </form>
  );
}
