"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** 알림에서 넘어온 "이 항목을 보여 줘" 요청. seq가 바뀌면 같은 id라도 다시 찾는다. */
export type FocusRequest = { id: string; seq: number };

/**
 * 목록이 준비되면(ready) 요청한 항목을 찾아 보여 준다:
 * resolve()가 그 항목이 보이도록 화면 상태(묶음 탭 등)를 바꾸고 찾았는지 돌려준다.
 * 찾으면 data-focus-id가 같은 요소로 스크롤하고 잠깐 강조, 못 찾으면(내려간·숨겨진 항목) missingText를 알린다.
 * 돌려주는 값 = 지금 강조할 id(없으면 null).
 */
export function useFocusItem(request: FocusRequest | null | undefined, ready: boolean, resolve: (id: string) => boolean, missingText: string): string | null {
  const [highlight, setHighlight] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  useEffect(() => {
    if (!request || !ready) return;
    const key = `${request.id}:${request.seq}`;
    if (handled.current === key) return;
    handled.current = key;
    if (!resolveRef.current(request.id)) {
      toast(missingText);
      return;
    }
    const id = request.id;
    setHighlight(id);
    for (const t of timers.current) clearTimeout(t);
    timers.current = [
      setTimeout(() => {
        const el = document.querySelector(`[data-focus-id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 80),
      setTimeout(() => setHighlight((h) => (h === id ? null : h)), 3000),
    ];
  }, [request, ready, missingText]);

  return highlight;
}

/** 강조 테두리 클래스 */
export function focusRing(on: boolean): string {
  return on ? "rounded-card ring-2 ring-accent ring-offset-2 ring-offset-bg" : "";
}

export const FOCUS_MISSING_TEXT = "알림에 나온 항목을 찾지 못했어요. 내려갔거나 지금은 볼 수 없는 항목일 수 있어요";
