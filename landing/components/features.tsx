"use client";

import { BlurFade } from "@/components/ui/blur-fade";

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3.75 12h16.5M12 3.75v16.5" />
      </svg>
    ),
    title: "Press the shortcut",
    description:
      "Hit Ctrl+Shift+Space from anywhere on your desktop, whether you are in your editor, browser, design tool, terminal, or a document.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M4.5 7.5h4.5V3m10.5 4.5h-4.5V3M4.5 16.5h4.5V21m10.5-4.5h-4.5V21" />
      </svg>
    ),
    title: "Select any region",
    description:
      "A full-screen overlay appears so you can drag across any area of any window: code, an error message, a chart, a design, or a block of text.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M8.25 12h7.5m-7.5 3h4.5m-7.5 6.75h10.5A2.25 2.25 0 0 0 18 19.5V4.5a2.25 2.25 0 0 0-2.25-2.25H8.121a2.25 2.25 0 0 0-1.591.659L3.909 5.53a2.25 2.25 0 0 0-.659 1.591V19.5A2.25 2.25 0 0 0 5.5 21.75Z" />
      </svg>
    ),
    title: "Get your answer instantly",
    description:
      "Xerolas sends only the selected region to Google Gemini and returns the result in a clean panel right on your desktop.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M7.5 7.5h9v9h-9z" />
        <path d="M3.75 12h1.5m13.5 0h1.5M12 3.75v1.5m0 13.5v1.5" />
      </svg>
    ),
    title: "Keep the answer alongside your capture",
    description:
      "The result panel appears beside the selected region so you can read, copy, dismiss, or rerun the same capture through a different mode without repeating the screenshot.",
  },
];

export function Features() {
  return (
    <section id="how-it-works" className="relative py-32 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(139,92,246,0.06),transparent)]" />

      <div className="max-w-6xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="text-center mb-20">
            <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
              How it works
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-5">
              Three steps.
              <br />
              <span className="text-neutral-500">That&apos;s it.</span>
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto text-lg">
              Capture, understand, and move on without switching apps or uploading files by hand.
            </p>
          </div>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((feature, i) => (
            <BlurFade key={i} delay={0.1 + i * 0.08} inView>
              <div className="group card-glow rounded-2xl p-7 flex gap-5 h-full">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-neutral-400 group-hover:bg-violet-500/10 group-hover:border-violet-500/20 group-hover:text-violet-400 transition-all duration-300">
                    {feature.icon}
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
