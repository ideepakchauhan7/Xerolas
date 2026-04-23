"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";

const STATS = [
  { value: 1, suffix: "", label: "shortcut" },
  { value: 3, suffix: "", label: "desktop platforms" },
  { value: 0, suffix: "", label: "api keys" },
  { value: 10, suffix: "", label: "local history items" },
];

export function SocialProof() {
  return (
    <section id="problem" className="relative py-20 px-4 border-t border-white/[0.05]">
      <div className="max-w-5xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="flex flex-col items-center text-center gap-6">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.24em] text-violet-400">
              The problem
            </div>

            <div className="max-w-3xl">
              <div className="text-sm font-medium text-white mb-3">
                Google Lens is great. But it&apos;s stuck inside Chrome.
              </div>
              <div className="text-sm text-neutral-500 leading-relaxed sm:text-base">
                You&apos;re working in VS Code, Figma, Notion, Slack, Excel, or a PDF and you want to understand something on your screen. Without Xerolas, you switch apps, take a screenshot, open a browser tab, upload the image, and wait. Xerolas fixes that with one shortcut, any window, and an instant answer beside your capture.
              </div>
            </div>
          </div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/[0.06]">
            {STATS.map((stat, i) => (
              <div
                key={i}
                className="bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-8 py-8 flex flex-col items-center text-center gap-1"
              >
                <div className="text-3xl font-bold font-heading text-white">
                  <NumberTicker value={stat.value} />
                  {stat.suffix}
                </div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
