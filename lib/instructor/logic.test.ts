import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRecords, parseMeterInput, parseStaInput, resumeCompleteness } from "./logic.ts";
import { fromRow, toRow } from "./mappers.ts";

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

test("parseStaInput 상한 15:00", () => {
  assert.equal(parseStaInput("15:00"), 900);
  assert.equal(parseStaInput("15:01"), null);
  assert.equal(parseStaInput("9999"), null);
});
test("parseMeterInput", () => {
  assert.equal(parseMeterInput("150"), 150);
  assert.equal(parseMeterInput("150m"), 150);
  assert.equal(parseMeterInput("300"), 300);
  assert.equal(parseMeterInput("301"), null);
  assert.equal(parseMeterInput("abc"), null);
  assert.equal(parseMeterInput(""), null);
});
test("records 왕복: toRow → fromRow", () => {
  const row = toRow({ records: { staSec: 312, dynM: 150 } });
  assert.deepEqual(row.records, { sta_sec: 312, dyn_m: 150 });
  const p = fromRow({ user_id: "u", records: row.records });
  assert.deepEqual(p.records, { staSec: 312, dynM: 150 });
});
test("toRow: 빈 자격 행 제외, userId 제외, snake_case", () => {
  const row = toRow({
    userId: "x",
    ageBand: "30대",
    certifications: [{ org: "", level: " " }, { org: "AIDA", level: "" }, { org: "", level: "강사" }],
  });
  assert.equal("user_id" in row, false);
  assert.equal(row.age_band, "30대");
  assert.deepEqual(row.certifications, [{ org: "AIDA", level: "" }, { org: "", level: "강사" }]);
});
test("fromRow: 빈 값 기본값", () => {
  const p = fromRow({ user_id: "u" });
  assert.deepEqual(p.regions, []);
  assert.deepEqual(p.certifications, []);
  assert.equal(p.isPublic, true);
  assert.equal(p.onboardingDone, false);
});
test("resumeCompleteness done/total", () => {
  const empty = resumeCompleteness({} as any);
  assert.equal(empty.done, 0);
  assert.equal(empty.total, 9);
  assert.equal(empty.missing.length, 9);
  const full = resumeCompleteness({
    gender: "여", ageBand: "30대", regions: ["서울"], scopes: ["pool"], certifications: [{ org: "AIDA", level: "2" }],
    instructorYears: 0, intro: "안녕", availableDays: ["월"], photoPath: "u/a.jpg",
  } as any);
  assert.equal(full.done, 9);
  assert.deepEqual(full.missing, []);
});
