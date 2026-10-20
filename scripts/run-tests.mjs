// "node --test lib/**/*.test.ts" 글롭이 Windows·sh에서 다르게 동작하고, 테스트 0개일 때 실패하므로
// *.test.ts 파일을 직접 찾아 실행한다. 테스트가 없으면 0으로 종료.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const files = walk("lib");
if (files.length === 0) {
  console.log("테스트 파일 없음 (0개) — 통과");
  process.exit(0);
}
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
