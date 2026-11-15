import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkOrdersView } from "@/views/production/WorkOrdersView";

export const metadata: Metadata = { title: "Work Orders" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkOrdersView />
    </Suspense>
  );
}
