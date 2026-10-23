"use client";

import { PlusSquare, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { canTryEnable, PUSH_STATE_TEXT } from "@/lib/notifications/push-state";
import { useNotifications } from "./notifications-provider";

function IosInstallSteps() {
  return (
    <ol className="mt-3 space-y-1.5 rounded-xl bg-surface p-3 text-sm text-ink">
      <li className="flex items-center gap-1.5">
        <span className="font-bold">1</span> 사파리 아래쪽 <Share className="inline size-4" /> <b>공유</b> 버튼
      </li>
      <li className="flex items-center gap-1.5">
        <span className="font-bold">2</span> <PlusSquare className="inline size-4" /> <b>홈 화면에 추가</b>
      </li>
      <li className="flex items-center gap-1.5">
        <span className="font-bold">3</span> 홈 화면의 <b>{BRAND.appName}</b> 아이콘으로 열고 여기서 알림 켜기
      </li>
    </ol>
  );
}

/** "알림 받기": 이 기기 웹 푸시 켜기/끄기와 지금 상태(켜짐·꺼짐·차단됨·지원 안 됨·홈 화면 추가 필요·준비 중). */
export function PushSettingsCard() {
  const { push } = useNotifications();
  const s = push.state;
  const text = s ? PUSH_STATE_TEXT[s] : null;

  return (
    <section className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">알림 받기</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            s === "on" ? "bg-ok-bg text-ok" : s === "denied" || s === "ios-needs-install" ? "bg-warn-bg text-warn" : "bg-surface text-muted"
          }`}
        >
          {push.checkError ? "확인 못 함" : (text?.label ?? "확인 중")}
        </span>
      </div>

      {push.checkError ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-sm text-muted">
          알림 상태를 확인하지 못했어요
          <button type="button" onClick={() => void push.refresh()} className="font-semibold text-ink underline">
            다시 시도
          </button>
        </div>
      ) : (
        text && <p className="mt-2 text-sm text-muted">{text.desc}</p>
      )}

      {s === "ios-needs-install" && <IosInstallSteps />}

      {!push.checkError && (s === "on" || s === "off") && (
        <p className="mt-2 text-xs text-muted">
          로그아웃하거나 로그인이 끝나면 이 기기 알림도 꺼져요(같은 폰을 쓰는 다른 사람에게 내 알림이 가지 않게). 다시 로그인하면 알림을 다시 켜 주세요
        </p>
      )}

      {!push.checkError && s === "on" && (
        <Button variant="outline" className="mt-4 h-12 w-full border-line text-base" disabled={push.busy} onClick={push.disable}>
          {push.busy ? "처리 중…" : "이 기기 알림 끄기"}
        </Button>
      )}
      {!push.checkError && s && canTryEnable(s) && (
        <Button className="mt-4 h-12 w-full bg-ink text-base text-white" disabled={push.busy} onClick={push.enable}>
          {push.busy ? "처리 중…" : s === "denied" ? "허용한 뒤 다시 켜기" : "이 기기에서 알림 켜기"}
        </Button>
      )}
    </section>
  );
}
