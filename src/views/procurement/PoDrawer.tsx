"use client";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Check, FileQuestion, PackageCheck, Pencil, Send, ShoppingCart, X } from "lucide-react";
import type { ID, PurchaseOrder } from "@/domain/types";
import { PO_TRANSITIONS, poReceivedRatio, poValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Button, Code, DataList, EmptyState, Field, Input, Progress, Textarea } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlay";
import { EntityLink, Member, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { DeliveryCell } from "./PurchaseOrdersTable";
import { DemoNotice, GuardedButton, SectionTitle, SupplierStatusBadge } from "./parts";
import { poDaysLate, poOutstandingValue, poReceivedValue } from "./logic";

type Mode = "review" | "receive" | "reject" | "cancel";

export function PoDrawer({ poId, onClose, onEdit }: { poId: ID | null; onClose: () => void; onEdit: (id: ID) => void }) {
  const { t } = useT();
  const run = useAction();
  const po = useForge((s) => (poId ? s.purchaseOrders.find((p) => p.id === poId) : undefined));
  const setStatus = useForge((s) => s.setPurchaseOrderStatus);
  const formId = useId();
  const [modeState, setModeState] = useState<{ id: ID; mode: Mode } | null>(null);
  const mode: Mode = po && modeState?.id === po.id ? modeState.mode : "review";
  const setMode = (m: Mode) => setModeState(po ? { id: po.id, mode: m } : null);

  const next = po ? PO_TRANSITIONS[po.status] : [];
  const pending = po?.status === "pending";
  const btn = "flex-1 sm:flex-none";

  let footer: React.ReactNode = undefined;
  if (po && mode === "review") {
    const actions: React.ReactNode[] = [];
    if (next.includes("cancelled") && !pending) {
      actions.push(
        <GuardedButton key="cancel" cap="po.manage" variant="danger" icon={Ban} className={btn} onClick={() => setMode("cancel")}>
          {t("procurement.action.cancel")}
        </GuardedButton>,
      );
    }
    if (po.status === "draft") {
      actions.push(
        <GuardedButton key="edit" cap="po.manage" icon={Pencil} className={btn} onClick={() => onEdit(po.id)}>
          {t("common.edit")}
        </GuardedButton>,
      );
    }
    if (next.includes("pending")) {
      actions.push(
        <GuardedButton key="submit" cap="po.manage" variant="primary" icon={Send} className={btn} onClick={() => run(setStatus(po.id, "pending"), t("procurement.toast.submitted", { id: po.id }), t("procurement.toast.demoOnly"))}>
          {t("procurement.action.submit")}
        </GuardedButton>,
      );
    }
    if (pending) {
      actions.push(
        <GuardedButton key="reject" cap="po.approve" variant="danger" icon={X} className={btn} onClick={() => setMode("reject")}>
          {t("procurement.action.reject")}
        </GuardedButton>,
        <GuardedButton key="approve" cap="po.approve" variant="primary" icon={Check} className={btn} onClick={() => run(setStatus(po.id, "approved"), t("procurement.toast.approved", { id: po.id }), t("procurement.toast.demoOnly"))}>
          {t("procurement.action.approve")}
        </GuardedButton>,
      );
    }
    if (next.includes("ordered")) {
      actions.push(
        <GuardedButton key="ordered" cap="po.manage" variant="primary" icon={ShoppingCart} className={btn} onClick={() => run(setStatus(po.id, "ordered"), t("procurement.toast.ordered", { id: po.id }), t("procurement.toast.orderedBody"))}>
          {t("procurement.action.markOrdered")}
        </GuardedButton>,
      );
    }
    if (next.includes("received")) {
      actions.push(
        <GuardedButton key="receive" cap="po.receive" variant="primary" icon={PackageCheck} className={btn} onClick={() => setMode("receive")}>
          {t("procurement.action.receive")}
        </GuardedButton>,
      );
    }
    footer = actions.length > 0 ? actions : <span className="me-auto text-[12px] text-ink-3">{t("procurement.drawer.closed")}</span>;
  } else if (po) {
    footer = (
      <>
        <Button variant="ghost" icon={ArrowLeft} className="me-auto rtl:[&>svg]:-scale-x-100" onClick={() => setMode("review")}>
          {t("common.back")}
        </Button>
        <Button variant={mode === "receive" ? "primary" : "danger"} type="submit" form={formId} className={btn}>
          {mode === "receive" ? t("procurement.receive.confirm") : mode === "reject" ? t("procurement.reject.confirm") : t("procurement.cancel.confirm")}
        </Button>
      </>
    );
  }

  return (
    <Drawer
      open={!!poId}
      onClose={onClose}
      width={600}
      eyebrow={mode === "receive" ? t("procurement.receive.title") : mode === "reject" ? t("procurement.reject.title") : mode === "cancel" ? t("procurement.cancel.title") : t("entity.po")}
      title={
        po ? (
          <span className="flex flex-wrap items-center gap-2">
            <Code className="text-[15px]">{po.id}</Code>
            <StatusBadge kind="po" value={po.status} />
          </span>
        ) : (
          <Code className="text-[15px]">{poId}</Code>
        )
      }
      footer={footer}
    >
      {!po ? (
        <EmptyState icon={FileQuestion} title={t("shell.notFound.title")} hint={t("shell.notFound.entity")} />
      ) : mode === "receive" ? (
        <ReceiveForm po={po} formId={formId} onDone={() => setMode("review")} />
      ) : mode === "reject" || mode === "cancel" ? (
        <ReasonForm
          kind={mode}
          po={po}
          formId={formId}
          onSubmit={(note) => {
            const okMsg = mode === "reject" ? t("procurement.toast.rejected", { id: po.id }) : t("procurement.toast.cancelled", { id: po.id });
            if (run(setStatus(po.id, "cancelled", note || undefined), okMsg, t("procurement.toast.demoOnly"))) setMode("review");
          }}
        />
      ) : (
        <Review po={po} />
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

function Review({ po }: { po: PurchaseOrder }) {
  const { t, tl, tm } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const now = useForge((s) => s.now);
  const shipments = useForge((s) => s.shipments);
  const activity = useForge((s) => s.activity);
  const supplier = lookup.supplier(po.supplierId);
  const linked = useMemo(() => shipments.filter((s) => s.poId === po.id), [shipments, po.id]);
  const events = useMemo(() => activity.filter((e) => e.entity?.type === "po" && e.entity.id === po.id), [activity, po.id]);
  const ratio = poReceivedRatio(po);
  const daysLate = poDaysLate(po, now);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <DataList
          items={[
            {
              label: t("common.supplier"),
              value: supplier ? (
                <span className="flex flex-wrap items-center gap-2">
                  <EntityLink entity={{ type: "supplier", id: supplier.id }}>{supplier.name}</EntityLink>
                  <SupplierStatusBadge status={supplier.status} />
                </span>
              ) : (
                <Code>{po.supplierId}</Code>
              ),
            },
            { label: t("procurement.col.value"), value: <span className="num font-semibold">{fmt.money(poValue(po))}</span> },
            { label: t("common.created"), value: <span className="num">{fmt.date(po.createdAt)}</span> },
            { label: t("procurement.field.expected"), value: <DeliveryCell po={po} daysLate={daysLate} /> },
            ...(supplier
              ? [
                  { label: t("supplier.leadTime"), value: <span className="num">{t("supplier.days", { n: supplier.leadTimeDays })}</span> },
                  { label: t("supplier.paymentTerms"), value: supplier.paymentTerms },
                ]
              : []),
          ]}
        />
        <div className="mt-4 flex items-center gap-3">
          <Progress value={ratio} tone={ratio >= 1 ? "ok" : "accent"} label={t("procurement.col.received")} thick />
          <span className="num shrink-0 text-[12px] text-ink-2">{t("procurement.receivedPct", { pct: fmt.pct(ratio, 0) })}</span>
        </div>
      </section>

      <section>
        <SectionTitle aside={<span className="num text-[11.5px] text-ink-3">{t("procurement.itemsCount", { n: po.lines.length })}</span>}>{t("procurement.drawer.lines")}</SectionTitle>
        <ul className="divide-y divide-line rounded-md border border-line">
          {po.lines.map((ln) => {
            const item = lookup.item(ln.itemId);
            const outstanding = Math.max(0, ln.qty - ln.receivedQty);
            const unit = item?.unit ?? "";
            return (
              <li key={ln.itemId} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <EntityLink entity={{ type: "item", id: ln.itemId }} />
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{item ? tl(item.name) : "—"}</p>
                  </div>
                  <span className="num shrink-0 text-[13px] font-semibold text-ink">{fmt.money(ln.qty * ln.unitCost)}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  {[
                    [t("procurement.line.ordered"), `${fmt.num(ln.qty)} ${unit}`, "text-ink"],
                    [t("procurement.line.received"), `${fmt.num(ln.receivedQty)} ${unit}`, "text-ink"],
                    [t("procurement.line.outstanding"), `${fmt.num(outstanding)} ${unit}`, outstanding > 0 ? "text-amber" : "text-ink-3"],
                    [t("procurement.line.unitCost"), fmt.money(ln.unitCost, 2), "text-ink"],
                  ].map(([label, value, cls]) => (
                    <div key={label} className="min-w-0">
                      <dt className="label">{label}</dt>
                      <dd className={`num mt-0.5 text-[12.5px] ${cls}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">{t("procurement.total.received")}</dt>
            <dd className="num text-ink">{fmt.money(poReceivedValue(po))}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">{t("procurement.total.outstanding")}</dt>
            <dd className="num text-ink">{fmt.money(po.status === "cancelled" ? 0 : poOutstandingValue(po))}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-[13px] font-semibold">
            <dt className="text-ink">{t("procurement.total.order")}</dt>
            <dd className="num text-ink">{fmt.money(poValue(po))}</dd>
          </div>
        </dl>
      </section>

      {po.notes && (
        <section>
          <SectionTitle>{t("common.notes")}</SectionTitle>
          <p className="whitespace-pre-wrap break-words rounded-md border border-line bg-canvas/50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">{po.notes}</p>
        </section>
      )}

      <section>
        <SectionTitle>{t("procurement.drawer.shipment")}</SectionTitle>
        {linked.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">{t("procurement.drawer.noShipment")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {linked.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2.5 text-[12.5px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Code className="font-semibold text-ink">{s.id}</Code>
                    <StatusBadge kind="shipment" value={s.status} />
                  </div>
                  <p className="mt-1 text-ink-3">
                    {s.carrier} · <span className="num">{fmt.num(s.pallets)}</span> {t("common.pallets")}
                  </p>
                </div>
                <div className="text-end">
                  <div className="label">{t("procurement.drawer.eta")}</div>
                  <div className="num mt-0.5 text-ink">{fmt.dateTime(s.eta)}</div>
                  <Link href={`/warehouse/${s.warehouseId}`} className="text-[11.5px] text-ink-2 underline decoration-line-2 decoration-dotted underline-offset-[3px] hover:text-forge-text">
                    <Code>{s.warehouseId}</Code>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>{t("procurement.drawer.approval")}</SectionTitle>
        <ol className="divide-y divide-line rounded-md border border-line text-[12.5px]">
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div>
              <div className="label">{t("procurement.col.requestedBy")}</div>
              <div className="mt-1">
                <Member id={po.requestedById} showRole />
              </div>
            </div>
            <span className="num text-ink-3">{fmt.dateTime(po.createdAt)}</span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div>
              <div className="label">{t("procurement.col.approvedBy")}</div>
              <div className="mt-1">
                {po.approvedById ? (
                  <Member id={po.approvedById} showRole />
                ) : (
                  <span className="text-ink-3">
                    {po.status === "pending" ? t("procurement.approval.awaiting") : po.status === "draft" ? t("procurement.approval.notSubmitted") : t("procurement.approval.none")}
                  </span>
                )}
              </div>
            </div>
          </li>
        </ol>
        <p className="mt-1.5 text-[11.5px] text-ink-3">{t("procurement.approval.demo")}</p>
      </section>

      <section>
        <SectionTitle>{t("procurement.drawer.activity")}</SectionTitle>
        {events.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">{t("procurement.drawer.noActivity")}</p>
        ) : (
          <ol className="space-y-2.5 border-s border-line ps-3.5">
            {events.map((e) => {
              const actor = lookup.member(e.actorId);
              return (
                <li key={e.id} className="relative text-[12.5px]">
                  <span aria-hidden className="absolute -start-[17.5px] top-1.5 size-1.5 rounded-full bg-ink-3" />
                  <p className="text-ink">{tm(e.msg)}</p>
                  <p className="num mt-0.5 text-[11.5px] text-ink-3">
                    {fmt.dateTime(e.at)} · {actor ? t("notif.by", { name: actor.name }) : t("notif.system")}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <DemoNotice />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record receipt                                                      */
/* ------------------------------------------------------------------ */

function ReceiveForm({ po, formId, onDone }: { po: PurchaseOrder; formId: string; onDone: () => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const lookup = useLookup();
  const receive = useForge((s) => s.receivePurchaseOrder);
  const outstandingOf = (itemId: ID) => {
    const ln = po.lines.find((x) => x.itemId === itemId);
    return ln ? Math.max(0, ln.qty - ln.receivedQty) : 0;
  };
  const [qty, setQty] = useState<Record<ID, string>>(() => Object.fromEntries(po.lines.map((ln) => [ln.itemId, String(Math.max(0, ln.qty - ln.receivedQty))])));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsed = po.lines.map((ln) => {
    const raw = (qty[ln.itemId] ?? "").trim();
    const n = raw === "" ? 0 : Number(raw);
    return { ln, n, out: Math.max(0, ln.qty - ln.receivedQty) };
  });
  const receiptValue = parsed.reduce((s, p) => s + (Number.isFinite(p.n) && p.n > 0 ? p.n * p.ln.unitCost : 0), 0);
  const completes = parsed.every((p) => Number.isFinite(p.n) && p.n >= p.out);

  const fill = (all: boolean) => {
    setQty(Object.fromEntries(po.lines.map((ln) => [ln.itemId, all ? String(outstandingOf(ln.itemId)) : "0"])));
    setErrors({});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const received: Record<ID, number> = {};
    let total = 0;
    for (const p of parsed) {
      if (!Number.isFinite(p.n) || p.n < 0) next[p.ln.itemId] = t("err.nonNegative");
      else if (p.n > p.out) next[p.ln.itemId] = t("procurement.receive.errMax", { qty: fmt.num(p.out) });
      else {
        received[p.ln.itemId] = p.n;
        total += p.n;
      }
    }
    if (Object.keys(next).length === 0 && total <= 0) next._form = t("err.receiveNothing");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (run(receive(po.id, received), t(completes ? "procurement.toast.receivedFull" : "procurement.toast.receivedPartial", { id: po.id }), t("procurement.toast.receivedBody"))) onDone();
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-ink-2">{t("procurement.receive.intro")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => fill(true)}>
          {t("procurement.receive.fillAll")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fill(false)}>
          {t("procurement.receive.clear")}
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {parsed.map(({ ln, out }, index) => {
          const item = lookup.item(ln.itemId);
          const unit = item?.unit ?? "";
          return (
            <li key={ln.itemId} className="px-3 py-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-[1_1_200px]">
                  <Code className="font-semibold text-ink">{item?.sku ?? ln.itemId}</Code>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{item ? tl(item.name) : "—"}</p>
                  <p className="num mt-1 text-[11.5px] text-ink-3">
                    {t("procurement.receive.lineHint", { ordered: fmt.num(ln.qty), received: fmt.num(ln.receivedQty), outstanding: fmt.num(out), unit })}
                  </p>
                </div>
                {out <= 0 ? (
                  <span className="text-[12px] text-ok">{t("procurement.receive.lineDone")}</span>
                ) : (
                  <Field label={t("procurement.receive.qty", { unit })} error={errors[ln.itemId]} className="w-full sm:w-44">
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={out}
                        step="any"
                        data-autofocus={index === 0 ? true : undefined}
                        value={qty[ln.itemId] ?? ""}
                        onChange={(e) => {
                          setQty((q) => ({ ...q, [ln.itemId]: e.target.value }));
                          setErrors({});
                        }}
                      />
                    )}
                  </Field>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {errors._form && (
        <p role="alert" className="text-[12px] text-danger">
          {errors._form}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-canvas/50 px-4 py-3" aria-live="polite">
        <div>
          <div className="label">{t("procurement.receive.value")}</div>
          <div className="mt-1 text-[12px] text-ink-3">{completes ? t("procurement.receive.willComplete") : t("procurement.receive.willPartial")}</div>
        </div>
        <div className="display num text-[26px] text-ink">{fmt.money(receiptValue)}</div>
      </div>
      <DemoNotice>{t("procurement.receive.demoNote")}</DemoNotice>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Reject / cancel                                                     */
/* ------------------------------------------------------------------ */

function ReasonForm({ kind, po, formId, onSubmit }: { kind: "reject" | "cancel"; po: PurchaseOrder; formId: string; onSubmit: (note: string) => void }) {
  const { t } = useT();
  const fmt = useFmt();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const required = kind === "reject";
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const v = note.trim();
        if (required && v.length < 3) {
          setError(t("procurement.reject.errReason"));
          return;
        }
        onSubmit(v);
      }}
    >
      <p className="text-[13px] leading-relaxed text-ink-2">
        {t(kind === "reject" ? "procurement.reject.body" : "procurement.cancel.body", { id: po.id, value: fmt.money(poValue(po)) })}
      </p>
      <Field label={t(kind === "reject" ? "procurement.reject.reason" : "procurement.cancel.reason")} optional={!required} error={error} hint={t("procurement.reason.hint")}>
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            maxLength={300}
            data-autofocus
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError(null);
            }}
          />
        )}
      </Field>
      <DemoNotice>{t("procurement.toast.demoOnly")}</DemoNotice>
    </form>
  );
}
