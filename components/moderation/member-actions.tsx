"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { accountActionsFor, canActOnAccount } from "@/lib/moderation/logic";
import type { AccountStatusValue } from "@/lib/moderation/types";
import { ModerationActionDialog, type ActionRequest } from "./action-dialog";

const LABEL = { suspend: "정지", ban: "퇴출", reactivate: "다시 활성" } as const;

/**
 * 관리자 회원 목록 한 줄의 조치 버튼(정지 · 퇴출 · 다시 활성). 관리자 계정 · 나 자신에게는 그리지 않는다.
 * 실행은 확인 창을 거쳐 admin_set_account_status(서버가 최종 관문).
 */
export function MemberActions({
  member,
  adminId,
  onChanged,
}: {
  member: { id: string; displayName: string; roles: readonly string[]; accountStatus: AccountStatusValue };
  adminId: string | null;
  /** 조치 뒤 회원 목록만 다시 불러오기 */
  onChanged: () => Promise<unknown> | void;
}) {
  const [req, setReq] = useState<(ActionRequest & { key: number }) | null>(null);
  const seq = useRef(0);
  if (!canActOnAccount({ id: member.id, roles: member.roles }, adminId)) return null;
  const actions = accountActionsFor(member.accountStatus);
  if (actions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            variant="outline"
            className={`h-10 border-line px-4 text-sm ${a === "ban" ? "text-warn" : ""}`}
            onClick={() => setReq({ action: a, targetId: member.id, targetName: member.displayName, fromStatus: member.accountStatus, key: ++seq.current })}
          >
            {LABEL[a]}
          </Button>
        ))}
      </div>
      {req && <ModerationActionDialog key={req.key} request={req} onClose={() => setReq(null)} onDone={onChanged} />}
    </>
  );
}
