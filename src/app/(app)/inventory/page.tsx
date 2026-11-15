import type { Metadata } from "next";
import { InventoryView } from "@/views/resources/InventoryView";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return <InventoryView />;
}
