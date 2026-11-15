import type { Metadata } from "next";
import { Suspense } from "react";
import { QualityView } from "@/views/intel/QualityView";

export const metadata: Metadata = { title: "Quality Control" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QualityView />
    </Suspense>
  );
}
