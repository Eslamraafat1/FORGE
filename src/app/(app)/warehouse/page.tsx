import type { Metadata } from "next";
import { WarehouseView } from "@/views/resources/WarehouseView";

export const metadata: Metadata = { title: "Warehouse" };

export default function Page() {
  return <WarehouseView />;
}
