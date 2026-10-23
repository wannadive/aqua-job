"use client";

import { JOB_TYPES } from "@/lib/jobs/config";
import type { JobType } from "@/lib/jobs/types";
import { REGION_OPTIONS } from "@/lib/talent-profile/config";

export interface JobFilterState {
  type: JobType | null;
  region: string | null;
  paidOnly: boolean;
}

export const EMPTY_FILTERS: JobFilterState = { type: null, region: null, paidOnly: false };

const TYPE_CHIPS: { key: JobType | null; label: string }[] = [
  { key: null, label: "전체" },
  { key: "lesson", label: JOB_TYPES.lesson.short },
  { key: "affiliation", label: JOB_TYPES.affiliation.short },
  { key: "tour", label: JOB_TYPES.tour.short },
];

export function JobFilters({ value, onChange }: { value: JobFilterState; onChange: (v: JobFilterState) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="공고 종류">
        {TYPE_CHIPS.map((c) => {
          const on = value.type === c.key;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...value, type: c.key })}
              className={`h-11 rounded-full px-5 text-sm font-semibold ${on ? "bg-ink text-white" : "bg-white text-ink shadow-sm"}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <select
          aria-label="지역"
          value={value.region ?? ""}
          onChange={(e) => onChange({ ...value, region: e.target.value || null })}
          className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink"
        >
          <option value="">전체 지역</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={value.paidOnly}
            onChange={(e) => onChange({ ...value, paidOnly: e.target.checked })}
            className="size-5 accent-[#0AA88E]"
          />
          단가 공개 공고만
        </label>
      </div>
    </div>
  );
}
