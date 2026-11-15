import type { Metadata } from "next";
import { EquipmentDetailView } from "@/views/assets/EquipmentDetailView";

export const metadata: Metadata = { title: "Equipment" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EquipmentDetailView id={decodeURIComponent(id)} />;
}
