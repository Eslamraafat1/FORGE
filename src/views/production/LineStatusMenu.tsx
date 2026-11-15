"use client";
import { useMemo, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { LineStatus, ProductionLine } from "@/domain/types";
import { useT } from "@/i18n";
import { useForge } from "@/store/store";
import { Button, IconButton } from "@/components/ui/primitives";
import { ConfirmDialog, Menu } from "@/components/ui/overlay";
import { Guard } from "@/components/ui/page";
import { useAction } from "@/components/ui/toast";
import { LINE_STATUSES } from "./shared";

/**
 * Demo control for a line's status. The store validates the change, pauses
 * the running order and brings the machines along; this only asks for
 * confirmation before a running line is taken out of production.
 */
export function LineStatusMenu({ line, variant = "button" }: { line: ProductionLine; variant?: "button" | "icon" }) {
  const { t, td } = useT();
  const run = useAction();
  const setLineStatus = useForge((s) => s.setLineStatus);
  const workOrders = useForge((s) => s.workOrders);
  const [target, setTarget] = useState<LineStatus>("idle");
  const [confirming, setConfirming] = useState(false);

  const activeOrder = useMemo(() => workOrders.find((o) => o.lineId === line.id && o.status === "in_progress"), [workOrders, line.id]);

  const apply = (status: LineStatus) => run(setLineStatus(line.id, status), t("production.statusChanged", { line: line.code, status: `@lstatus.${status}` }));

  const choose = (status: LineStatus) => {
    if (status === line.status) return;
    if (line.status === "running") {
      setTarget(status);
      setConfirming(true);
    } else apply(status);
  };

  const label = t("production.setStatus", { line: line.code });

  return (
    <>
      <Guard cap="line.control">
        <Menu
          label={label}
          width={248}
          trigger={(p) =>
            variant === "icon" ? (
              <IconButton icon={SlidersHorizontal} label={label} tooltipSide="top" {...p} />
            ) : (
              <Button icon={SlidersHorizontal} iconEnd={ChevronDown} {...p}>
                {t("common.changeStatus")}
              </Button>
            )
          }
          items={LINE_STATUSES.map((s) => ({
            label: td(`lstatus.${s}`),
            hint: td(`production.statusHint.${s}`),
            checked: s === line.status,
            onSelect: () => choose(s),
          }))}
        />
      </Guard>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => apply(target)}
        danger={target === "stopped"}
        title={t("production.stop.title", { line: line.code })}
        confirmLabel={t("production.stop.confirm", { status: `@lstatus.${target}` })}
        body={
          <>
            <p>{t("production.stop.body", { line: line.code, status: `@lstatus.${target}` })}</p>
            <ul className="mt-2 list-disc space-y-1 ps-4">
              {activeOrder && <li>{t("production.stop.order", { id: activeOrder.id })}</li>}
              <li>{t("production.stop.machines")}</li>
              {target !== "idle" && <li>{t("production.stop.downtime")}</li>}
            </ul>
          </>
        }
      />
    </>
  );
}
