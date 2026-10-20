import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeDecision } from "@/lib/verification/admin-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * 확인된 신분증의 원본 사진을 지운다.
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
      .select("role, account_status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) return json(500, { error: "server_error" });
    const p = profile as { role: string; account_status: string } | null;
    if (!p || p.role !== "admin" || p.account_status !== "active") return json(403, { error: "forbidden" });

    if (typeof docId !== "string" || !UUID_RE.test(docId)) return json(400, { error: "bad_request" });

    const { data: row, error: docError } = await sb
      .from("documents")
      .select("status, doc_type, file_path")
      .eq("id", docId)
      .maybeSingle();
    if (docError) return json(500, { error: "server_error" });
    const doc = row as { status: string; doc_type: string; file_path: string | null } | null;

    const decision = purgeDecision(doc && { status: doc.status, docType: doc.doc_type, filePath: doc.file_path });
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
