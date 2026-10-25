import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_INSTRUCTOR_FILTERS,
  ACCEPT_CONFIRM,
  OFFER_STATUS_CENTER,
  OFFER_STATUS_INSTRUCTOR,
  buildBrowseFilters,
  canAccept,
  canDecline,
  filledCount,
  initialOf,
  offerErrorMessage,
  offerJobBlock,
  offerLimit,
  offersSentFor,
  receivedGroup,
} from "./logic.ts";
import { browseInstructorFromRow, offerFromRow } from "./mappers.ts";
import type { OfferStatus } from "./types.ts";

const ALL: OfferStatus[] = ["offered", "accepted", "declined", "withdrawn", "expired"];
const BANNED = /검증|보증|추천|인증됨/;

test("상태 라벨: 다섯 상태 모두 한국어, 금지어 없음, 센터에는 거절을 '정중히 거절했어요'로", () => {
  for (const s of ALL) {
    assert.ok(OFFER_STATUS_CENTER[s].label.length > 0);
    assert.ok(OFFER_STATUS_INSTRUCTOR[s].label.length > 0);
    assert.doesNotMatch(OFFER_STATUS_CENTER[s].label, BANNED);
    assert.doesNotMatch(OFFER_STATUS_INSTRUCTOR[s].label, BANNED);
  }
  assert.equal(OFFER_STATUS_CENTER.declined.label, "정중히 거절했어요");
  assert.equal(OFFER_STATUS_CENTER.accepted.tone, "ok");
});

test("수락 확인 창 문구는 그대로", () => {
  assert.equal(ACCEPT_CONFIRM, "수락하면 이 센터에 내 연락처가 열려요");
});

test("offerErrorMessage: 009 서버 오류 → 할 일을 알려 주는 문구", () => {
  assert.equal(
    offerErrorMessage({ code: "23505", message: "이 강사에게는 이 공고로 이미 제안했어요" }),
    "이 강사에게는 이 공고로 이미 제안했어요",
  );
  assert.match(offerErrorMessage({ code: "22023", message: "이 공고로 보낼 수 있는 제안(10건)을 다 보냈어요" }), /10건.*다른 공고/);
  assert.match(offerErrorMessage({ code: "22023", message: "이미 지원한 강사예요" }), /지원자 탭/);
  assert.match(offerErrorMessage({ code: "22023", message: "모집 중인 공고로만 제안할 수 있어요" }), /모집이 끝난/);
  assert.match(offerErrorMessage({ code: "22023", message: "모집 인원이 다 찼어요" }), /다 찼어요/);
  assert.match(offerErrorMessage({ code: "22023", message: "모집이 끝난 공고예요" }), /모집이 끝난/);
  assert.match(offerErrorMessage({ code: "22023", message: "제안할 수 있는 강사가 아니에요" }), /비공개/);
  assert.match(offerErrorMessage({ code: "22023", message: "답을 기다리는 제안만 수락할 수 있어요" }), /이미 답했거나/);
  assert.equal(offerErrorMessage({ code: "P0002", message: "제안을 찾을 수 없어요" }), "찾을 수 없거나 내려간 제안이에요");
  assert.equal(offerErrorMessage({ code: "P0002", message: "공고를 찾을 수 없어요" }), "찾을 수 없거나 내려간 공고예요");
  // 다시 불러오기 전에 "새로 불러왔어요"라고 말하지 않는다
  for (const m of ["모집 중인 공고로만 제안할 수 있어요", "모집 인원이 다 찼어요", "답을 기다리는 제안만 수락할 수 있어요", "공고를 찾을 수 없어요"])
    assert.doesNotMatch(offerErrorMessage({ code: "22023", message: m }), /불러왔어요/);
  assert.equal(
    offerErrorMessage({ code: "42501", message: "제안하려면 아쿠아잡 센터 구독이 필요해요" }),
    "제안하려면 아쿠아잡 센터 구독이 필요해요",
  );
  assert.equal(
    offerErrorMessage({ code: "42501", message: "강사 둘러보기는 아쿠아잡 구독 중인 센터만 쓸 수 있어요" }),
    "강사 둘러보기는 아쿠아잡 구독 중인 센터만 쓸 수 있어요",
  );
  assert.match(offerErrorMessage({ code: "42501", message: "제안에 필요한 서류가 확인된 상태가 아니에요" }), /설정에서 서류/);
  assert.match(offerErrorMessage({ code: "42501", message: "활성 계정만 제안할 수 있어요" }), /이용이 멈춘/);
  assert.match(offerErrorMessage({ message: "TypeError: Failed to fetch" }), /네트워크/);
  assert.match(offerErrorMessage({ message: "AbortError: signal is aborted" }), /네트워크/);
  // 모르는 영어 오류는 기본 문구
  assert.equal(offerErrorMessage({ code: "XX000", message: "boom" }), "잠시 후 다시 시도해 주세요");
  assert.equal(offerErrorMessage(null), "잠시 후 다시 시도해 주세요");
});

test("buildBrowseFilters: 빈 값은 빼고 009가 받는 키만", () => {
  assert.deepEqual(buildBrowseFilters(EMPTY_INSTRUCTOR_FILTERS), {});
  assert.deepEqual(
    buildBrowseFilters({
      regions: ["서울", " ", "부산"],
      org: " AIDA ",
      level: " 4 ",
      scope: "sea",
      availableDays: ["토", "일"],
      verifiedOnly: true,
    }),
    { regions: ["서울", "부산"], org: "AIDA", level: "4", scope: "sea", available_days: ["토", "일"], verified_only: true },
  );
  const keys = Object.keys(
    buildBrowseFilters({ regions: ["a"], org: "x", level: "y", scope: "pool", availableDays: ["월"], verifiedOnly: true }),
  ).sort();
  assert.deepEqual(keys, ["available_days", "level", "org", "regions", "scope", "verified_only"]);
  assert.deepEqual(buildBrowseFilters({ ...EMPTY_INSTRUCTOR_FILTERS, verifiedOnly: false, level: "  " }), {});
});

test("filledCount: 서버 남은 자리 기준(선택 + 수락한 제안)", () => {
  assert.equal(filledCount({ headcount: 3, remaining: 3 }), 0);
  assert.equal(filledCount({ headcount: 3, remaining: 1 }), 2);
  assert.equal(filledCount({ headcount: 3, remaining: 0 }), 3);
  assert.equal(filledCount({ headcount: 2, remaining: -1 }), 2);
});

test("offerLimit·offersSentFor", () => {
  assert.equal(offerLimit(1), 5);
  assert.equal(offerLimit(3), 15);
  assert.equal(offersSentFor([{ jobId: "a" }, { jobId: "b" }, { jobId: "a" }], "a"), 2);
});

test("offerJobBlock: 모집 중 아님 > 이미 제안 > 이미 지원 > 한도", () => {
  const job = { id: "j", status: "open" as const, headcount: 1 };
  assert.equal(offerJobBlock(job, "i", [], []), null);
  assert.equal(offerJobBlock({ ...job, status: "full" }, "i", [], []), "not_open");
  assert.equal(offerJobBlock(job, "i", [{ jobId: "j", instructorId: "i" }], []), "already_offered");
  assert.equal(offerJobBlock(job, "i", [], [{ jobId: "j", instructorId: "i", status: "applied" }]), "already_applied");
  assert.equal(offerJobBlock(job, "i", [], [{ jobId: "j", instructorId: "i", status: "withdrawn" }]), null);
  const five = Array.from({ length: 5 }, (_, n) => ({ jobId: "j", instructorId: `x${n}` }));
  assert.equal(offerJobBlock(job, "i", five, []), "limit");
  assert.equal(offerJobBlock({ ...job, headcount: 2 }, "i", five, []), null);
});

test("canAccept·canDecline·receivedGroup", () => {
  const open = { status: "open" as const };
  assert.equal(canAccept({ status: "offered", job: open }), true);
  assert.equal(canAccept({ status: "offered", job: { status: "full" } }), false);
  assert.equal(canAccept({ status: "offered", job: null }), false);
  assert.equal(canAccept({ status: "accepted", job: open }), false);
  assert.equal(canDecline({ status: "offered" }), true);
  for (const s of ["accepted", "declined", "withdrawn", "expired"] as OfferStatus[]) assert.equal(canDecline({ status: s }), false);
  assert.equal(receivedGroup({ status: "offered" }), "pending");
  assert.equal(receivedGroup({ status: "accepted" }), "accepted");
  for (const s of ["declined", "withdrawn", "expired"] as OfferStatus[]) assert.equal(receivedGroup({ status: s }), "past");
});

test("initialOf", () => {
  assert.equal(initialOf("김바다"), "김");
  assert.equal(initialOf("  alex "), "A");
  assert.equal(initialOf(""), "?");
  assert.equal(initialOf(null), "?");
});

test("mappers: offerFromRow 이름 조인, browseInstructorFromRow 서류 사실·기록", () => {
  const o = offerFromRow({
    id: "o1", job_id: "j", center_id: "c", instructor_id: "i", message: null, status: "offered",
    created_at: "2026-10-23T00:00:00Z", responded_at: null, profiles: { display_name: "김바다" },
  });
  assert.equal(o.instructorName, "김바다");
  assert.equal(offerFromRow({ id: "o2", job_id: "j", instructor_id: "i", status: "declined", created_at: "x" }).instructorName, null);

  const b = browseInstructorFromRow({
    user_id: "u1", display_name: "김바다", photo_path: null, regions: ["서울"], scopes: ["pool"],
    certifications: [{ org: "AIDA", level: "4" }], teaching_style_tags: ["꼼꼼한"], available_days: ["토"],
    records: { sta_sec: 300, dyn_m: 100 },
    facts: [{ doc_type: "instructor_cert", valid_until: "2027-03-31", org: "AIDA", grade: "강사" }],
  });
  assert.equal(b.userId, "u1");
  assert.deepEqual(b.records, { staSec: 300, dynM: 100 });
  assert.equal(b.facts.length, 1);
  assert.equal(b.facts[0].status, "verified");
  assert.equal(b.facts[0].meta.org, "AIDA");
  // 연락처 칸은 서버가 주지 않고 매퍼도 만들지 않는다
  assert.equal("phone" in b, false);
  assert.equal("email" in b, false);
});

test("offerLoadState: 실패가 먼저, 그다음 읽는 중, 다 읽으면 null", async () => {
  const { offerLoadState, OFFER_LOAD_NOTE } = await import("./logic.ts");
  const base = { jobsLoading: false, jobsError: false, offersLoading: false, offersError: false };
  assert.equal(offerLoadState(base), null);
  assert.equal(offerLoadState({ ...base, offersLoading: true }), "loading");
  assert.equal(offerLoadState({ ...base, jobsLoading: true }), "loading");
  assert.equal(offerLoadState({ ...base, offersError: true }), "error");
  assert.equal(offerLoadState({ ...base, jobsError: true, offersLoading: true }), "error");
  assert.ok(!OFFER_LOAD_NOTE.loading.includes("못"));
  assert.ok(OFFER_LOAD_NOTE.error.includes("불러오지 못해"));
});
