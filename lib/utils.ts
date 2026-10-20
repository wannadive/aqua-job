import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 로컬 날짜를 YYYY-MM-DD 형식으로 반환 (UTC 대신 로컬 시간대 사용) */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 예약 가능한 마지막 날짜(YYYY-MM-DD) — 다음 달 말일.
 * 교육 예약은 1개월 단위로 받으므로, "현재 월 + 다음 월"까지만 예약 가능.
 * 예) 6월이면 7/31까지, 7월 1일이 되면 8/31까지 열림.
 */
export function getMaxBookableDate(date: Date = new Date()): string {
  // 다다음 달 0일 = 다음 달 말일
  const last = new Date(date.getFullYear(), date.getMonth() + 2, 0);
  return getLocalDateString(last);
}

/** 해당 날짜(YYYY-MM-DD)가 예약 가능 기간(다음 달 말일 이내)인지 */
export function isWithinBookingWindow(targetDate: string, date: Date = new Date()): boolean {
  if (!targetDate) return true;
  return targetDate <= getMaxBookableDate(date);
}
