import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRecords, parseStaInput, resumeCompleteness } from "./logic.ts";

test("formatRecords 순서 STA→DYN→CWT→FIM, 빈 값 제외", () => {
  assert.deepEqual(formatRecords({ cwtM: 42, staSec: 312, fimM: undefined, dynM: 150 }),
    [{ label: "STA", value: "5:12" }, { label: "DYN", value: "150m" }, { label: "CWT", value: "42m" }]);
});
test("parseStaInput", () => {
  assert.equal(parseStaInput("5:12"), 312);
  assert.equal(parseStaInput("312"), 312);
  assert.equal(parseStaInput("5:75"), null);
  assert.equal(parseStaInput(""), null);
});
test("resumeCompleteness: 필수 항목만 센다", () => {
  const r = resumeCompleteness({ gender: "여", regions: [], certifications: [] } as any);
  assert.ok(r.missing.includes("활동 지역"));
});
