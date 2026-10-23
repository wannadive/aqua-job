"use client";

import { useEffect, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { getApplicantContact } from "@/lib/jobs/api";
import { getOfferContact } from "@/lib/offers/api";

const EMAIL_SHAPE = /^[^\s@<>"',;:\?&#%]+@[^\s@<>"',;:\?&#%]+\.[^\s@<>"',;:\?&#%]+$/;

type State = { kind: "loading" } | { kind: "error" } | { kind: "none" } | { kind: "ok"; phone: string | null; email: string | null };

/**
 * 연락처 카드 — 연락처가 열리는 두 경로(선택 · 제안 수락)가 같이 쓴다.
 * appId면 get_applicant_contact(선택한 지원자), offerId면 get_offer_contact(제안을 수락한 강사).
 * 연락처는 이 컴포넌트 state에만 둔다(위로 올리거나 저장·로그하지 않는다).
 * 서버가 공고 주인 + 선택됨/수락 + 양쪽 활성 + 구독일 때만 돌려준다.
 */
export function ApplicantContact(props: { appId: string; offerId?: never } | { offerId: string; appId?: never }) {
  const appId = props.appId ?? null;
  const offerId = props.offerId ?? null;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (offerId ? getOfferContact(offerId) : getApplicantContact(appId as string))
      .then((c) => {
        if (cancelled) return;
        if (!c || (!c.phone && !c.email)) setState({ kind: "none" });
        else setState({ kind: "ok", phone: c.phone, email: c.email });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [appId, offerId, attempt]);

  return (
    <div className="mt-3 rounded-xl bg-ok-bg p-4">
      <div className="text-sm font-bold text-ok">연락처</div>
      {state.kind === "loading" && <p className="mt-2 text-sm text-muted">불러오는 중…</p>}
      {state.kind === "error" && (
        <p className="mt-2 text-sm text-muted">
          연락처를 불러오지 못했어요
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="ml-3 font-semibold text-ink underline">
            다시 시도
          </button>
        </p>
      )}
      {state.kind === "none" && <p className="mt-2 text-sm text-muted">볼 수 있는 연락처가 없어요</p>}
      {state.kind === "ok" && (
        <div className="mt-2 space-y-1">
          {state.phone && (
            <a href={`tel:${state.phone.replace(/[^0-9+]/g, "")}`} className="flex min-h-11 items-center gap-2 text-base font-semibold text-ink underline">
              <Phone className="size-4" /> {state.phone}
            </a>
          )}
          {state.email &&
            (EMAIL_SHAPE.test(state.email) ? (
              <a
                href={`mailto:${encodeURIComponent(state.email).replace(/%40/g, "@")}`}
                className="flex min-h-11 items-center gap-2 break-all text-base font-semibold text-ink underline"
              >
                <Mail className="size-4 shrink-0" /> {state.email}
              </a>
            ) : (
              <span className="flex min-h-11 items-center gap-2 break-all text-base font-semibold text-ink">
                <Mail className="size-4 shrink-0" /> {state.email}
              </span>
            ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        {offerId ? "이 연락처는 제안을 수락받은 센터에만 보여요" : "이 연락처는 선택한 센터에만 보여요"}
      </p>
    </div>
  );
}
