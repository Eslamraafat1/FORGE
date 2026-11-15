import type { Metadata } from "next";
import { OperationsView } from "@/views/command/OperationsView";

export const metadata: Metadata = { title: "Live Operations", description: "Live monitoring workspace for every production line. All figures come from a deterministic local simulation." };

export default function Page() {
  return <OperationsView />;
}
