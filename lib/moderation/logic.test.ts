import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCOUNT_STATUS_LABEL,
  NOTE_MAX,
  REPORT_DONE_TEXT,
  REPORT_STATUS_LABEL,
  TARGET_TYPE_LABEL,
  VIOLATION_REASONS,
  accountActionsFor,
  accountStatusFor,
  adminErrorMessage,
  blockedNotificationKind,
  blockedReasonFromBody,
  canActOnAccount,
  canHideJob,
  canUnhideJob,
  charCount,
  cleanNote,
  confirmText,
  formatKstDateTime,
  isNetworkErrorText,
  memoInputError,
  noteRequired,
  noteVisibilityHint,
  reportErrorMessage,
  unhideDoneText,
  violationInputError,
  violationLabel,
  violationNotice,
} from "./logic.ts";
import { adminReportFromRow } from "./mappers.ts";
import type { ModerationAction } from "./types.ts";

const BANNED = /검증|보증|추천|인증됨/;
const ROOT = resolve(import.meta.dirname, "../..");

test("위반 사유: 011 job_violation_label과 같은 값·이름·순서", () => {
  assert.deepEqual(
    VIOLATION_REASONS.map((r) => [r.value, r.label]),
    [
      ["fake_document", "가짜 서류"],
      ["false_posting", "허위 공고"],
      ["contact_harvesting", "연락처 수집 목적"],
      ["illegal", "불법 행위"],
      ["other", "기타"],
    ],
  );
  // SQL 원문에서도 같은 이름인지 확인(한쪽만 바뀌면 실패)
  const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261029_011_moderation.sql"), "utf8");
  for (const r of VIOLATION_REASONS) assert.ok(sql.includes(`when '${r.value}' then '${r.label}'`), r.value);
  assert.equal(violationLabel("illegal"), "불법 행위");
  assert.equal(violationLabel("nope"), "알 수 없는 사유");
  assert.equal(violationLabel(null), "알 수 없는 사유");
});

test("설명 필수 규칙: 기타만 필수, 500자(코드 포인트)까지, 앞뒤 공백은 지우고 센다", () => {
  assert.equal(noteRequired("other"), true);
  for (const r of VIOLATION_REASONS.filter((x) => x.value !== "other")) assert.equal(noteRequired(r.value), false);
  assert.equal(noteRequired(null), false);

  assert.equal(violationInputError(null, "x"), "사유를 골라 주세요");
  assert.equal(violationInputError("bogus" as never, "x"), "사유를 골라 주세요");
  assert.equal(violationInputError("other", ""), "기타를 고르면 설명을 써 주세요");
  assert.equal(violationInputError("other", "   \n "), "기타를 고르면 설명을 써 주세요");
  assert.equal(violationInputError("other", "연락처만 모으는 글"), null);
  assert.equal(violationInputError("illegal", null), null);
  assert.equal(violationInputError("illegal", "가".repeat(NOTE_MAX)), null);
  assert.equal(violationInputError("illegal", "  " + "가".repeat(NOTE_MAX) + "  "), null);
  assert.equal(violationInputError("illegal", "가".repeat(NOTE_MAX + 1)), "설명은 500자까지 쓸 수 있어요");
  // 이모지는 한 글자(서버 char_length와 같게)
  assert.equal(charCount("😀"), 1);
  assert.equal(violationInputError("other", "😀".repeat(NOTE_MAX)), null);

  assert.equal(cleanNote("  a  "), "a");
  assert.equal(cleanNote("   "), null);
  assert.equal(cleanNote(undefined), null);
  assert.equal(memoInputError(""), null);
  assert.equal(memoInputError("가".repeat(NOTE_MAX + 1)), "메모는 500자까지 쓸 수 있어요");
});

test("당사자에게 보이는 사유 문구: 011 job_violation_notice와 같다", () => {
  assert.equal(violationNotice("false_posting", "내부 메모"), "허위 공고");
  assert.equal(violationNotice("other", "  여러 줄\n\n  설명  "), "기타 · 여러 줄 설명");
  const long = "가".repeat(120);
  assert.equal(violationNotice("other", long), "기타 · " + "가".repeat(80));
  assert.equal(noteVisibilityHint("other"), "당사자에게 보입니다");
  assert.match(noteVisibilityHint("illegal"), /관리자 기록/);
  assert.match(noteVisibilityHint(null), /관리자 기록/);
});

test("신고 오류 → 안내: 24시간 같은 대상 · 하루 20건 · 없음/볼 수 없음 · 비활성 · 입력 · 네트워크", () => {
  assert.match(reportErrorMessage({ code: "22023", message: "이미 신고했어요" }), /24시간에 한 번/);
  assert.match(reportErrorMessage({ code: "22023", message: "신고는 24시간에 20건까지 할 수 있어요" }), /20건까지/);
  const nf = reportErrorMessage({ code: "P0002", message: "신고할 대상을 찾을 수 없어요" });
  assert.match(nf, /찾을 수 없어요/);
  // 코드만 와도 같은 문구(있는지 없는지 구분하지 않는다)
  assert.equal(reportErrorMessage({ code: "P0002", message: "x" }), nf);
  assert.equal(reportErrorMessage({ code: "42501", message: "활성 계정만 신고할 수 있어요" }), "이용이 멈춘 계정은 신고할 수 없어요");
  assert.match(reportErrorMessage({ code: "22023", message: "내 공고·내 계정은 신고할 수 없어요" }), /내 공고/);
  assert.equal(reportErrorMessage({ code: "22023", message: "기타를 고르면 설명을 써 주세요" }), "기타를 고르면 설명을 써 주세요");
  assert.equal(reportErrorMessage({ code: "22023", message: "사유를 목록에서 골라 주세요" }), "사유를 골라 주세요");
  assert.match(reportErrorMessage({ code: "22023", message: "설명은 500자까지 쓸 수 있어요" }), /500자/);
  assert.match(reportErrorMessage({ code: "22023", message: "신고 대상이 올바르지 않아요" }), /다시 시도/);
  assert.match(reportErrorMessage({ message: "TypeError: Failed to fetch" }), /네트워크/);
  assert.match(reportErrorMessage({ message: "AbortError: signal is aborted" }), /네트워크/);
  assert.equal(reportErrorMessage({ code: "42501", message: "permission denied" }), "지금은 신고할 수 없어요. 다시 로그인해 주세요");
  assert.equal(reportErrorMessage({ code: "XX000", message: "boom" }), "잠시 후 다시 시도해 주세요");
});

test("관리자 오류 → 안내: 이미 숨김 · 이미 그 상태 · 이미 처리 · 관리자/나 · 없음 · 권한 · 네트워크", () => {
  assert.match(adminErrorMessage({ code: "22023", message: "이미 숨긴 공고예요" }), /처리 완료/);
  assert.match(adminErrorMessage({ code: "22023", message: "이미 그 상태예요" }), /새로 불러왔어요/);
  assert.match(adminErrorMessage({ code: "22023", message: "이미 처리한 신고예요" }), /다른 관리자/);
  assert.equal(adminErrorMessage({ code: "42501", message: "내 계정은 바꿀 수 없어요" }), "내 계정은 바꿀 수 없어요");
  assert.match(adminErrorMessage({ code: "42501", message: "관리자 계정은 바꿀 수 없어요" }), /관리자 계정/);
  assert.match(adminErrorMessage({ code: "42501", message: "내 공고·관리자 계정의 공고는 숨길 수 없어요" }), /관리자 계정/);
  assert.match(adminErrorMessage({ code: "42501", message: "관리자만 할 수 있어요" }), /다시 로그인/);
  assert.match(adminErrorMessage({ code: "P0002", message: "공고를 찾을 수 없어요" }), /공고를 찾을 수 없어요/);
  assert.match(adminErrorMessage({ code: "P0002", message: "회원을 찾을 수 없어요" }), /회원을/);
  assert.match(adminErrorMessage({ code: "P0002", message: "신고를 찾을 수 없어요" }), /신고를/);
  assert.equal(adminErrorMessage({ code: "22023", message: "기타를 고르면 설명을 써 주세요" }), "기타를 고르면 설명을 써 주세요");
  assert.match(adminErrorMessage({ message: "Load failed" }), /네트워크/);
});

test("확인 창 문구: 퇴출은 하는 일 그대로, 다시 활성은 되돌리지 않는다고, 사유를 주면 당사자 문구", () => {
  const ban = confirmText("ban", { targetName: "바다센터", reason: "illegal" });
  assert.ok(ban.lines.includes("모집 중 공고 숨김 · 남은 지원 미선택 · 보낸/받은 제안 마감 · 계정 차단"));
  assert.ok(ban.lines.includes("당사자에게 보이는 사유: 불법 행위"));
  assert.match(ban.title, /바다센터/);
  assert.equal(ban.confirm, "퇴출");

  const re = confirmText("reactivate", { targetName: "김강사" });
  assert.ok(re.lines.some((l) => l.includes("되돌아오지 않아요")));
  assert.ok(!re.lines.some((l) => l.startsWith("당사자에게 보이는 사유")));

  const hide = confirmText("hide_job", { targetName: "주말 강사", reason: "other", note: "연락처 수집" });
  assert.ok(hide.lines.includes("당사자에게 보이는 사유: 기타 · 연락처 수집"));
  assert.ok(hide.lines.some((l) => l.includes("남은 지원 미선택")));

  const sus = confirmText("suspend");
  assert.ok(sus.lines.some((l) => l.includes("다시 활성")));
  assert.equal(confirmText("resolve").confirm, "처리 완료");
  assert.equal(confirmText("dismiss").confirm, "기각");

  const all: ModerationAction[] = ["hide_job", "unhide_job", "suspend", "ban", "reactivate", "resolve", "dismiss"];
  for (const a of all) {
    const c = confirmText(a, { reason: "other", note: "x" });
    for (const s of [c.title, c.confirm, ...c.lines]) assert.doesNotMatch(s, BANNED);
  }
});

test("버튼 노출: 나 자신·관리자 계정은 숨김, 상태별 계정 조치, 숨김 공고는 숨김 버튼 없음", () => {
  assert.equal(canActOnAccount({ id: "a", roles: ["center"] }, "me"), true);
  assert.equal(canActOnAccount({ id: "me", roles: ["center"] }, "me"), false);
  assert.equal(canActOnAccount({ id: "b", roles: ["instructor", "admin"] }, "me"), false);
  assert.equal(canActOnAccount({ id: null }, "me"), false);
  assert.equal(canActOnAccount({ id: "a" }, null), false);

  assert.deepEqual(accountActionsFor("active"), ["suspend", "ban"]);
  assert.deepEqual(accountActionsFor("suspended"), ["ban", "reactivate"]);
  assert.deepEqual(accountActionsFor("banned"), ["reactivate"]);
  assert.deepEqual(accountActionsFor(null), []);
  assert.equal(accountStatusFor("suspend"), "suspended");
  assert.equal(accountStatusFor("ban"), "banned");
  assert.equal(accountStatusFor("reactivate"), "active");

  assert.equal(canHideJob("open"), true);
  assert.equal(canHideJob("closed"), true);
  assert.equal(canHideJob("hidden"), false);
  assert.equal(canHideJob(null), false);
});

test("차단 화면 사유: 알림 본문 '사유: …'에서 꺼내고, 없으면 null", () => {
  assert.equal(blockedReasonFromBody("사유: 허위 공고"), "허위 공고");
  assert.equal(blockedReasonFromBody("  사유: 기타 · 연락처 수집 목적 글  "), "기타 · 연락처 수집 목적 글");
  assert.equal(blockedReasonFromBody("사유:   "), null);
  assert.equal(blockedReasonFromBody("자세한 내용은 앱에서 확인해 주세요"), null);
  assert.equal(blockedReasonFromBody(""), null);
  assert.equal(blockedReasonFromBody(null), null);
  // 010 aqua_action_reason_text의 머리말과 같은지(서버 문구가 바뀌면 실패)
  const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261028_010_notifications.sql"), "utf8");
  assert.ok(sql.includes("'사유: ' || left("));
  assert.equal(blockedNotificationKind("suspended"), "account_suspended");
  assert.equal(blockedNotificationKind("banned"), "account_banned");
  assert.equal(blockedNotificationKind("active"), null);
});

test("라벨: 한국어, 금지어 없음 · 접수 문구 그대로 · 시각 KST", () => {
  for (const l of [
    ...Object.values(REPORT_STATUS_LABEL),
    ...Object.values(TARGET_TYPE_LABEL),
    ...Object.values(ACCOUNT_STATUS_LABEL),
    ...VIOLATION_REASONS.map((r) => r.label),
    REPORT_DONE_TEXT,
  ]) {
    assert.ok(l.length > 0);
    assert.doesNotMatch(l, BANNED);
  }
  assert.equal(REPORT_DONE_TEXT, "신고가 접수됐어요");
  assert.equal(formatKstDateTime("2026-10-23T15:05:00Z"), "10/24 00:05");
  assert.equal(formatKstDateTime("bad"), "");
  assert.equal(formatKstDateTime(null), "");
});

test("adminReportFromRow: 정상 행 변환, 모르는 값은 버림", () => {
  const row = {
    id: "r1",
    reporter_id: "u1",
    reporter_name: "신고자",
    target_type: "job" as const,
    target_id: "j1",
    target_user_id: "c1",
    target_title: "주말 강사",
    target_center_name: "바다센터",
    target_job_status: "open" as const,
    target_account_status: "active" as const,
    target_is_admin: true,
    target_open_reports: 3,
    reason: "false_posting" as const,
    note: null,
    status: "open" as const,
    created_at: "2026-10-23T00:00:00Z",
    resolved_by: null,
    resolved_at: null,
    resolution: null,
  };
  const r = adminReportFromRow(row);
  assert.ok(r);
  assert.equal(r.targetOpenReports, 3);
  assert.equal(r.targetIsAdmin, true);
  assert.equal(adminReportFromRow({ ...row, target_is_admin: undefined as never })?.targetIsAdmin, false);
  assert.equal(r.targetJobStatus, "open");
  assert.equal(r.reason, "false_posting");
  assert.equal(adminReportFromRow({ ...row, target_type: "x" as never }), null);
  assert.equal(adminReportFromRow({ ...row, reason: "x" as never }), null);
  assert.equal(adminReportFromRow({ ...row, status: "x" as never }), null);
  assert.equal(adminReportFromRow(null), null);
  const odd = adminReportFromRow({ ...row, target_job_status: "weird" as never, target_open_reports: Number.NaN, target_user_id: null });
  assert.ok(odd);
  assert.equal(odd.targetJobStatus, null);
  assert.equal(odd.targetOpenReports, 0);
  assert.equal(odd.targetUserId, null);
});

test("012 후속: 다시 보이기 문구·버튼, 다시 활성 문구는 이전 상태에 따라, 다시 활성 알림 안내", () => {
  const un = confirmText("unhide_job", { targetName: "주말 강사" });
  assert.equal(un.confirm, "다시 보이기");
  assert.ok(un.lines.some((l) => l.includes("모집 중으로") && l.includes("마감으로")));
  assert.ok(un.lines.some((l) => l.includes("되돌아오지 않아요")));
  assert.ok(!un.lines.some((l) => l.startsWith("당사자에게 보이는 사유")));
  // 숨김 문구: 이제 다시 보이기가 있다
  assert.ok(confirmText("hide_job").lines.some((l) => l.includes("[다시 보이기]")));
  assert.ok(!confirmText("hide_job").lines.some((l) => l.includes("아직 없어요")));

  const fromSus = confirmText("reactivate", { fromStatus: "suspended" });
  const fromBan = confirmText("reactivate", { fromStatus: "banned" });
  assert.ok(fromSus.lines.some((l) => l.includes("지운 것은 없어요")));
  assert.ok(!fromSus.lines.some((l) => l.includes("되돌아오지 않아요")));
  assert.ok(fromBan.lines.some((l) => l.includes("되돌아오지 않아요") && l.includes("[다시 보이기]")));
  for (const c of [fromSus, fromBan]) {
    assert.ok(c.lines.includes("당사자에게 '이용이 다시 가능해졌어요' 알림이 가요"));
    assert.ok(!c.lines.some((l) => l.includes("알림이 가지 않아요")));
  }

  assert.equal(canUnhideJob({ status: "hidden", ownerId: "c1" }, "me"), true);
  assert.equal(canUnhideJob({ status: "hidden", ownerId: "me" }, "me"), false);
  assert.equal(canUnhideJob({ status: "hidden", ownerId: "c1", ownerIsAdmin: true }, "me"), false);
  assert.equal(canUnhideJob({ status: "open", ownerId: "c1" }, "me"), false);
  assert.equal(canUnhideJob({ status: "hidden", ownerId: "c1" }, null), false);
  assert.equal(canActOnAccount({ id: "a", isAdmin: true }, "me"), false);
  assert.equal(canActOnAccount({ id: "a", isAdmin: false }, "me"), true);

  assert.match(unhideDoneText("open"), /모집 중/);
  assert.match(unhideDoneText("closed"), /마감/);
  assert.match(adminErrorMessage({ code: "22023", message: "숨긴 공고가 아니에요" }), /이미 보이는 공고/);
  assert.match(
    adminErrorMessage({ code: "42501", message: "공고 주인 계정이 이용 중지 상태예요. 먼저 계정을 다시 활성으로 바꿔 주세요" }),
    /회원 탭/,
  );
  assert.match(adminErrorMessage({ code: "42501", message: "내 공고·관리자 계정의 공고는 다시 보이게 할 수 없어요" }), /관리자 계정/);

  assert.equal(isNetworkErrorText(adminErrorMessage({ message: "Failed to fetch" })), true);
  assert.equal(isNetworkErrorText("이미 처리된 신고예요"), false);
  assert.equal(isNetworkErrorText(null), false);
});

test("012 SQL: 알림 종류·다시 활성 알림·target_is_admin·다시 보이기 함수가 있다", () => {
  const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261030_012_moderation_followups.sql"), "utf8");
  assert.ok(sql.startsWith("-- ⚠️ 아쿠아잡 프로젝트(cmtwlcsqpczuvtpysadi)의 SQL Editor에서 실행"));
  assert.ok(sql.includes("function public.admin_unhide_job(p_job uuid, p_note text default null)"));
  assert.ok(sql.includes("target_is_admin boolean"));
  assert.ok(sql.includes("drop function if exists public.admin_list_reports(text, int, int);"));
  assert.ok(sql.includes("'account_reactivated'"));
  // 조용히 하기에서 다시 활성 알림을 뺀다(011은 다시 활성 때도 quiet_user를 켠다)
  assert.ok(sql.includes("if p_kind not in ('account_suspended', 'account_banned', 'account_reactivated')"));
  // $ 하나짜리가 없다(함수 본문은 $$로만)
  assert.equal(sql.replaceAll("$$", "").includes("$"), false);
});
