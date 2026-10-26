import { test } from "node:test";
import assert from "node:assert/strict";
import { closedNotice, isOwnJob } from "./logic.ts";
import type { JobStatus } from "./types.ts";

test("closedNotice: 마감 이유대로 — 인원이 다 차서는 full일 때만", () => {
  assert.equal(closedNotice("full"), "모집 인원이 다 차서 공고가 마감됐어요");
  assert.equal(closedNotice("expired"), "모집 기간이 지나 공고가 마감됐어요");
  assert.equal(closedNotice("closed"), "공고가 마감됐어요");
  assert.equal(closedNotice("open"), null);
  assert.equal(closedNotice("hidden"), null);
  const all: JobStatus[] = ["open", "full", "expired", "closed", "hidden"];
  for (const s of all) if (s !== "full") assert.ok(!(closedNotice(s) ?? "").includes("인원"), s);
});

test("isOwnJob: ownerId가 내 id와 같을 때만(가려진 null·남의 id·비로그인은 아님)", () => {
  assert.equal(isOwnJob({ ownerId: "u1" }, "u1"), true);
  assert.equal(isOwnJob({ ownerId: null }, "u1"), false); // 남의 공고(서버가 가림)
  assert.equal(isOwnJob({ ownerId: "u2" }, "u1"), false); // 관리자가 남의 공고를 볼 때
  assert.equal(isOwnJob({ ownerId: "u1" }, null), false);
  assert.equal(isOwnJob({ ownerId: null }, null), false);
  assert.equal(isOwnJob({ ownerId: "" }, ""), false);
});
