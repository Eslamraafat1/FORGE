import type { Metadata } from "next";
import { LineDetailView } from "@/views/production/LineDetailView";

export const metadata: Metadata = { title: "Production Line" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LineDetailView id={decodeURIComponent(id)} />;
}
