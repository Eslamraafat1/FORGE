"use client";
import type { ComponentProps, ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { Supplier } from "@/domain/types";
import { useT } from "@/i18n";
import type { Capability } from "@/lib/permissions";
import { Badge, Button, cn } from "@/components/ui/primitives";
import { Guard, useCan } from "@/components/ui/page";
import { SUPPLIER_TONE } from "./logic";

/** States plainly that procurement here is a local demo: nothing leaves the browser. */
export function DemoNotice({ children, className }: { children?: ReactNode; className?: string }) {
  const { t } = useT();
  return (
    <p role="note" className={cn("flex items-start gap-2.5 rounded-md border border-dashed border-line-2 bg-base px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2", className)}>
      <FlaskConical aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
      <span>{children ?? t("procurement.demoNotice")}</span>
    </p>
  );
}

export function SupplierStatusBadge({ status }: { status: Supplier["status"] }) {
  const { td } = useT();
  return (
    <Badge tone={SUPPLIER_TONE[status]} dot>
      {td(`supstatus.${status}`)}
    </Badge>
  );
}

/** Button that needs a demo capability: visibly disabled and inert when the role lacks it. */
export function GuardedButton({ cap, onClick, ...rest }: ComponentProps<typeof Button> & { cap: Capability }) {
  const allowed = useCan(cap);
  return (
    <Guard cap={cap}>
      <Button {...rest} onClick={allowed ? onClick : undefined} aria-disabled={allowed ? undefined : true} tabIndex={allowed ? rest.tabIndex : -1} type={allowed ? rest.type : "button"} />
    </Guard>
  );
}

/** Small section heading used inside the review drawer. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="label">{children}</h3>
      {aside}
    </div>
  );
}
