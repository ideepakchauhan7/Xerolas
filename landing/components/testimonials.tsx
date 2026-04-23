"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import { Marquee } from "@/components/ui/marquee";

const USE_CASES = [
  {
    name: "Developers",
    handle: "Explain code instantly",
    initials: "DV",
    color: "bg-violet-600",
    text: "See an unfamiliar function, a stack trace, or confusing terminal output? Select it and ask Xerolas to explain it without leaving your editor.",
  },
  {
    name: "Designers",
    handle: "Describe and analyze UI",
    initials: "DS",
    color: "bg-blue-600",
    text: "Capture any interface, layout, or component and get an AI breakdown of what it is, how it works, or how to recreate it.",
  },
  {
    name: "Students & Researchers",
    handle: "Understand anything on screen",
    initials: "SR",
    color: "bg-emerald-600",
    text: "Reading a dense PDF, a chart, or a foreign-language article? Select the section and let Xerolas explain, summarize, or translate it.",
  },
  {
    name: "Writers & Marketers",
    handle: "Extract and repurpose content",
    initials: "WM",
    color: "bg-orange-600",
    text: "Capture text from anywhere on screen, even from non-selectable UI or images, and turn it into clean copy you can reuse.",
  },
  {
    name: "General Users",
    handle: "Answer visual questions",
    initials: "GU",
    color: "bg-pink-600",
    text: "See something confusing on your screen and want to know what it is? Just select it and ask Xerolas.",
  },
];

function UseCaseCard({
  name,
  handle,
  initials,
  color,
  text,
}: (typeof USE_CASES)[0]) {
  return (
    <div className="card-glow rounded-2xl p-6 w-72 flex flex-col gap-4 flex-shrink-0">
      <p className="text-sm text-neutral-400 leading-relaxed">{text}</p>
      <div className="flex items-center gap-3 mt-auto">
        <div
          className={`h-8 w-8 rounded-full ${color} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}
        >
          {initials}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{name}</div>
          <div className="text-xs text-neutral-500">{handle}</div>
        </div>
      </div>
    </div>
  );
}

export function Testimonials() {
  const half = Math.ceil(USE_CASES.length / 2);
  const row1 = USE_CASES.slice(0, half);
  const row2 = USE_CASES.slice(half);

  return (
    <section id="use-cases" className="relative py-28 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(139,92,246,0.05),transparent)]" />

      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#080808] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#080808] to-transparent z-10" />

      <BlurFade delay={0} inView>
        <div className="text-center mb-14 px-4">
          <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
            Use cases
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4">
            What will you use
            <br />
            <span className="text-neutral-500">Xerolas for?</span>
          </h2>
          <p className="text-neutral-400 max-w-md mx-auto">
            From debugging and OCR to translation and visual explanation, Xerolas is built for whatever is already on your screen.
          </p>
        </div>
      </BlurFade>

      <div className="flex flex-col gap-4">
        <Marquee pauseOnHover repeat={3} className="[--duration:35s]">
          {row1.map((item, i) => (
            <UseCaseCard key={i} {...item} />
          ))}
        </Marquee>
        <Marquee pauseOnHover reverse repeat={3} className="[--duration:38s]">
          {row2.map((item, i) => (
            <UseCaseCard key={i} {...item} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}
