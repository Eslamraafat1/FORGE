import type { Metadata } from "next";
import { Suspense } from "react";
import { ProcurementView } from "@/views/procurement/ProcurementView";

export const metadata: Metadata = { title: "Procurement" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProcurementView />
    </Suspense>
  );
}
