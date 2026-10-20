"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Waves } from "lucide-react";
import { INTRO_FINAL, INTRO_SLIDES } from "@/lib/intro/slides";

export type IntroChoice = "instructor" | "center" | "signup";

const TOTAL = INTRO_SLIDES.length + 1;

export function IntroSlides({ onFinish }: { onFinish: (choice: IntroChoice) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // 회전·창 크기 변경 시 현재 장에 다시 맞춘다
    const ro = new ResizeObserver(() => {
      el.scrollTo({ left: indexRef.current * el.clientWidth, behavior: "auto" });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.min(TOTAL - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    indexRef.current = i;
    setIndex(i);
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const isLast = index === TOTAL - 1;
  const slideProps = (i: number) => ({
    "aria-hidden": i !== index,
    inert: i !== index,
  });
  const Heading = ({ i, className, children }: { i: number; className: string; children: React.ReactNode }) =>
    i === index ? <h1 className={className}>{children}</h1> : <h2 className={className}>{children}</h2>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {INTRO_SLIDES.map((s, i) => (
          <section key={s.title} {...slideProps(i)} className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-2 text-center">
            <Waves className="mb-6 h-12 w-12 text-accent" aria-hidden="true" />
            <Heading i={i} className="whitespace-pre-line text-2xl font-bold leading-snug tracking-tight text-ink">
              {s.title}
            </Heading>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
        <section {...slideProps(TOTAL - 1)} className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-2 text-center">
          <Waves className="mb-4 h-12 w-12 text-accent" aria-hidden="true" />
          <Heading i={TOTAL - 1} className="text-3xl font-bold tracking-tight text-ink">
            {INTRO_FINAL.title}
          </Heading>
          <p className="mt-2 text-sm text-muted">{INTRO_FINAL.body}</p>
          <div className="mt-8 w-full space-y-3">
            {(
              [
                ["instructor", INTRO_FINAL.instructorTitle, INTRO_FINAL.instructorSub],
                ["center", INTRO_FINAL.centerTitle, INTRO_FINAL.centerSub],
              ] as const
            ).map(([choice, t, sub]) => (
              <button
                key={choice}
                type="button"
                onClick={() => onFinish(choice)}
                className="w-full rounded-card border border-line bg-white p-4 text-left shadow-sm"
              >
                <span className="block text-base font-bold text-ink">{t}</span>
                <span className="mt-0.5 block text-sm text-muted">{sub}</span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">{INTRO_FINAL.noAccount}</p>
          <button type="button" onClick={() => onFinish("signup")} className="py-1 text-sm font-semibold text-accent">
            {INTRO_FINAL.signupLink}
          </button>
          <p className="mt-3 text-xs text-muted">
            <a href="/terms" className="underline">{INTRO_FINAL.terms}</a>
            {" · "}
            <a href="/privacy" className="underline">{INTRO_FINAL.privacy}</a>
          </p>
        </section>
      </div>

      <div className="mt-2 flex justify-center" role="tablist" aria-label="도입부 위치">
        {Array.from({ length: TOTAL }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${i + 1}번째 장`}
            onClick={() => goTo(i)}
            className="flex h-6 items-center px-1"
          >
            <span className={`block h-2 rounded-full transition-all ${i === index ? "w-6 bg-accent" : "w-2 bg-line"}`} />
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="이전"
          onClick={() => goTo(index - 1)}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink ${index === 0 ? "invisible" : ""}`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => (isLast ? onFinish("instructor") : goTo(index + 1))}
          className="flex h-[52px] flex-1 items-center justify-center gap-1 rounded-xl bg-ink text-base font-semibold text-white"
        >
          {isLast ? (
            INTRO_FINAL.body
          ) : (
            <>
              다음 <ChevronRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </main>
  );
}
