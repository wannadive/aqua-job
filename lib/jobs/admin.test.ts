import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAdminJobRows, filterAdminJobs } from "./admin.ts";

const post = (o: Record<string, unknown>) => ({
  id: "j1", owner_id: "o", center_id: "c1", job_type: "affiliation", title: "공고", region: "서울",
  headcount: 2, deadline: "2026-12-31", status: "open", closed_reason: null, view_count: 3,
  created_at: "2026-10-20T00:00:00Z", edited_at: null, work_days: [], requirement_tags: [], ...o,
});

test("buildAdminJobRows: 지원 수(취소 제외)·선택 수·센터명·최신순", () => {
  const rows = buildAdminJobRows(
    [post({ id: "a", created_at: "2026-10-01T00:00:00Z" }), post({ id: "b", created_at: "2026-10-05T00:00:00Z", center_id: "zz" })],
    [
      { job_id: "a", status: "applied" },
      { job_id: "a", status: "selected" },
      { job_id: "a", status: "withdrawn" },
    ],
    [{ id: "c1", name: "워너다이브" }],
    "2026-10-23",
  );
  assert.deepEqual(rows.map((r) => r.job.id), ["b", "a"]);
  const a = rows[1];
  assert.equal(a.applied, 2);
  assert.equal(a.selected, 1);
  assert.equal(a.job.remaining, 1);
  assert.equal(a.job.centerName, "워너다이브");
  assert.equal(rows[0].job.centerName, "센터");
});

test("buildAdminJobRows: 유효 상태(기간 지남·정원 참·숨김)와 필터", () => {
  const rows = buildAdminJobRows(
    [post({ id: "x", deadline: "2026-10-01" }), post({ id: "y", headcount: 1 }), post({ id: "h", status: "hidden" }), post({ id: "o" })],
    [{ job_id: "y", status: "selected" }],
    [],
    "2026-10-23",
  );
  const st = Object.fromEntries(rows.map((r) => [r.job.id, r.job.status]));
  assert.deepEqual(st, { x: "expired", y: "full", h: "hidden", o: "open" });
  assert.equal(filterAdminJobs(rows, "all").length, 4);
  assert.deepEqual(filterAdminJobs(rows, "open").map((r) => r.job.id), ["o"]);
  assert.equal(filterAdminJobs(rows, "closed").length, 3);
});

test("buildAdminJobRows: 수락한 제안도 인원에 센다(009)", () => {
  const rows = buildAdminJobRows(
    [post({ id: "a", headcount: 2 }), post({ id: "b", headcount: 3 })],
    [{ job_id: "a", status: "selected" }],
    [],
    "2026-10-23",
    [
      { job_id: "a", status: "accepted" },
      { job_id: "b", status: "accepted" },
      { job_id: "b", status: "offered" },
      { job_id: "b", status: "declined" },
    ],
  );
  const a = rows.find((r) => r.job.id === "a")!;
  const b = rows.find((r) => r.job.id === "b")!;
  assert.equal(a.acceptedOffers, 1);
  assert.equal(a.job.status, "full");
  assert.equal(a.job.remaining, 0);
  assert.equal(b.acceptedOffers, 1);
  assert.equal(b.job.remaining, 2);
  assert.equal(b.job.status, "open");
});
