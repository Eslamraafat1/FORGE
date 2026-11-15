"use client";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import type { InventoryItem } from "@/domain/types";
import { STOCK_RANK, stockStatus } from "@/domain/rules";
import { useT } from "@/i18n";
import { useForge, type AdjustReason } from "@/store/store";
import { Button, Code, Field, Input, Segmented, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { ADJUST_REASONS, useQty, useStockFlash } from "./shared";

type Mode = "add" | "remove" | "set";

export function AdjustStockModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { t, tl } = useT();
  const formId = useId();
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={t("inventory.adjust.title")}
      description={
        item ? (
          <>
            <Code>{item.sku}</Code> · {tl(item.name)}
          </>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {t("inventory.adjust.submit")}
          </Button>
        </>
      }
    >
      {item && <AdjustForm key={item.id} formId={formId} item={item} onDone={onClose} />}
    </Modal>
  );
}

function AdjustForm({ formId, item, onDone }: { formId: string; item: InventoryItem; onDone: () => void }) {
  const { t, td } = useT();
  const q = useQty();
  const run = useAction();
  const adjustStock = useForge((s) => s.adjustStock);
  const flash = useStockFlash((s) => s.flash);

  const [mode, setMode] = useState<Mode>("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<AdjustReason>("found");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const n = Number(qty);
  const entered = qty.trim() !== "" && Number.isFinite(n);
  const validQty = entered && (mode === "set" ? n >= 0 : n > 0);
  const delta = !validQty ? 0 : mode === "add" ? n : mode === "remove" ? -n : Math.round((n - item.quantity) * 100) / 100;
  const next = Math.round((item.quantity + delta) * 100) / 100;
  const before = stockStatus(item);
  const after = stockStatus({ quantity: next, reorderLevel: item.reorderLevel });
  const negativeBlocked = validQty && next < 0 && reason !== "pending_receipt";
  const noChange = validQty && delta === 0;

  const qtyError = !touched ? null : !entered ? t("err.required") : !validQty ? t(mode === "set" ? "err.nonNegative" : "inventory.adjust.errQty") : noChange ? t("inventory.adjust.noChange") : null;

  const changeMode = (m: Mode) => {
    setMode(m);
    // Sensible default reason per mode; the user can still pick another.
    setReason(m === "set" ? "count" : m === "add" ? "found" : "damage");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validQty || noChange || negativeBlocked) return;
    const worse = STOCK_RANK[after] > STOCK_RANK[before];
    const params = { from: `@stock.${before}`, to: `@stock.${after}` };
    const body =
      after === before
        ? t("inventory.adjust.doneBody", { qty: next, unit: item.unit })
        : worse
          ? t("inventory.adjust.statusWorse", params)
          : after === "healthy"
            ? t("inventory.adjust.statusRecovered", params)
            : t("inventory.adjust.statusChanged", params);
    if (run(adjustStock(item.id, delta, reason, note.trim() || undefined), t("inventory.adjust.done", { sku: item.sku, qty: q.signed(delta), unit: item.unit }), body)) {
      flash(item.id);
      onDone();
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Segmented<Mode>
        label={t("inventory.adjust.mode")}
        value={mode}
        onChange={changeMode}
        options={[
          { value: "add", label: t("inventory.adjust.modeAdd") },
          { value: "remove", label: t("inventory.adjust.modeRemove") },
          { value: "set", label: t("inventory.adjust.modeSet") },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={mode === "set" ? t("inventory.adjust.countedQty") : t("common.quantity")} error={qtyError} hint={t("inventory.adjust.qtyHint", { unit: item.unit })}>
          {(p) => <Input {...p} data-autofocus type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => setTouched(true)} />}
        </Field>
        <Field label={t("inventory.col.reason")}>
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {td(`reason.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label={t("common.notes")} optional>
        {(p) => <Textarea {...p} rows={2} value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} />}
      </Field>

      {/* Live preview */}
      <div className="rounded-md border border-line bg-canvas/60 p-3.5" aria-live="polite">
        <p className="label">{t("inventory.adjust.preview")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <div className="num display text-[24px] text-ink-2">{q.qty(item.quantity)}</div>
            <div className="mt-1">
              <StatusBadge kind="stock" value={before} />
            </div>
          </div>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3 rtl:-scale-x-100" />
          <div>
            <div className={`num display text-[24px] ${negativeBlocked ? "text-danger" : "text-ink"}`}>{validQty ? q.qty(next) : "—"}</div>
            <div className="mt-1">{validQty ? <StatusBadge kind="stock" value={after} /> : <span className="text-[12px] text-ink-3">{t("inventory.adjust.enterQty")}</span>}</div>
          </div>
          <div className="ms-auto text-end">
            <div className="label">{t("inventory.adjust.change")}</div>
            <div className="num mt-1 text-[14px] font-semibold text-ink">
              <bdi>{validQty ? q.signed(delta) : "—"}</bdi> <span className="font-normal text-ink-3">{item.unit}</span>
            </div>
          </div>
        </div>
        {validQty && !negativeBlocked && after !== before && (
          <p className="mt-2.5 flex items-start gap-1.5 text-[12px] text-ink-2">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-info" />
            {STOCK_RANK[after] > STOCK_RANK[before] ? t("inventory.adjust.willAlert") : t("inventory.adjust.willRecover")}
          </p>
        )}
      </div>

      {negativeBlocked ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-danger/45 bg-danger/10 p-3 text-[12.5px] text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <p>{t("inventory.adjust.negativeBlocked", { qty: item.quantity, unit: item.unit })}</p>
            <Button size="sm" className="mt-2" onClick={() => setReason("pending_receipt")}>
              {t("inventory.adjust.usePending")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-[12px] text-ink-3">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {validQty && next < 0 ? t("inventory.adjust.negativeAllowed") : t("inventory.adjust.negativeRule")}
        </p>
      )}
    </form>
  );
}
