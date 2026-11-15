import type { Metadata } from "next";
import { ProductionView } from "@/views/production/ProductionView";

export const metadata: Metadata = { title: "Production Lines" };

export default function Page() {
  return <ProductionView />;
}
