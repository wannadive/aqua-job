// 알림 화면 표시용 순수 함수(테스트: format.test.ts)

/** 종 배지 글자: 0·모름이면 null(배지 없음), 10개부터 '9+' */
export function formatBadge(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return n > 9 ? "9+" : String(Math.floor(n));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstParts(ms: number): { y: number; m: number; d: number } {
  const k = new Date(ms + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

/**
 * 상대 시간: 방금 / N분 전 / N시간 전 / 어제 / N일 전(7일 미만) / M/D(올해, KST) / YYYY.M.D(다른 해).
 * 미래 시각(기기 시계가 늦을 때)은 '방금'. 읽을 수 없으면 빈 글자.
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (typeof iso !== "string") return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = now.getTime() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const a = kstParts(t);
  const b = kstParts(now.getTime());
  return a.y === b.y ? `${a.m}/${a.d}` : `${a.y}.${a.m}.${a.d}`;
}

/** 종 버튼 읽기 프로그램용 이름 */
export function bellLabel(n: number | null | undefined): string {
  const b = formatBadge(n);
  return b ? `알림, 안 읽은 알림 ${b}개` : "알림";
}

/** 안 읽은 개수 다시 불러오기 간격(화면이 보일 때만) */
export const UNREAD_POLL_MS = 60_000;
/** 포커스·화면 보임 이벤트가 겹쳐 올 때 이 간격 안의 다시 불러오기는 건너뛴다 */
export const UNREAD_MIN_GAP_MS = 5_000;

/** 마지막 요청 시작 시각(lastAt)에서 minGap이 지났는지. force면 항상 true. */
export function shouldRefresh(lastAt: number | null, now: number, minGap: number = UNREAD_MIN_GAP_MS, force = false): boolean {
  if (force || lastAt == null) return true;
  return now - lastAt >= minGap;
}

/** 목록 '더 보기' 한 번에 늘리는 개수와 최대(API 상한 200) */
export const NOTIFICATION_LIST_STEP = 50;
export const NOTIFICATION_LIST_MAX = 200;

export function nextListLimit(current: number): number {
  return Math.min(current + NOTIFICATION_LIST_STEP, NOTIFICATION_LIST_MAX);
}

/** 받은 개수가 요청 개수만큼이면 더 있을 수 있다(최대치면 더 없음) */
export function canLoadMore(received: number, limit: number): boolean {
  return received >= limit && limit < NOTIFICATION_LIST_MAX;
}
