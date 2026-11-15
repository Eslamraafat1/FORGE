"use client";
import { useId, useMemo, useState } from "react";
import { Ban, CheckCircle2, History, Play } from "lucide-react";
import type { MaintenanceOrder, Priority } from "@/domain/types";
import { maintenanceIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { fromInput, toInputDateTime } from "@/lib/time";
import { useForge } from "@/store/store";
import { Badge, Button, Code, DataList, EmptyState, Field, Input, Progress, Select, cn, toneBg } from "@/components/ui/primitives";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EntityLink, Guard, Member, useCan, useLookup } from "@/components/ui/page";
import { SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { PRIORITIES } from "./MaintenanceCreateModal";
import { DemoCalcBadge, orderIsOverdue } from "./shared";

type Dialog = "start" | "complete" | "cancel" | null;
const noop = () => {};

export function MaintenanceOrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { t, tl } = useT();
  const order = useForge((s) => (orderId ? s.maintenanceOrders.find((o) => o.id === orderId) : undefined));
  const machine = useForge((s) => (order ? s.machines.find((m) => m.id === order.machineId) : undefined));
  const line = useForge((s) => (machine ? s.lines.find((l) => l.id === machine.lineId) : undefined));
  const startMaintenance = useForge((s) => s.startMaintenance);
  const cancelMaintenance = useForge((s) => s.cancelMaintenance);
  const run = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);

  const machineLabel = machine ? tl(machine.name) : (order?.machineId ?? "");
  const lineLabel = line ? `${line.code} · ${tl(line.name)}` : (machine?.lineId ?? "");

  return (
    <>
      <Drawer
        open={!!order}
        // While a nested dialog is open, Escape belongs to that dialog.
        onClose={dialog ? noop : onClose}
        width={520}
        eyebrow={order ? <Code className="text-[11px]">{order.id}</Code> : undefined}
        title={machineLabel}
      >
        {order && <OrderBody key={`${order.id}:${order.status}`} order={order} onDialog={setDialog} />}
      </Drawer>

      {order && (
        <>
          <ConfirmDialog
            open={dialog === "start"}
            onClose={() => setDialog(null)}
            onConfirm={() => run(startMaintenance(order.id), t("maintenance.toast.started", { id: order.id }))}
            title={t("maintenance.start.title", { id: order.id })}
            body={
              <>
                <p>{t("maintenance.start.body", { machine: machineLabel, line: lineLabel })}</p>
                <p className="mt-2 text-ink-3">{t("maintenance.start.note")}</p>
              </>
            }
            confirmLabel={t("maintenance.action.start")}
          />
          <ConfirmDialog
            open={dialog === "cancel"}
            onClose={() => setDialog(null)}
            onConfirm={() => run(cancelMaintenance(order.id), t("maintenance.toast.cancelled", { id: order.id }))}
            danger
            title={t("maintenance.cancel.title", { id: order.id })}
            body={t("maintenance.cancel.body")}
            confirmLabel={t("maintenance.action.cancel")}
          />
          <CompleteDialog key={order.id} open={dialog === "complete"} order={order} machineLabel={machineLabel} onClose={() => setDialog(null)} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Complete — asks for the final cost                                  */
/* ------------------------------------------------------------------ */

function CompleteDialog({ open, order, machineLabel, onClose }: { open: boolean; order: MaintenanceOrder; machineLabel: string; onClose: () => void }) {
  const { t } = useT();
  const formId = useId();
  const completeMaintenance = useForge((s) => s.completeMaintenance);
  const run = useAction();
  const [cost, setCost] = useState(String(order.cost));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const value = Number(cost);
    if (cost.trim() === "" || !Number.isFinite(value) || value < 0) {
      setError(t("maintenance.form.err.cost"));
      return;
    }
    if (run(completeMaintenance(order.id, value), t("maintenance.toast.completed", { id: order.id }), t("maintenance.toast.completedBody"))) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t("maintenance.complete.title", { id: order.id })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId} icon={CheckCircle2}>
            {t("maintenance.action.complete")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[13px] leading-relaxed text-ink-2">{t("maintenance.complete.body", { machine: machineLabel })}</p>
        <Field label={t("maintenance.complete.cost")} error={error} hint={t("maintenance.complete.costHint")}>
          {(p) => (
            <Input
              {...p}
              data-autofocus
              type="number"
              inputMode="decimal"
              min={0}
              step={10}
              value={cost}
              onChange={(e) => {
                setCost(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer body                                                         */
/* ------------------------------------------------------------------ */

function OrderBody({ order, onDialog }: { order: MaintenanceOrder; onDialog: (d: Dialog) => void }) {
  const { t, td, tl, tm } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const now = useForge((s) => s.now);
  const team = useForge((s) => s.team);
  const activity = useForge((s) => s.activity);
  const updateMaintenance = useForge((s) => s.updateMaintenance);
  const canManage = useCan("maintenance.manage");
  const canExecute = useCan("maintenance.execute");
  const run = useAction();

  const machine = lookup.machine(order.machineId);
  const line = lookup.line(machine?.lineId);
  const technicians = useMemo(() => team.filter((m) => m.role === "technician"), [team]);
  const open = maintenanceIsOpen(order.status);
  const overdue = orderIsOverdue(order, now);

  // Planning draft: only the fields that differ from the order are sent.
  const [tech, setTech] = useState(order.technicianId ?? "");
  const [when, setWhen] = useState(toInputDateTime(order.scheduledDate));
  const [priority, setPriority] = useState<Priority>(order.priority);
  const [hours, setHours] = useState(String(order.estimatedHours));
  const [progress, setProgress] = useState(order.progress);

  const whenTs = fromInput(when);
  const hoursNum = Number(hours);
  const whenError = Number.isFinite(whenTs) ? null : t("maintenance.form.err.date");
  const hoursError = hours.trim() !== "" && hoursNum > 0 && hoursNum <= 72 ? null : t("maintenance.form.err.hours");
  const patch: Parameters<typeof updateMaintenance>[1] = {};
  if ((tech || null) !== order.technicianId) patch.technicianId = tech || null;
  if (!whenError && whenTs !== order.scheduledDate && when !== toInputDateTime(order.scheduledDate)) patch.scheduledDate = whenTs;
  if (priority !== order.priority) patch.priority = priority;
  if (!hoursError && hoursNum !== order.estimatedHours) patch.estimatedHours = hoursNum;
  const dirty = Object.keys(patch).length > 0;

  const savePlanning = () => {
    if (!dirty || whenError || hoursError) return;
    run(updateMaintenance(order.id, patch), t("common.saved"), patch.technicianId ? t("maintenance.toast.assigned", { id: order.id }) : undefined);
  };
  const saveProgress = () => run(updateMaintenance(order.id, { progress }), t("maintenance.toast.progress", { id: order.id, pct: progress }));

  const events = useMemo(() => activity.filter((e) => e.entity?.type === "maintenance" && e.entity.id === order.id), [activity, order.id]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="maintenance" value={order.status} />
          <StatusBadge kind="maintenanceType" value={order.type} />
          <StatusBadge kind="priority" value={order.priority} />
          {overdue && (
            <Badge tone="danger" dot>
              {t("maintenance.overdue")}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{tl(order.description)}</p>
        {order.type === "predictive" && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2">
            <DemoCalcBadge />
            <span className="min-w-0 flex-1">{t("maintenance.predictiveNote")}</span>
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="label">{t("common.progress")}</span>
          <span className="num text-[12.5px] font-semibold text-ink">{fmt.pct(order.progress / 100, 0)}</span>
        </div>
        <Progress className="mt-1.5" thick value={order.progress / 100} tone={order.status === "completed" ? "ok" : order.status === "cancelled" ? "neutral" : "accent"} label={t("common.progress")} />
      </div>

      <DataList
        items={[
          {
            label: t("maintenance.col.equipment"),
            value: (
              <EntityLink entity={{ type: "machine", id: order.machineId }}>
                <Code>{order.machineId}</Code>
              </EntityLink>
            ),
          },
          {
            label: t("common.line"),
            value: line ? (
              <EntityLink entity={{ type: "line", id: line.id }}>
                <Code>{line.code}</Code> <span>{tl(line.name)}</span>
              </EntityLink>
            ) : (
              "—"
            ),
          },
          { label: t("maintenance.drawer.machineStatus"), value: machine ? <StatusBadge kind="machine" value={machine.status} /> : "—" },
          { label: t("common.technician"), value: <Member id={order.technicianId} /> },
          {
            label: t("maintenance.col.scheduled"),
            value: (
              <span className={cn("num", overdue && "font-semibold text-danger")}>
                {fmt.dateTime(order.scheduledDate)} <span className="font-normal text-ink-3">· {fmt.relative(order.scheduledDate, now)}</span>
              </span>
            ),
          },
          { label: t("maintenance.col.duration"), value: <span className="num">{fmt.duration(order.estimatedHours * 60)}</span> },
          { label: order.status === "completed" ? t("maintenance.drawer.actualCost") : t("maintenance.drawer.estimatedCost"), value: <span className="num">{fmt.money(order.cost)}</span> },
          { label: t("common.created"), value: <span className="num">{fmt.dateTime(order.createdAt)}</span> },
          ...(order.completedAt ? [{ label: t("maintenance.drawer.completedAt"), value: <span className="num">{fmt.dateTime(order.completedAt)}</span> }] : []),
        ]}
      />

      {open && (
        <section aria-label={t("maintenance.drawer.execution")} className="rounded-md border border-line p-3.5">
          <h3 className="label">{t("maintenance.drawer.execution")}</h3>
          {order.status === "requested" && <p className="mt-2 text-[12.5px] text-ink-2">{t("maintenance.drawer.needsTech")}</p>}
          {order.status === "scheduled" && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">{t("maintenance.drawer.startHint")}</p>
              <Guard cap="maintenance.execute">
                <Button variant="primary" icon={Play} onClick={() => onDialog("start")}>
                  {t("maintenance.action.start")}
                </Button>
              </Guard>
            </div>
          )}
          {order.status === "in_progress" && (
            <div className="mt-2.5 flex flex-col gap-3">
              <Field label={t("maintenance.drawer.updateProgress")}>
                {(p) => (
                  <div className="flex items-center gap-3">
                    <input
                      {...p}
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progress}
                      disabled={!canExecute}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      className="h-[34px] min-w-0 flex-1 cursor-pointer accent-[var(--forge)] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      aria-label={t("maintenance.drawer.progressPct")}
                      min={0}
                      max={100}
                      step={5}
                      value={progress}
                      disabled={!canExecute}
                      onChange={(e) => setProgress(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                      className="!w-[72px] shrink-0"
                    />
                  </div>
                )}
              </Field>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Guard cap="maintenance.execute">
                  <Button disabled={progress === order.progress} onClick={saveProgress}>
                    {t("maintenance.action.updateProgress")}
                  </Button>
                </Guard>
                <Guard cap="maintenance.execute">
                  <Button variant="primary" icon={CheckCircle2} onClick={() => onDialog("complete")}>
                    {t("maintenance.action.complete")}
                  </Button>
                </Guard>
              </div>
            </div>
          )}
        </section>
      )}

      {open && (
        <section aria-label={t("maintenance.drawer.planning")} className="rounded-md border border-line p-3.5">
          <h3 className="label">{t("maintenance.drawer.planning")}</h3>
          <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
            <Field label={t("maintenance.drawer.assign")} hint={order.status === "requested" ? t("maintenance.form.technicianHint") : undefined}>
              {(p) => (
                <Select {...p} value={tech} disabled={!canManage} onChange={(e) => setTech(e.target.value)}>
                  {order.status !== "in_progress" && <option value="">{t("common.unassigned")}</option>}
                  {technicians.map((m) => (
                    <option key={m.id} value={m.id}>
                      {tl(m.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("common.priority")}>
              {(p) => (
                <Select {...p} value={priority} disabled={!canManage} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((x) => (
                    <option key={x} value={x}>
                      {td(`priority.${x}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("maintenance.form.scheduled")} error={whenError}>
              {(p) => <Input {...p} type="datetime-local" value={when} disabled={!canManage} onChange={(e) => setWhen(e.target.value)} />}
            </Field>
            <Field label={t("maintenance.form.hours")} error={hoursError}>
              {(p) => <Input {...p} type="number" inputMode="decimal" min={0.5} max={72} step={0.5} value={hours} disabled={!canManage} onChange={(e) => setHours(e.target.value)} />}
            </Field>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
            {order.status !== "in_progress" ? (
              <Guard cap="maintenance.manage">
                <Button variant="danger" icon={Ban} onClick={() => onDialog("cancel")}>
                  {t("maintenance.action.cancel")}
                </Button>
              </Guard>
            ) : (
              <span />
            )}
            <Guard cap="maintenance.manage">
              <Button variant="primary" disabled={!dirty || !!whenError || !!hoursError} onClick={savePlanning}>
                {t("common.save")}
              </Button>
            </Guard>
          </div>
        </section>
      )}

      <section aria-label={t("maintenance.drawer.history")}>
        <h3 className="label">{t("maintenance.drawer.history")}</h3>
        {events.length === 0 ? (
          <EmptyState icon={History} title={t("maintenance.drawer.historyEmpty")} hint={t("maintenance.drawer.historyEmptyHint")} className="py-6" />
        ) : (
          <ol className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2.5">
                <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneBg[SEVERITY_TONE[e.severity]])} />
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-snug text-ink">{tm(e.msg)}</p>
                  <p className="num mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">
                    <span>{fmt.dateTime(e.at)}</span>
                    {e.actorId && lookup.member(e.actorId) && <span>· {tl(lookup.member(e.actorId)!.name)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
