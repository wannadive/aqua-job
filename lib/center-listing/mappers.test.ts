import { test } from "node:test";
import assert from "node:assert/strict";
import { centerFromRow, centerToRow } from "./mappers.ts";

test("centerFromRow: 빈 행도 기본값으로 채운다", () => {
  const c = centerFromRow({ user_id: "u" });
  assert.equal(c.centerName, null);
  assert.deepEqual(c.venues, []);
  assert.deepEqual(c.photoPaths, []);
});

test("centerToRow: 컬럼 이름으로 바꾸고 빈 글자는 null", () => {
  assert.deepEqual(centerToRow({ centerName: " ", monthlyStudents: 20, teachingDays: ["월"], userId: "x" }), {
    center_name: null, monthly_students: 20, teaching_days: ["월"],
  });
});
