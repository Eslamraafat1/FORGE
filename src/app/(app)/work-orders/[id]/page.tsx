import type { Metadata } from "next";
import { WorkOrderDetailView } from "@/views/production/WorkOrderDetailView";

export const metadata: Metadata = { title: "Work Order" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetailView id={decodeURIComponent(id)} />;
}
