import type { Metadata } from "next";
import { TeamView } from "@/views/admin/team/TeamView";

export const metadata: Metadata = { title: "Team & Access" };

export default function Page() {
  return <TeamView />;
}
