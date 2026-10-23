"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listReceivedOffers, listSentOffers } from "@/lib/offers/api";
import type { Offer, ReceivedOffer } from "@/lib/offers/types";

/**
 * 센터: 내 공고들로 보낸 제안. jobIds가 바뀌면(공고를 다시 불러오면) 다시 읽는다.
 * 늦게 도착한 옛 응답은 버린다(seq). reload는 최신 목록을 돌려준다(실패하면 null).
 */
export function useSentOffers(jobIds: string[], enabled: boolean) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const key = jobIds.join(",");

  const reload = useCallback(async (): Promise<Offer[] | null> => {
    const my = ++seq.current;
    setError(false);
    try {
      const list = await listSentOffers(key ? key.split(",") : []);
      if (my !== seq.current) return null;
      setOffers(list);
      return list;
    } catch {
      if (my === seq.current) setError(true);
      return null;
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [reload, enabled]);

  return { offers, loading, error, reload };
}

/** 강사: 내가 받은 제안(제안 탭·지원 현황·홈 숫자가 함께 쓴다). */
export function useReceivedOffers() {
  const [offers, setOffers] = useState<ReceivedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setError(false);
    try {
      const list = await listReceivedOffers();
      if (my !== seq.current) return;
      setOffers(list);
    } catch {
      if (my === seq.current) setError(true);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { offers, loading, error, reload };
}
