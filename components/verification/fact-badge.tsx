import { displayStatus, factLabel } from "@/lib/verification/logic";
import type { DocDisplayStatus, DocRecord } from "@/lib/verification/types";

const TONE: Record<DocDisplayStatus, string> = {
  missing: "bg-surface text-muted",
  submitted: "bg-surface text-muted",
  verified: "bg-ok-bg text-ok",
  expiring: "bg-warn-bg text-warn",
  expired: "bg-warn-bg text-warn",
  rejected: "bg-destructive/10 text-destructive",
};

/** 서류 상태를 사실 문구로만 보여 주는 꼬리표. */
export function FactBadge({ doc, today }: { doc: DocRecord; today: string }) {
  const st = displayStatus(doc, today);
  return <span className={`inline-block rounded-full px-3 py-1.5 text-sm font-medium ${TONE[st]}`}>{factLabel(doc, today)}</span>;
}
