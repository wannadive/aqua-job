import type { ReactNode } from "react";

/**
 * 잠금 자리. 실제 내용은 받지 않는다(서버가 주지 않은 값은 그릴 수 없다) — 자리 모양만 보여 준다.
 * action이 있으면 꼬리표가 눌러 열린다(가입 화면 등).
 */
export function LockedField({
  label,
  tag,
  onAction,
  lines = 3,
}: {
  label: string;
  /** `가입하고 보기` | `구독하고 보기` */
  tag: string;
  onAction?: () => void;
  lines?: number;
}) {
  const tagEl: ReactNode = onAction ? (
    <button type="button" onClick={onAction} className="rounded-full bg-warn-bg px-3 py-1.5 text-xs font-semibold text-warn">
      {tag}
    </button>
  ) : (
    <span className="rounded-full bg-warn-bg px-3 py-1.5 text-xs font-semibold text-warn">{tag}</span>
  );
  return (
    <section className="rounded-card bg-white p-5 shadow-sm" aria-label={`${label} (잠김)`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{label}</h2>
        {tagEl}
      </div>
      <div className="mt-3 space-y-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-3 rounded-full bg-surface" style={{ width: `${92 - i * 14}%` }} />
        ))}
      </div>
    </section>
  );
}
