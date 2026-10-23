"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CenterPublicProfileView } from "@/components/centers/center-public-profile";
import { JobDetail } from "@/components/jobs/job-detail";
import { JobList } from "@/components/jobs/job-list";
import { BRAND } from "@/lib/brand";
import { SupabaseAuthProvider, useAuth } from "@/lib/app-shell/auth-provider";
import type { JobSummary, JobViewer } from "@/lib/jobs/types";

function useViewer(): { viewer: JobViewer; loading: boolean } {
  const { user, isLoading } = useAuth();
  return { viewer: { userId: user?.id ?? null, roles: user?.roles ?? [] }, loading: isLoading };
}

/** 공유 링크용 공개 틀: 앱 셸·로그인 없이 열린다. 상단에 브랜드 + 로그인/가입 링크만. */
function PublicFrame({ children }: { children: (v: JobViewer) => ReactNode }) {
  const { viewer, loading } = useViewer();
  return (
    <div className="mx-auto min-h-app w-full max-w-md">
      <header className="flex items-center justify-between px-5 pt-6">
        <Link href="/jobs" className="text-lg font-bold tracking-tight text-ink">
          {BRAND.appName}
        </Link>
        {!viewer.userId && !loading && (
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/" className="text-muted">
              로그인
            </Link>
            <Link href="/" className="rounded-full bg-ink px-4 py-2 text-white">
              가입
            </Link>
          </nav>
        )}
        {viewer.userId && (
          <Link href="/" className="text-sm font-semibold text-muted">
            내 화면
          </Link>
        )}
      </header>
      <main className="px-5 pb-16 pt-4">
        {loading ? <p className="py-8 text-center text-sm text-muted">불러오는 중…</p> : children(viewer)}
      </main>
    </div>
  );
}

function PublicRoot({ children }: { children: (v: JobViewer) => ReactNode }) {
  return (
    <SupabaseAuthProvider>
      <PublicFrame>{children}</PublicFrame>
    </SupabaseAuthProvider>
  );
}

export function PublicJobsPage() {
  const router = useRouter();
  return (
    <PublicRoot>
      {() => <JobList onOpenJob={(j) => router.push(`/jobs/${j.id}`)} />}
    </PublicRoot>
  );
}

export function PublicJobPage({ id }: { id: string }) {
  const router = useRouter();
  return (
    <PublicRoot>
      {(viewer) => (
        <JobDetail
          jobId={id}
          viewer={viewer}
          onBack={() => router.push("/jobs")}
          onOpenCenter={(cid) => router.push(`/centers/${cid}`)}
          onSignup={() => router.push("/")}
          onApply={() => router.push("/")}
        />
      )}
    </PublicRoot>
  );
}

export function PublicCenterPage({ id }: { id: string }) {
  const router = useRouter();
  return (
    <PublicRoot>
      {(viewer) => (
        <CenterPublicProfileView
          centerId={id}
          loggedIn={!!viewer.userId}
          onBack={() => router.push("/jobs")}
          onOpenJob={(jid) => router.push(`/jobs/${jid}`)}
          onSignup={() => router.push("/")}
        />
      )}
    </PublicRoot>
  );
}

type View = { kind: "list" } | { kind: "job"; id: string } | { kind: "center"; id: string };

/**
 * 로그인한 셸 안의 공고 탭. 같은 목록·상세·센터 프로필 컴포넌트를 쓰고, 화면 이동은 여기서 쥔다.
 * 이미 SupabaseAuthProvider 안에 있다.
 */
export function JobsBrowser({ onApply, reloadKey }: { onApply?: (job: JobSummary) => void; reloadKey?: number }) {
  const { viewer } = useViewer();
  const [stack, setStack] = useState<View[]>([{ kind: "list" }]);
  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const noop = () => {};

  if (view.kind === "job")
    return (
      <JobDetail
        jobId={view.id}
        viewer={viewer}
        onBack={pop}
        onOpenCenter={(id) => push({ kind: "center", id })}
        onSignup={noop}
        onApply={onApply}
        reloadKey={reloadKey}
      />
    );
  if (view.kind === "center")
    return (
      <CenterPublicProfileView
        centerId={view.id}
        loggedIn
        onBack={pop}
        onOpenJob={(id) => push({ kind: "job", id })}
        onSignup={noop}
      />
    );
  return <JobList onOpenJob={(j) => push({ kind: "job", id: j.id })} />;
}
