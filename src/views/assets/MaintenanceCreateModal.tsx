"use client";
import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import type { MaintenanceType, Priority } from "@/domain/types";
import { useT, type TKey } from "@/i18n";
import { DAY, fromInput, toInputDateTime } from "@/lib/time";
import { useForge } from "@/store/store";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { useAction } from "@/components/ui/toast";

export const MAINT_TYPES: MaintenanceType[] = ["preventive", "corrective", "predictive"];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

const schema = z.object({
  machineId: z.string().min(1, "maintenance.form.err.machine"),
  type: z.enum(["preventive", "corrective", "predictive"]),
  description: z.string().trim().min(8, "maintenance.form.err.description").max(400, "maintenance.form.err.descriptionLong"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  technicianId: z.string(),
  scheduled: z.string().refine((v) => Number.isFinite(fromInput(v)), "maintenance.form.err.date"),
  hours: z
    .string()
    .refine((v) => v.trim() !== "" && Number(v) > 0, "maintenance.form.err.hours")
    .refine((v) => Number(v) <= 72, "maintenance.form.err.hoursMax"),
  cost: z.string().refine((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "maintenance.form.err.cost"),
});

type FormState = z.infer<typeof schema>;
type Errors = Partial<Record<keyof FormState, TKey>>;

/**
 * Create maintenance request. Mount it with a fresh `key` each time it opens
 * so the form starts from its defaults (and the optional machine prefill).
 */
export function MaintenanceCreateModal({ open, onClose, machineId, onCreated }: { open: boolean; onClose: () => void; machineId?: string | null; onCreated?: (id: string) => void }) {
  const { t, td, tl } = useT();
  const formId = useId();
  const machines = useForge((s) => s.machines);
  const team = useForge((s) => s.team);
  const createMaintenance = useForge((s) => s.createMaintenance);
  const run = useAction();
  const technicians = useMemo(() => team.filter((m) => m.role === "technician"), [team]);

  const [form, setForm] = useState<FormState>(() => {
    const s = useForge.getState();
    const known = machineId && s.machines.some((m) => m.id === machineId) ? machineId : "";
    return { machineId: known, type: "corrective", description: "", priority: "medium", technicianId: "", scheduled: toInputDateTime(s.now + DAY), hours: "2", cost: "" };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const err = (key: keyof FormState) => (errors[key] ? t(errors[key]) : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!next[key]) next[key] = issue.message as TKey;
      }
      setErrors(next);
      return;
    }
    const v = parsed.data;
    const result = createMaintenance({
      machineId: v.machineId,
      type: v.type,
      description: v.description,
      priority: v.priority,
      technicianId: v.technicianId || null,
      scheduledDate: fromInput(v.scheduled),
      estimatedHours: Number(v.hours),
      cost: v.cost.trim() === "" ? 0 : Number(v.cost),
    });
    if (run(result, t("maintenance.form.created", { id: result.ok ? (result.id ?? "") : "" }), v.technicianId ? t("maintenance.form.createdScheduled") : t("maintenance.form.createdRequested"))) {
      onClose();
      if (result.ok && result.id) onCreated?.(result.id);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("maintenance.form.title")}
      description={t("maintenance.form.description")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {t("maintenance.form.submit")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t("maintenance.form.equipment")} error={err("machineId")} className="sm:col-span-2">
          {(p) => (
            <Select {...p} data-autofocus value={form.machineId} onChange={(e) => set("machineId", e.target.value)}>
              <option value="">{t("maintenance.form.selectEquipment")}</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {tl(m.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("common.type")} hint={form.type === "predictive" ? t("maintenance.form.predictiveHint") : undefined}>
          {(p) => (
            <Select {...p} value={form.type} onChange={(e) => set("type", e.target.value as MaintenanceType)}>
              {MAINT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {td(`mnttype.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("common.priority")}>
          {(p) => (
            <Select {...p} value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
              {PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {td(`priority.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("maintenance.form.issue")} error={err("description")} className="sm:col-span-2">
          {(p) => <Textarea {...p} value={form.description} maxLength={400} placeholder={t("maintenance.form.issuePlaceholder")} onChange={(e) => set("description", e.target.value)} />}
        </Field>
        <Field label={t("common.technician")} optional hint={t("maintenance.form.technicianHint")}>
          {(p) => (
            <Select {...p} value={form.technicianId} onChange={(e) => set("technicianId", e.target.value)}>
              <option value="">{t("common.unassigned")}</option>
              {technicians.map((m) => (
                <option key={m.id} value={m.id}>
                  {tl(m.name)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("maintenance.form.scheduled")} error={err("scheduled")}>
          {(p) => <Input {...p} type="datetime-local" value={form.scheduled} onChange={(e) => set("scheduled", e.target.value)} />}
        </Field>
        <Field label={t("maintenance.form.hours")} error={err("hours")}>
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0.5} max={72} step={0.5} value={form.hours} onChange={(e) => set("hours", e.target.value)} />}
        </Field>
        <Field label={t("maintenance.form.cost")} optional error={err("cost")}>
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step={10} value={form.cost} placeholder="0" onChange={(e) => set("cost", e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}
