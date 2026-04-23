"use client";

import { BlurFade } from "@/components/ui/blur-fade";

const COMPARISON = [
  { name: "Works in Chrome", lens: "Yes", xerolas: "Yes" },
  { name: "Works in VS Code", lens: "No", xerolas: "Yes" },
  { name: "Works in Figma", lens: "No", xerolas: "Yes" },
  { name: "Works system-wide", lens: "No", xerolas: "Yes" },
  { name: "Global keyboard shortcut", lens: "No", xerolas: "Yes" },
  { name: "No upload required", lens: "No", xerolas: "Yes" },
  { name: "No API key needed", lens: "Yes", xerolas: "Yes" },
  { name: "Windows support", lens: "No", xerolas: "Yes" },
  { name: "macOS support", lens: "No", xerolas: "Yes" },
  { name: "Linux support", lens: "No", xerolas: "Yes" },
  { name: "Configurable AI prompts", lens: "No", xerolas: "Yes" },
  { name: "Local capture history", lens: "No", xerolas: "Yes" },
];

export function Exchanges() {
  return (
    <section id="comparison" className="relative py-20 px-4 border-t border-white/[0.04]">
      <div className="max-w-5xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
              Comparison
            </p>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold text-white mb-3">
              Xerolas vs Google Lens
            </h2>
            <p className="text-neutral-500 text-sm sm:text-base max-w-2xl mx-auto">
              Google Lens is useful inside Chrome. Xerolas brings that same kind of screen understanding to the whole desktop.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPARISON.map((row, i) => (
              <div
                key={i}
                className="group card-glow rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium text-white">
                    {row.name}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Google Lens: <span className="text-neutral-400">{row.lens}</span>
                  </div>
                </div>
                <div className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                  Xerolas: {row.xerolas}
                </div>
              </div>
            ))}
          </div>
        </BlurFade>

        <BlurFade delay={0.15} inView>
          <div className="flex justify-center mt-6">
            <span className="text-xs text-neutral-600 bg-white/[0.03] border border-white/[0.06] px-4 py-1.5 rounded-full">
              Built for desktop-wide capture, not just one browser tab
            </span>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
