import type { DocRecord, DocReviewStatus, DocType } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function docFromRow(row: any): DocRecord {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    id: row.id,
    ownerId: row.owner_id,
    docType: row.doc_type as DocType,
    status: row.status as DocReviewStatus,
    validUntil: row.valid_until ?? null,
    meta: {
      ...(typeof meta.org === "string" ? { org: meta.org } : {}),
      ...(typeof meta.grade === "string" ? { grade: meta.grade } : {}),
      ...(typeof meta.number === "string" ? { number: meta.number } : {}),
    },
    rejectReason: row.reject_reason ?? null,
    submittedAt: row.submitted_at,
    verifiedAt: row.verified_at ?? null,
  };
}
