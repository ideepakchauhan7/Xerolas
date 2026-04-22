"use client";

import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { Meteors } from "@/components/ui/meteors";

export function CTA() {
  return (
    <section className="relative py-32 px-4 overflow-hidden" id="signup">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(139,92,246,0.12),transparent)]" />

      <div className="absolute inset-0 overflow-hidden">
        <Meteors number={8} />
      </div>

      <div className="relative max-w-4xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-12 sm:p-16 text-center relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.15),transparent)]" />

            <div className="relative z-10">
              <p className="text-sm font-medium text-violet-400 mb-4 uppercase tracking-widest">
                Download now
              </p>
              <h2 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                Install Xerolas.
                <br />
                <span className="text-neutral-500">Then start building.</span>
              </h2>
              <p className="text-neutral-400 max-w-lg mx-auto mb-10 text-lg leading-relaxed">
                The public site is live, the installers are public, and the desktop app is ready for Windows, macOS, and Linux.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="#download"
                  className="group px-8 py-3.5 text-sm font-semibold text-black bg-white rounded-full hover:bg-neutral-100 transition-all duration-200 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_32px_rgba(139,92,246,0.2)] hover:shadow-[0_8px_48px_rgba(139,92,246,0.35)]"
                >
                  Download Xerolas
                  <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>
                </Link>
                <a
                  href="https://github.com/ideepakchauhan7/Xerolas-downloads/releases/latest"
                  target="_blank"
                  rel="noreferrer"
                  className="px-8 py-3.5 text-sm font-medium text-neutral-300 rounded-full border border-white/10 hover:border-white/20 hover:text-white hover:bg-white/5 transition-all duration-200"
                >
                  View public release
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-600">
                {[
                  "✓ Public download links",
                  "✓ Windows, macOS, Linux builds",
                  "✓ Auto-update feed included",
                  "✓ No account required",
                ].map((item, i) => (
                  <span key={i}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
