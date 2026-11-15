import type { Metadata } from "next";
import { OverviewView } from "@/views/command/OverviewView";

export const metadata: Metadata = { title: "Overview", description: "Executive command center: the operational pulse across the simulated FORGE manufacturing network." };

export default function Page() {
  return <OverviewView />;
}
