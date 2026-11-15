import type { Metadata } from "next";
import { Suspense } from "react";
import { MaintenanceView } from "@/views/assets/MaintenanceView";

export const metadata: Metadata = { title: "Maintenance" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MaintenanceView />
    </Suspense>
  );
}
