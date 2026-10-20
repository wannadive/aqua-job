import { BRAND } from "@/lib/brand";

// 이후 작업에서 AuthProvider > AppRouter 가 이 자리에 들어온다.
export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card bg-white p-6 shadow-sm">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{BRAND.appName}</h1>
        <p className="mt-1 text-sm text-muted">{BRAND.tagline}</p>
      </div>
    </main>
  );
}
