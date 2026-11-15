import type { Metadata } from "next";
import { EquipmentView } from "@/views/assets/EquipmentView";

export const metadata: Metadata = { title: "Equipment" };

export default function Page() {
  return <EquipmentView />;
}
