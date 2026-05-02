"use client";

import Image from "next/image";
import { BlurFade } from "@/components/ui/blur-fade";

const SCREENSHOTS = [
  {
    title: "Capture anything visible",
    caption: "Select a region and Xerolas starts working beside your screen.",
    src: "/screenshots/capture-searching.webp",
    featured: true,
  },
  {
    title: "Answer beside the selection",
    caption: "Keep the original context open while the result streams in.",
    src: "/screenshots/ai-overview-answer.webp",
  },
  {
    title: "Ask follow-ups in place",
    caption: "Turn the bottom prompt into an inline question box.",
    src: "/screenshots/ask-anything-composer.webp",
  },
  {
    title: "Control answer shape",
    caption: "Ask for a short answer, summary, explanation, or exact format.",
    src: "/screenshots/ask-one-line-answer.webp",
  },
  {
    title: "Translate what you see",
    caption: "Use the same capture flow for translation and text-heavy screens.",
    src: "/screenshots/translate-mode.webp",
  },
];

export function ProductPreview() {
  return (
    <section id="preview" className="relative py-24 px-4 border-t border-white/[0.05]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(139,92,246,0.10),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative max-w-6xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
              Product preview
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-5">
              From screenshot to answer,
              <br />
              <span className="text-neutral-500">without leaving your desktop.</span>
            </h2>
            <p className="text-neutral-400 max-w-2xl mx-auto text-lg leading-relaxed">
              These are real Xerolas captures: select a screen region, get an answer beside it, then ask follow-up questions or switch modes on the same capture.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {SCREENSHOTS.map((shot, index) => (
            <BlurFade key={shot.src} delay={0.04 * index} inView>
              <article
                className={`group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3 transition-all duration-300 hover:border-white/[0.16] hover:bg-white/[0.04] ${
                  shot.featured ? "lg:col-span-2" : ""
                }`}
              >
                <div className="absolute -inset-8 bg-gradient-to-r from-violet-600/10 via-blue-600/5 to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/40">
                  <Image
                    src={shot.src}
                    alt={`${shot.title} screenshot`}
                    width={1500}
                    height={636}
                    sizes={shot.featured ? "(min-width: 1024px) 1100px, 100vw" : "(min-width: 1024px) 540px, 100vw"}
                    className={`w-full object-cover opacity-90 transition duration-300 group-hover:opacity-100 ${
                      shot.featured ? "aspect-[1500/636]" : "aspect-[16/9]"
                    }`}
                    priority={index === 0}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                </div>
                <div className="relative px-2 pb-1 pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">{shot.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-500">{shot.caption}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-500">
                      0{index + 1}
                    </span>
                  </div>
                </div>
              </article>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
