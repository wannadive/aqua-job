"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Waves } from "lucide-react";
import { INTRO_FINAL, INTRO_SLIDES } from "@/lib/intro/slides";

export type IntroChoice = "instructor" | "center" | "signup";

const TOTAL = INTRO_SLIDES.length + 1;

export function IntroSlides({ onFinish }: { onFinish: (choice: IntroChoice) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex(Math.min(TOTAL - 1, Math.max(0, i)));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const isLast = index === TOTAL - 1;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-6 pt-8">
      <div className="flex justify-center">
        <Waves className="h-10 w-10 text-accent" aria-hidden="true" />
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="mt-6 flex flex-1 snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {INTRO_SLIDES.map((s) => (
          <section key={s.title} className="flex w-full shrink-0 snap-center flex-col justify-center px-2 text-center">
            <h1 className="whitespace-pre-line text-2xl font-bold leading-snug tracking-tight text-ink">{s.title}</h1>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
        <section className="flex w-full shrink-0 snap-center flex-col justify-center px-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{INTRO_FINAL.title}</h1>
          <p className="mt-2 text-sm text-muted">{INTRO_FINAL.body}</p>
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => onFinish("instructor")}
              className="w-full rounded-card bg-ink px-4 py-4 text-sm font-semibold text-white"
            >
              {INTRO_FINAL.instructor}
            </button>
            <button
              type="button"
              onClick={() => onFinish("center")}
              className="w-full rounded-card bg-ink px-4 py-4 text-sm font-semibold text-white"
            >
              {INTRO_FINAL.center}
            </button>
            <button
              type="button"
              onClick={() => onFinish("signup")}
              className="w-full py-2 text-sm font-medium text-accent"
            >
              {INTRO_FINAL.signup}
            </button>
          </div>
          <p className="mt-6 text-xs text-muted">
            <a href="/terms" className="underline">{INTRO_FINAL.terms}</a>
            {" · "}
            <a href="/privacy" className="underline">{INTRO_FINAL.privacy}</a>
          </p>
        </section>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          aria-label="이전"
          onClick={() => goTo(index - 1)}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-ink ${index === 0 ? "invisible" : ""}`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex gap-2" role="tablist" aria-label="도입부 위치">
          {Array.from({ length: TOTAL }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}번째 장`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-accent" : "w-2 bg-muted/40"}`}
            />
          ))}
        </div>
        {isLast ? (
          <button
            type="button"
            onClick={() => onFinish("instructor")}
            className="h-10 rounded-full px-3 text-sm font-semibold text-accent"
          >
            {INTRO_FINAL.body}
          </button>
        ) : (
          <button
            type="button"
            aria-label="다음"
            onClick={() => goTo(index + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </main>
  );
}
