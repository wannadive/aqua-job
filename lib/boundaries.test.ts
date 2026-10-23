// 경계 규칙: 도메인 모듈은 셸(app-shell)을 import하지 않는다.
// 허용: lib/supabase/client, components/ui, components/shared 같은 공용 조각.
// 현재 사용자·역할·콜백은 props(또는 lib/supabase의 도메인 중립 hook)로 받는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const DOMAIN_DIRS = [
  "lib/jobs", "components/jobs",
  "lib/verification", "components/verification",
  "lib/talent-profile", "components/talent-profile",
  "lib/center-listing", "components/center-listing",
  "lib/avatar",
  "lib/notifications",
  "components/centers",
];
const SHELL_DIRS = ["components/app-shell", "lib/app-shell"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function importSpecs(src: string): string[] {
  const specs: string[] = [];
  const re = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) specs.push(m[1]);
  return specs;
}

function toRepoPath(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return relative(ROOT, resolve(dirname(file), spec)).split(sep).join("/");
  return null; // 외부 패키지
}

function isShellPath(p: string): boolean {
  return SHELL_DIRS.some((d) => p === d || p.startsWith(d + "/"))
    // 셸에서 이름만 바뀌어 남을 수 있는 옛 경로도 막는다
    || p === "lib/supabase/auth-provider" || p === "components/app-router";
}

test("도메인 모듈은 app-shell을 import하지 않는다", () => {
  const violations: string[] = [];
  for (const d of DOMAIN_DIRS) {
    for (const file of walk(join(ROOT, d))) {
      const src = readFileSync(file, "utf8");
      for (const spec of importSpecs(src)) {
        const target = toRepoPath(file, spec);
        if (target && isShellPath(target)) {
          violations.push(`${relative(ROOT, file).split(sep).join("/")} -> ${spec}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], "도메인이 셸을 import함:\n" + violations.join("\n"));
});

test("경계 검사 대상 폴더가 실제로 존재한다 (폴더 이름이 바뀌면 검사가 헛돌지 않게)", () => {
  for (const d of [...DOMAIN_DIRS, ...SHELL_DIRS]) {
    assert.ok(existsSync(join(ROOT, d)), `${d} 없음 — boundaries.test.ts 목록을 갱신하세요`);
  }
});
