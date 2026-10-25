import { test } from "node:test";
import assert from "node:assert/strict";
import { CERT_LEVEL_OTHER, CERT_LEVELS, CERT_ORG_OPTIONS } from "./config.ts";
import { canonicalCertOrg, certLevelChoice, certLevelOptions, formatCert, isCertLevelTyping, levelAfterOrgPick } from "./logic.ts";
import { buildBrowseFilters } from "../offers/logic.ts";
import { EMPTY_INSTRUCTOR_FILTERS } from "../offers/logic.ts";

// 서버 browse_instructors(009)의 비교: lower(btrim(저장값)) = lower(btrim(필터값))
const serverMatch = (stored: string, filter: string) => stored.trim().toLowerCase() === filter.trim().toLowerCase();

test("등급 목록: 모든 단체에 목록이 있고(기타만 빈 목록), 앞뒤 공백 없음, 단체 안에서 대소문자 무시 중복 없음", () => {
  for (const org of CERT_ORG_OPTIONS) {
    const levels = CERT_LEVELS[org];
    assert.ok(Array.isArray(levels), org);
    if (org === "기타") assert.equal(levels.length, 0);
    else assert.ok(levels.length > 0, org);
    for (const l of levels) {
      assert.equal(l, l.trim(), `${org} ${l}`);
      assert.notEqual(l, CERT_LEVEL_OTHER);
    }
    const keys = levels.map((l) => l.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, org);
  }
});

test("이력서에 고른 값 그대로 저장 → 필터에서 같은 목록 값을 고르면 서버 비교로 찾힌다", () => {
  for (const org of CERT_ORG_OPTIONS) {
    for (const level of certLevelOptions(org)) {
      const stored = { org, level }; // 이력서 칸이 저장하는 모양(Certification)
      const f = buildBrowseFilters({ ...EMPTY_INSTRUCTOR_FILTERS, org, level });
      assert.equal(f.org, org);
      assert.equal(f.level, level);
      assert.ok(serverMatch(stored.org, f.org as string));
      assert.ok(serverMatch(stored.level, f.level as string));
      // 다른 단체 이름과는 안 맞는다
      for (const other of CERT_ORG_OPTIONS) if (other !== org) assert.ok(!serverMatch(stored.org, other));
    }
  }
});

test("단체 이름: 대소문자·공백 무시로 목록 단체, 모르는 단체는 null(등급 직접 입력)", () => {
  assert.equal(canonicalCertOrg(" aida "), "AIDA");
  assert.equal(canonicalCertOrg("molchanovs"), "Molchanovs");
  assert.equal(canonicalCertOrg("Apnea Academy"), null);
  assert.equal(canonicalCertOrg(""), null);
  assert.deepEqual(certLevelOptions("기타"), []);
  assert.deepEqual(certLevelOptions("Apnea Academy"), []);
  assert.deepEqual(certLevelOptions(null), []);
});

test("예전 값 → 칸: 목록에 있으면(대소문자 달라도) 그 등급, 없으면 기타(직접 입력)에 글자 그대로", () => {
  assert.deepEqual(certLevelChoice("AIDA", ""), { kind: "none" });
  assert.deepEqual(certLevelChoice("AIDA", "   "), { kind: "none" });
  assert.deepEqual(certLevelChoice("AIDA", "AIDA2"), { kind: "list", value: "AIDA2" });
  assert.deepEqual(certLevelChoice("aida", " aida2 "), { kind: "list", value: "AIDA2" });
  // 목록 값으로 맞춘 결과도 서버 비교로는 저장된 글자와 같다
  assert.ok(serverMatch(" aida2 ", "AIDA2"));
  assert.deepEqual(certLevelChoice("AIDA", "강사 트레이너"), { kind: "other", text: "강사 트레이너" });
  assert.deepEqual(certLevelChoice("PADI", "AIDA2"), { kind: "other", text: "AIDA2" }); // 다른 단체 등급은 목록 아님
  assert.deepEqual(certLevelChoice("기타", "Level 1"), { kind: "other", text: "Level 1" });
  assert.deepEqual(certLevelChoice("", "강사"), { kind: "other", text: "강사" });
});

test("formatCert: 등급이 단체 이름으로 시작하면 한 번만", () => {
  assert.equal(formatCert({ org: "AIDA", level: "AIDA2" }), "AIDA2");
  assert.equal(formatCert({ org: "AIDA", level: "Instructor" }), "AIDA Instructor");
  assert.equal(formatCert({ org: "SSI", level: "" }), "SSI");
  assert.equal(formatCert({ org: "", level: "강사" }), "강사");
  assert.equal(formatCert({ org: "기타", level: "Apnea Academy 강사" }), "Apnea Academy 강사");
  assert.equal(formatCert({ org: "기타", level: "" }), "기타");
});

test("isCertLevelTyping: 직접 입력 중엔 글자가 목록 값과 같아지거나 비어도 칸 유지", () => {
  // (a) 기타(직접 입력)에서 "Instructor (pool)"을 적는 도중 "Instructor"가 돼도
  assert.equal(isCertLevelTyping("AIDA", "Instructor", true), true);
  // (b) 예전 값 "강사 트레이너"를 다 지워도(입력하면 otherOpen이 켜진다)
  assert.equal(isCertLevelTyping("AIDA", "", true), true);
  // 목록에 없는 예전 값은 처음부터 직접 입력
  assert.equal(isCertLevelTyping("AIDA", "강사 트레이너", false), true);
  // 목록에서 고른 값·빈 칸은 직접 입력 아님
  assert.equal(isCertLevelTyping("AIDA", "Instructor", false), false);
  assert.equal(isCertLevelTyping("AIDA", "", false), false);
  // 목록 없는 단체는 늘 직접 입력
  assert.equal(isCertLevelTyping("기타", "", false), true);
  assert.equal(isCertLevelTyping("", "", false), true);
});

test("levelAfterOrgPick: 단체 없던 예전 줄은 등급을 지키고, 단체를 바꾸면 초기화", () => {
  assert.deepEqual(levelAfterOrgPick("", "aida2", "AIDA"), { level: "aida2", otherOpen: false });
  assert.deepEqual(levelAfterOrgPick("", "강사", "AIDA"), { level: "강사", otherOpen: true });
  assert.deepEqual(levelAfterOrgPick("", "", "AIDA"), { level: "", otherOpen: false });
  assert.deepEqual(levelAfterOrgPick("AIDA", "Instructor", "PADI"), { level: "", otherOpen: false });
});
