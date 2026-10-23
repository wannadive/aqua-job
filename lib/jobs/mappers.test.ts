import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationFromRow,
  centerPublicProfileFromRow,
  jobDetailFromRow,
  jobSummaryFromRow,
  publicFactToDoc,
} from "./mappers.ts";
import { publicFacts } from "../verification/effective.ts";

const row = {
  id: "j1",
  owner_id: "o1",
  center_id: "c1",
  center_name: "블루센터",
  job_type: "lesson",
  title: "토요 수업",
  region: "서울",
  venue: "잠실",
  class_date: "2026-11-07",
  start_time: "09:00:00",
  end_time: "13:00:00",
  work_days: null,
  work_time: null,
  tour_start: null,
  tour_end: null,
  destination: null,
  destination_kind: null,
  covers_flight: null,
  covers_lodging: null,
  pay_amount: 120000,
  pay_unit: "per_class",
  headcount: 2,
  remaining: 1,
  requirement_tags: ["레스큐 가능"],
  deadline: "2026-11-05",
  view_count: 7,
  created_at: "2026-10-21T03:00:00Z",
  edited_at: null,
  effective_status: "open",
};

test("jobSummaryFromRow", () => {
  const s = jobSummaryFromRow(row);
  assert.equal(s.centerId, "c1");
  assert.equal(s.centerName, "블루센터");
  assert.equal(s.jobType, "lesson");
  assert.equal(s.startTime, "09:00");
  assert.equal(s.endTime, "13:00");
  assert.deepEqual(s.workDays, []);
  assert.equal(s.payAmount, 120000);
  assert.equal(s.payUnit, "per_class");
  assert.equal(s.remaining, 1);
  assert.equal(s.viewCount, 7);
  assert.equal(s.editedAt, null);
  assert.equal(s.status, "open");
});

test("jobSummaryFromRow: 단가 없음", () => {
  const s = jobSummaryFromRow({ ...row, pay_amount: null, pay_unit: null });
  assert.equal(s.payAmount, null);
  assert.equal(s.payUnit, null);
});

test("jobDetailFromRow: 센터 상세 JSON", () => {
  const d = jobDetailFromRow({
    ...row,
    description: "설명",
    center: {
      center_name: "블루센터",
      representative_name: "홍길동",
      head_instructor: null,
      instructor_count: 3,
      instructor_names: ["가", "나"],
      monthly_students: 40,
      teaching_days: ["토"],
      teaching_time: "오전",
      venues: ["잠실"],
      address: "서울",
      photo_paths: [],
    },
  });
  assert.equal(d.description, "설명");
  assert.equal(d.center.representativeName, "홍길동");
  assert.equal(d.center.instructorCount, 3);
  assert.deepEqual(d.center.instructorNames, ["가", "나"]);
  assert.equal(d.center.headInstructor, null);
});

test("jobDetailFromRow: center가 비어도 깨지지 않는다", () => {
  const d = jobDetailFromRow({ ...row, description: "x", center: null });
  assert.equal(d.center.centerName, "블루센터");
  assert.deepEqual(d.center.venues, []);
});

test("applicationFromRow", () => {
  const a = applicationFromRow({
    id: "a1",
    job_id: "j1",
    instructor_id: "u1",
    message: null,
    status: "applied",
    created_at: "2026-10-21T00:00:00Z",
    decided_at: null,
    profiles: { display_name: "김강사" },
  });
  assert.equal(a.jobId, "j1");
  assert.equal(a.status, "applied");
  assert.equal(a.applicantName, "김강사");
  assert.equal(applicationFromRow({ ...{ id: "a", job_id: "j", instructor_id: "u", status: "selected", created_at: "x" } }).applicantName, null);
});

test("centerPublicProfileFromRow: 가려진 칸은 null/빈 배열", () => {
  const c = centerPublicProfileFromRow({
    center_id: "c1",
    user_id: "o1",
    center_name: "블루센터",
    venues: ["잠실"],
    teaching_days: [],
    teaching_time: null,
    photo_paths: [],
    detail_visible: false,
    representative_name: null,
    instructor_names: null,
  });
  assert.equal(c.centerId, "c1");
  assert.equal(c.userId, "o1");
  assert.equal(c.detailVisible, false);
  assert.equal(c.representativeName, null);
  assert.deepEqual(c.instructorNames, []);
});

test("publicFactToDoc → publicFacts 라벨", () => {
  const doc = publicFactToDoc(
    { doc_type: "instructor_cert", valid_until: "2027-03-31", verified_at: "2026-10-01T00:00:00Z", org: "AIDA", grade: "강사" },
    "u1",
  );
  const facts = publicFacts([doc], "2026-10-22");
  assert.equal(facts.length, 1);
  assert.equal(facts[0].label, "AIDA 강사 자격증 · 2027.03까지");
});
