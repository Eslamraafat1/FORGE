import type { EntityRef } from "@/domain/types";

/** Where each kind of record lives in the app. */
export function entityHref(ref: EntityRef): string {
  switch (ref.type) {
    case "machine":
      return `/equipment/${ref.id}`;
    case "workOrder":
      return `/work-orders/${ref.id}`;
    case "item":
      return `/inventory/${ref.id}`;
    case "supplier":
      return `/suppliers/${ref.id}`;
    case "line":
      return `/production/${ref.id}`;
    case "inspection":
      return `/quality/${ref.id}`;
    case "maintenance":
      return `/maintenance?order=${ref.id}`;
    case "po":
      return `/procurement?po=${ref.id}`;
    case "warehouse":
      return `/warehouse/${ref.id}`;
    case "report":
      return `/reports?report=${ref.id}`;
    case "member":
      return `/team`;
  }
}
