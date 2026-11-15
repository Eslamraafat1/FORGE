import type { Metadata } from "next";
import { ItemDetailView } from "@/views/resources/ItemDetailView";

export const metadata: Metadata = { title: "Inventory Item" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemDetailView id={decodeURIComponent(id)} />;
}
