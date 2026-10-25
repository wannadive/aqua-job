/**
 * 작성 중(dirty) 판정 — 처음 값과 지금 값이 의미 있게 다른지. 순수 함수(테스트: dirty.test.ts).
 * - 글자는 앞뒤 공백을 빼고 비교한다(공백만 쳤다 지운 건 바뀐 게 아님).
 * - 빈 값끼리(null · undefined · 빈 글자 · 공백만)는 같다고 본다.
 * - 배열은 순서까지, 객체는 키 전부(한쪽에만 있는 키는 빈 값과 비교).
 * - 파일·Blob 등 그 밖의 객체는 같은 것인지(===)만 본다.
 */

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameValue(x, b[i]));
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameValue(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/** 처음 값에서 바뀐 것이 있으면 true */
export function isDirty(initial: unknown, current: unknown): boolean {
  return !sameValue(initial, current);
}

/** 객체에서 몇 개 키만(작성 단계마다 그 단계 칸만 비교할 때) */
export function pick<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}
