import type { Metadata } from "next";
import { PlanningView } from "@/views/planning/PlanningView";

export const metadata: Metadata = { title: "Production Planning" };

export default function Page() {
  return <PlanningView />;
}
