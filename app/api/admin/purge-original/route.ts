import { NextResponse } from "next/server";
import { normalizeRoles } from "@/lib/app-shell/account/logic";
import type { AccountRole } from "@/lib/app-shell/account/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperseded, purgeDecision } from "@/lib/verification/admin-logic";
import type { DocType } from "@/lib/verification/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * 신분증의 원본 사진을 지운다. 대상: 확인됨·반려됨, 또는 확인 대기지만 같은 사람이 같은 종류를 더 최근에 다시 올려
 * 밀려난 건. "밀려났는지"는 브라우저 말을 믿지 않고 여기서 DB를 보고 판단한다.
 * 요청자의 access token(Authorization: Bearer)으로 활성 관리자인지 확인한 뒤 service role로 Storage 객체를 지우고
 * documents.file_path를 null로 바꾼다. 이미 비어 있으면 그대로 성공(여러 번 불러도 같은 결과).
 * 응답·로그에 파일 경로나 키를 남기지 않는다.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, { error: "unauthorized" });

  let docId: unknown;
  try {
    docId = ((await req.json()) as { docId?: unknown })?.docId;
  } catch {
    docId = undefined;
  }

  // 키 값은 남기지 않고, 설정이 빠졌다는 사실만 따로 남긴다(배포 환경 변수 누락을 바로 알아보게).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[purge-original] service role not configured");
    return json(500, { error: "server_error" });
  }

  try {
    const sb = createAdminClient();

    const { data: userData, error: userError } = await sb.auth.getUser(token);
    // 서버가 Supabase에 닿지 못한 경우(네트워크·TLS)는 토큰 문제가 아니므로 401로 숨기지 않는다.
    if (userError && (userError.name === "AuthRetryableFetchError" || !userError.status)) {
      console.error("[purge-original] auth server unreachable");
      return json(503, { error: "upstream_unavailable" });
    }
    if (userError || !userData.user) return json(401, { error: "unauthorized" });

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      // roles(003)가 없는 DB에서도 동작하도록 * 로 읽는다. 관리자 = roles에 admin이 있음
      .select("*")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) return json(500, { error: "server_error" });
    const p = profile as { role: AccountRole; roles?: unknown; account_status: string } | null;
    if (!p || !normalizeRoles(p.roles, p.role).includes("admin") || p.account_status !== "active") {
      return json(403, { error: "forbidden" });
    }

    if (typeof docId !== "string" || !UUID_RE.test(docId)) return json(400, { error: "bad_request" });

    const { data: row, error: docError } = await sb
      .from("documents")
      .select("id, owner_id, status, doc_type, file_path, submitted_at")
      .eq("id", docId)
      .maybeSingle();
    if (docError) return json(500, { error: "server_error" });
    const doc = row as
      | { id: string; owner_id: string; status: string; doc_type: string; file_path: string | null; submitted_at: string }
      | null;

    // 확인 대기 건이면 같은 사람·같은 종류에 더 최근 제출이 있는지 직접 본다.
    let superseded = false;
    if (doc && doc.status === "submitted") {
      const { data: sibs, error: sibError } = await sb
        .from("documents")
        .select("id, owner_id, doc_type, submitted_at")
        .eq("owner_id", doc.owner_id)
        .eq("doc_type", doc.doc_type as DocType);
      if (sibError) return json(500, { error: "server_error" });
      superseded = isSuperseded(
        { id: doc.id, ownerId: doc.owner_id, docType: doc.doc_type, submittedAt: doc.submitted_at },
        ((sibs ?? []) as { id: string; owner_id: string; doc_type: string; submitted_at: string }[]).map((r) => ({
          id: r.id,
          ownerId: r.owner_id,
          docType: r.doc_type,
          submittedAt: r.submitted_at,
        })),
      );
    }

    const decision = purgeDecision(doc && { status: doc.status, docType: doc.doc_type, filePath: doc.file_path }, { superseded });
    if (decision === "not_found") return json(404, { error: "not_found" });
    if (decision === "conflict") return json(409, { error: "conflict" });
    if (decision === "already_purged") return json(200, { ok: true });

    const path = doc!.file_path!;
    // 파일이 이미 없어도 remove는 오류 없이 끝난다 → 그다음 file_path만 비운다.
    const { error: removeError } = await sb.storage.from("documents").remove([path]);
    if (removeError) {
      console.error("[purge-original] storage remove failed");
      return json(500, { error: "server_error" });
    }

    const { error: updateError } = await (sb as any)
      .from("documents")
      .update({ file_path: null })
      .eq("id", docId)
      .eq("file_path", path);
    if (updateError) {
      console.error("[purge-original] file_path update failed");
      return json(500, { error: "server_error" });
    }
    return json(200, { ok: true });
  } catch {
    console.error("[purge-original] unexpected failure");
    return json(500, { error: "server_error" });
  }
}
