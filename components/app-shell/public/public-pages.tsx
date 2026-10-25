"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CenterPublicProfileView } from "@/components/centers/center-public-profile";
import { ApplySheet } from "@/components/jobs/apply-sheet";
import { JobDetail } from "@/components/jobs/job-detail";
import { JobList } from "@/components/jobs/job-list";
import { BRAND } from "@/lib/brand";
import { SupabaseAuthProvider, useAuth } from "@/lib/app-shell/auth-provider";
import type { JobSummary, JobViewer } from "@/lib/jobs/types";
import { closeNavigable, goBackInApp, useNavigable } from "@/lib/navigation/use-navigable";

/** 공고 탭 안 덮는 화면(공고 상세·센터 프로필)의 깊이 주소 키 — 한 칸씩 방문 기록에 */
const JOBS_DEPTH_PARAM = "v_jobs";

function useViewer(): { viewer: JobViewer; loading: boolean } {
  const { user, isLoading } = useAuth();
  return {
    viewer: { userId: user?.id ?? null, roles: user?.roles ?? [], active: user?.accountStatus === "active" },
    loading: isLoading,
  };
}

const ViewerContext = createContext<JobViewer>({ userId: null, roles: [] });

/** 공유 링크용 공개 틀: 앱 셸·로그인 없이 열린다. 상단에 브랜드 + 로그인/가입 링크만. 라우트 그룹 레이아웃이라 페이지를 옮겨도 다시 만들어지지 않는다. */
function PublicFrame({ children }: { children: ReactNode }) {
  const { viewer, loading } = useViewer();
  return (
    <div className="mx-auto min-h-app w-full max-w-md">
      <header className="flex items-center justify-between px-5 pt-6">
        <Link href="/jobs" className="text-lg font-bold tracking-tight text-ink">
          {BRAND.appName}
        </Link>
        {!viewer.userId && !loading && (
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link href="/?auth=login" className="flex h-11 items-center px-3 text-muted">
              로그인
            </Link>
            <Link href="/?auth=signup" className="flex h-11 items-center rounded-full bg-ink px-5 text-white">
              가입
            </Link>
          </nav>
        )}
        {viewer.userId && (
          <Link href="/" className="flex h-11 items-center px-2 text-sm font-semibold text-muted">
            내 화면
          </Link>
        )}
      </header>
      <main className="px-5 pb-16 pt-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">불러오는 중…</p>
        ) : (
          <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
        )}
      </main>
    </div>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <SupabaseAuthProvider>
      <PublicFrame>{children}</PublicFrame>
    </SupabaseAuthProvider>
  );
}

const SIGNUP = "/?auth=signup";

export function PublicJobsPage() {
  const router = useRouter();
  return <JobList onOpenJob={(j) => router.push(`/jobs/${j.id}`)} />;
}

export function PublicJobPage({ id }: { id: string }) {
  const router = useRouter();
  const viewer = useContext(ViewerContext);
  const [applying, setApplying] = useState<JobSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 지원은 로그인한 강사만(서버 apply_to_job이 다시 확인한다). 비로그인은 가입, 센터 전용 계정은 지원 버튼 없음.
  const canApply = !!viewer.userId && viewer.roles.includes("instructor");
  return (
    <>
      <JobDetail
        jobId={id}
        viewer={viewer}
        onBack={() => router.push("/jobs")}
        onOpenCenter={(cid) => router.push(`/centers/${cid}`)}
        onSignup={() => router.push(SIGNUP)}
        onApply={canApply ? setApplying : undefined}
        reloadKey={reloadKey}
      />
      {canApply && (
        <ApplySheet
          job={applying}
          onClose={() => setApplying(null)}
          onApplied={() => setReloadKey((n) => n + 1)}
          onOpenResume={() => router.push("/")}
        />
      )}
    </>
  );
}

export function PublicCenterPage({ id }: { id: string }) {
  const router = useRouter();
  const viewer = useContext(ViewerContext);
  return (
    <CenterPublicProfileView
      centerId={id}
      loggedIn={!!viewer.userId}
      reporterId={viewer.active ? viewer.userId : null}
      onBack={() => router.push("/jobs")}
      onOpenJob={(jid) => router.push(`/jobs/${jid}`)}
      onSignup={() => router.push(SIGNUP)}
    />
  );
}

type View = { kind: "list" } | { kind: "job"; id: string } | { kind: "center"; id: string };

/**
 * 로그인한 셸 안의 공고 탭. 같은 목록·상세·센터 프로필 컴포넌트를 쓰고, 화면 이동은 여기서 쥔다.
 * 이미 SupabaseAuthProvider 안에 있다.
 */
export function JobsBrowser({
  onApply,
  reloadKey,
  initialJobId,
}: {
  onApply?: (job: JobSummary) => void;
  reloadKey?: number;
  /** 지원 현황에서 카드를 눌러 들어왔을 때 바로 열 공고 */
  initialJobId?: string | null;
}) {
  const { viewer } = useViewer();
  // 목록 위에 쌓인 화면들(값은 메모리에), 지금 깊이는 주소 키 — 폰 뒤로가기·[목록]/[뒤로]가 한 칸씩 같은 길로 닫는다
  const [stack, setStack] = useState<View[]>(() =>
    initialJobId ? [{ kind: "list" }, { kind: "job", id: initialJobId }] : [{ kind: "list" }],
  );
  const [rawDepth, setRawDepth] = useNavigable(JOBS_DEPTH_PARAM);
  // 다른 탭에서 공고를 눌러 들어온 첫 그림: 기록에 올리기 전에도 그 공고를 보여 준다(목록이 잠깐 보이지 않게)
  const [initPending, setInitPending] = useState(!!initialJobId);
  const parsed = rawDepth === null ? (initPending ? 1 : 0) : Number.parseInt(rawDepth, 10);
  // 새로 고침 뒤 남은 키 등 메모리에 없는 깊이는 있는 데까지만
  const depth = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, stack.length - 1) : 0;
  const view = stack[depth];
  const push = (v: View) => {
    setStack((s) => [...s.slice(0, depth + 1), v]);
    setRawDepth(String(depth + 1));
  };
  // 한 칸 뒤로(쌓은 칸이 아니면 키를 지워 목록으로)
  const pop = () => goBackInApp(() => closeNavigable(JOBS_DEPTH_PARAM));
  const noop = () => {};

  // 다른 탭에서 공고를 눌러 들어왔으면 목록 위에 그 공고를 한 칸 쌓아 연다(뒤로 = 공고 목록)
  const opened = useRef(false);
  useEffect(() => {
    if (!initialJobId || opened.current) return;
    opened.current = true;
    setRawDepth("1");
    setInitPending(false);
  }, [initialJobId, setRawDepth]);

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
        reporterId={viewer.active ? viewer.userId : null}
        onBack={pop}
        onOpenJob={(id) => push({ kind: "job", id })}
        onSignup={noop}
      />
    );
  return <JobList onOpenJob={(j) => push({ kind: "job", id: j.id })} />;
}
