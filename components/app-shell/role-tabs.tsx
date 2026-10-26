"use client";

import { ROLE_ORDER } from "@/lib/app-shell/account/logic";
import type { AccountRole } from "@/lib/app-shell/account/types";
import { ROLE_LABEL } from "@/lib/verification/admin-logic";

/**
 * 위 막대(고정) 높이 = 안전 영역 + 역할 탭(60px, 여러 역할일 때만) + 종 줄(56px = 위 여백 12 + 종 44).
 * 아래 화면은 .min-h-app으로 이만큼 줄어든다(app-router의 위 막대와 같은 값).
 */
export function TOP_BAR_HEIGHT(withRoleTabs: boolean): string {
  return withRoleTabs ? "calc(116px + env(safe-area-inset-top))" : "calc(56px + env(safe-area-inset-top))";
}

/**
 * 여러 역할 계정의 상단 역할 탭: [관리자] [강사] [센터] 중 가진 것만.
 * 역할이 하나면 아무것도 그리지 않는다.
 */
export function RoleTabs({
  roles,
  value,
  onChange,
}: {
  roles: AccountRole[];
  value: AccountRole;
  onChange: (role: AccountRole) => void;
}) {
  const shown = ROLE_ORDER.filter((r) => roles.includes(r));
  if (shown.length <= 1) return null;
  return (
    // 고정·안전 영역은 app-router의 위 막대(header)가 맡는다
    <div>
      <div role="tablist" aria-label="역할 화면" className="mx-auto flex h-[60px] w-full max-w-md gap-1 px-5 pt-3">
        <div className="flex h-12 w-full gap-1 rounded-full bg-white p-1 shadow-sm">
          {shown.map((r) => {
            const selected = r === value;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => !selected && onChange(r)}
                className={`h-10 flex-1 rounded-full text-sm font-semibold transition-colors ${selected ? "bg-ink text-white" : "text-muted"}`}
              >
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
