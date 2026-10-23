import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REGION_OPTIONS } from "../talent-profile/config.ts";

// 공고 지역 목록은 DB(job_region_options, 007~)와 TS(REGION_OPTIONS) 두 곳에 있다.
// 가장 최근 마이그레이션의 정의를 읽어 TS 목록과 같은지 확인한다 — 한쪽만 고치면 여기서 실패한다.
test("지역 목록: DB job_region_options()와 REGION_OPTIONS가 같다", () => {
  const dir = join("supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let body: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const m = sql.match(/function public\.job_region_options\(\)[\s\S]*?array\[([^\]]*)\]/);
    if (m) body = m[1];
  }
  assert.ok(body, "job_region_options 정의를 찾지 못했어요");
  const dbList = [...body.matchAll(/'([^']*)'/g)].map((x) => x[1]);
  assert.deepEqual(dbList, [...REGION_OPTIONS]);
});
