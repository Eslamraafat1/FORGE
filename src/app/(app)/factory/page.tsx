import type { Metadata } from "next";
import { FactoryView } from "@/views/factory/FactoryView";

export const metadata: Metadata = { title: "Digital Twin" };

export default function Page() {
  return <FactoryView />;
}
