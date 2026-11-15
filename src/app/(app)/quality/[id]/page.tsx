import type { Metadata } from "next";
import { InspectionDetailView } from "@/views/intel/InspectionDetailView";

export const metadata: Metadata = { title: "Inspection" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InspectionDetailView id={decodeURIComponent(id)} />;
}
