import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTIFICATION_KINDS } from "./config.ts";
import { DOC_TYPES } from "../verification/config.ts";

// DB와 TS 두 곳에 있는 목록: 가장 최근 마이그레이션의 정의를 읽어 비교한다 — 한쪽만 고치면 여기서 실패한다.
function latestMatch(re: RegExp): string | null {
  const dir = join("supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let found: string | null = null;
  for (const f of files) {
    const m = readFileSync(join(dir, f), "utf8").match(re);
    if (m) found = m[1];
  }
  return found;
}

test("알림 종류: DB aqua_notifications_kind_check와 NOTIFICATION_KINDS가 같다", () => {
  const body = latestMatch(/add constraint aqua_notifications_kind_check check \(kind in \(([^)]*)\)/);
  assert.ok(body, "aqua_notifications_kind_check 정의를 찾지 못했어요");
  const dbList = [...body.matchAll(/'([^']*)'/g)].map((x) => x[1]);
  assert.deepEqual(dbList, [...NOTIFICATION_KINDS]);
});

test("서류 이름: DB aqua_doc_label()과 DOC_TYPES label이 같다", () => {
  const body = latestMatch(/function public\.aqua_doc_label\(p_doc_type text\)[\s\S]*?case p_doc_type([\s\S]*?)else/);
  assert.ok(body, "aqua_doc_label 정의를 찾지 못했어요");
  const dbMap = Object.fromEntries([...body.matchAll(/when '([^']*)' then '([^']*)'/g)].map((x) => [x[1], x[2]]));
  const tsMap = Object.fromEntries(Object.entries(DOC_TYPES).map(([k, v]) => [k, v.label]));
  assert.deepEqual(dbMap, tsMap);
});
