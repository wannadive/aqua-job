"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchReviewDetail,
  purgeOriginal,
  reviewDocument,
  type ReviewDetail as Detail,
  type ReviewItem,
} from "@/lib/verification/admin-api";
import { DOC_TYPES } from "@/lib/verification/config";
import { kstDate, ROLE_LABEL } from "@/lib/verification/admin-logic";

const QUICK_REASONS = ["사진 흐림", "이름 불일치", "기간 만료", "다른 서류"] as const;

const META_LABELS: { key: "org" | "grade" | "number"; label: string }[] = [
  { key: "org", label: "단체" },
  { key: "grade", label: "등급" },
  { key: "number", label: "번호" },
];

function Notice({ title, desc, onBack }: { title: string; desc: string; onBack: () => void }) {
  return (
    <div className="rounded-card bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-muted">{desc}</p>
      <Button className="mt-5 h-12 w-full" onClick={onBack}>
        목록으로
      </Button>
    </div>
  );
}

export function ReviewDetail({ item, onBack }: { item: ReviewItem; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  /** 확인·반려는 끝났는데 원본 삭제만 실패한 경우, 어느 쪽이었는지 */
  const [purgePending, setPurgePending] = useState<"verified" | "rejected" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setImgError(false);
    fetchReviewDetail(item.id)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => {
        if (!cancelled) {
          toast.error("서류를 불러오지 못했어요");
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, attempt]);

  const cfg = DOC_TYPES[item.docType];
  const reload = () => setAttempt((n) => n + 1);

  const verify = async () => {
    if (busy) return;
    if (cfg.hasExpiry && !validUntil) {
      toast.error("유효기간을 입력해 주세요");
      return;
    }
    setBusy(true);
    try {
      const res = await reviewDocument({ docId: item.id, docType: item.docType, decision: "verified", validUntil: cfg.hasExpiry ? validUntil : undefined });
      if (res.purgeFailed) {
        toast.error(res.error ?? "원본 사진을 지우지 못했어요");
        setPurgePending("verified");
        return;
      }
      if (res.error) {
        toast.error(res.error);
        if (res.error === "이미 처리된 서류예요") reload();
        return;
      }
      toast.success(cfg.deleteOriginalOnVerify ? "확인했어요. 원본 사진은 삭제했어요" : "확인했어요");
      onBack();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (busy) return;
    if (!reason.trim()) {
      toast.error("반려 사유를 입력해 주세요");
      return;
    }
    setBusy(true);
    try {
      const res = await reviewDocument({ docId: item.id, docType: item.docType, decision: "rejected", reason: reason.trim() });
      if (res.purgeFailed) {
        toast.error(res.error ?? "원본 사진을 지우지 못했어요");
        setPurgePending("rejected");
        return;
      }
      if (res.error) {
        toast.error(res.error);
        if (res.error === "이미 처리된 서류예요") reload();
        return;
      }
      toast.success(cfg.deleteOriginalOnVerify ? "반려했어요. 원본 사진은 삭제했어요" : "반려했어요");
      onBack();
    } finally {
      setBusy(false);
    }
  };

  const retryPurge = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await purgeOriginal(item.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("원본 사진을 삭제했어요");
      onBack();
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (purgePending) {
    body = (
      <div className="rounded-card bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-bold text-ink">{purgePending === "verified" ? "확인은 끝났어요" : "반려는 끝났어요"}</h2>
        <p className="mt-2 text-sm text-muted">원본 사진을 아직 지우지 못했어요. 다시 시도해 주세요.</p>
        <Button className="mt-5 h-12 w-full" disabled={busy} onClick={() => void retryPurge()}>
          원본 사진 삭제 다시 시도
        </Button>
      </div>
    );
  } else if (loadError) {
    body = (
      <div className="rounded-card bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-muted">서류를 불러오지 못했어요</p>
        <Button variant="outline" className="mt-3 h-12" onClick={reload}>
          다시 시도
        </Button>
      </div>
    );
  } else if (!detail) {
    body = <p className="text-sm text-muted">불러오는 중…</p>;
  } else if (detail.state === "gone") {
    body = <Notice title="서류가 없어요" desc="삭제된 서류예요." onBack={onBack} />;
  } else if (detail.state === "processed") {
    body = <Notice title="이미 처리된 서류예요" desc="다른 관리자가 먼저 확인했거나 반려했어요." onBack={onBack} />;
  } else if (detail.state === "superseded") {
    body = <Notice title="새 서류로 바뀌었어요" desc="이 사람이 같은 서류를 다시 올렸어요. 목록에서 새로 올린 서류를 확인해 주세요." onBack={onBack} />;
  } else {
    const { doc, imageUrl, fileMissing } = detail;
    const metaRows = META_LABELS.filter((m) => doc.meta[m.key]);
    body = (
      <div className="space-y-4">
        <section className="overflow-hidden rounded-card bg-white shadow-sm">
          {fileMissing ? (
            <div className="flex flex-col items-center justify-center gap-2 bg-surface px-6 py-12 text-center">
              <ImageOff className="size-8 text-muted" />
              <p className="text-base font-semibold text-ink">원본 파일이 없어요</p>
              <p className="text-sm text-muted">제출한 사람이 사진을 지웠을 수 있어요. 반려 사유를 남겨 다시 올리도록 안내해 주세요.</p>
            </div>
          ) : imgError || !imageUrl ? (
            <div className="flex flex-col items-center justify-center gap-3 bg-surface px-6 py-12 text-center">
              <p className="text-sm text-muted">사진을 불러오지 못했어요</p>
              <Button variant="outline" className="h-11 bg-white" onClick={reload}>
                다시 불러오기
              </Button>
            </div>
          ) : (
            // 60초짜리 서명 주소라 next/image 최적화를 거치지 않는다
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={`${cfg.label} 사진`} className="max-h-[60dvh] w-full bg-surface object-contain" onError={() => setImgError(true)} />
          )}
        </section>

        <section className="rounded-card bg-white p-5 shadow-sm">
          <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">이름</dt>
            <dd className="font-semibold text-ink">{item.ownerName}</dd>
            <dt className="text-muted">유형</dt>
            <dd className="text-ink">{ROLE_LABEL[item.ownerRole]}</dd>
            <dt className="text-muted">서류</dt>
            <dd className="text-ink">{cfg.label}</dd>
            <dt className="text-muted">제출일</dt>
            <dd className="text-ink">{kstDate(doc.submittedAt)}</dd>
          </dl>
          {metaRows.length > 0 && (
            <div className="mt-4 rounded-xl bg-surface p-4">
              <div className="text-xs font-semibold text-muted">제출한 사람이 적은 내용 (본인 입력)</div>
              <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
                {metaRows.map((m) => (
                  <div key={m.key} className="contents">
                    <dt className="text-muted">{m.label}</dt>
                    <dd className="text-ink">{doc.meta[m.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        {rejecting ? (
          <section className="rounded-card bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-ink">반려 사유</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_REASONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setReason(q)}
                  aria-pressed={reason === q}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium ${reason === q ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
                >
                  {q}
                </button>
              ))}
            </div>
            <Textarea
              className="mt-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 적어 주세요 (필수). 제출한 사람에게 그대로 보여요."
              maxLength={300}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" disabled={busy} onClick={() => setRejecting(false)}>
                취소
              </Button>
              <Button className="h-12 bg-destructive text-white" disabled={busy || !reason.trim()} onClick={() => void reject()}>
                반려하기
              </Button>
            </div>
          </section>
        ) : (
          <section className="rounded-card bg-white p-5 shadow-sm">
            {cfg.hasExpiry && !fileMissing && (
              <div className="mb-4">
                <Label htmlFor="valid-until" className="text-sm font-semibold text-ink">
                  유효기간 (서류에 적힌 날짜)
                </Label>
                <Input id="valid-until" type="date" className="mt-2 h-12" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            )}
            {cfg.deleteOriginalOnVerify && !fileMissing && (
              <p className="mb-4 text-sm text-muted">확인하거나 반려하면 원본 사진은 바로 삭제돼요.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" disabled={busy} onClick={() => setRejecting(true)}>
                반려
              </Button>
              <Button
                className="h-12 bg-ink text-white"
                disabled={busy || fileMissing || (cfg.hasExpiry && !validUntil)}
                onClick={() => void verify()}
              >
                확인
              </Button>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-5" />
        목록
      </button>
      <h1 className="text-[22px] font-bold leading-tight text-ink">
        {item.ownerName} · {cfg.label}
      </h1>
      {body}
    </div>
  );
}
