"use client";

import { ROLE_ORDER } from "@/lib/account/logic";
import type { AccountRole } from "@/lib/account/types";
import { ROLE_LABEL } from "@/lib/verification/admin-logic";

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
    <div className="sticky top-0 z-20 bg-bg pt-[env(safe-area-inset-top)]">
      <div role="tablist" aria-label="역할 화면" className="mx-auto flex w-full max-w-md gap-1 px-5 pt-3">
        <div className="flex w-full gap-1 rounded-full bg-white p-1 shadow-sm">
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
