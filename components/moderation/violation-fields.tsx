"use client";

import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX, VIOLATION_REASONS, charCount, isViolationReason, noteRequired } from "@/lib/moderation/logic";
import type { ViolationReason } from "@/lib/moderation/types";

/**
 * 위반 사유 고르기 + 설명. 신고 시트와 관리자 조치 창이 같이 쓴다.
 * noteHint: 설명 칸 아래 안내(누가 보는지). 글은 텍스트로만 그린다.
 */
export function ViolationFields({
  idPrefix,
  reason,
  note,
  onReason,
  onNote,
  disabled,
  noteHint,
  notePlaceholder,
  reasonLabel = "사유",
}: {
  idPrefix: string;
  reason: ViolationReason | null;
  note: string;
  onReason: (r: ViolationReason | null) => void;
  onNote: (n: string) => void;
  disabled?: boolean;
  noteHint?: string;
  notePlaceholder?: string;
  reasonLabel?: string;
}) {
  const required = noteRequired(reason);
  const count = charCount(note.trim());
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-reason`} className="text-sm font-semibold text-ink">
          {reasonLabel} <span className="font-normal text-muted">(필수)</span>
        </label>
        <select
          id={`${idPrefix}-reason`}
          value={reason ?? ""}
          disabled={disabled}
          onChange={(e) => onReason(isViolationReason(e.target.value) ? e.target.value : null)}
          className="mt-2 h-12 w-full rounded-xl border border-line bg-white px-3 text-base text-ink"
        >
          <option value="">골라 주세요</option>
          {VIOLATION_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-note`} className="text-sm font-semibold text-ink">
          설명 <span className="font-normal text-muted">{required ? "(기타는 필수)" : "(선택)"}</span>
        </label>
        <Textarea
          id={`${idPrefix}-note`}
          value={note}
          disabled={disabled}
          onChange={(e) => onNote(e.target.value)}
          placeholder={notePlaceholder}
          className="mt-2 min-h-24 text-base"
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-xs">
          <p className={required ? "font-semibold text-warn" : "text-muted"}>{noteHint}</p>
          <p className={`shrink-0 ${count > NOTE_MAX ? "font-semibold text-warn" : "text-muted"}`}>
            {count}/{NOTE_MAX}
          </p>
        </div>
      </div>
    </div>
  );
}
