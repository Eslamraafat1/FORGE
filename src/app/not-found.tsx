import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="label">Error 404 · FORGE</p>
      <h1 className="display text-[44px] text-ink">Route not found</h1>
      <p className="max-w-sm text-[13px] text-ink-2">This location does not exist in the FORGE workspace.</p>
      <Link href="/overview" className="mt-2 inline-flex h-9 items-center rounded-md bg-forge px-4 text-[13px] font-semibold text-forge-ink">
        Back to Overview
      </Link>
    </main>
  );
}
