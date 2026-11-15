import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsView } from "@/views/admin/reports/ReportsView";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsView />
    </Suspense>
  );
}
