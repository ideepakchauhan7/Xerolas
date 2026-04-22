"use client";

import Link from "next/link";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { Meteors } from "@/components/ui/meteors";
import { BlurFade } from "@/components/ui/blur-fade";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 pt-24 pb-16">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/background-painting.webp')" }}
      />

      <div className="absolute inset-0 bg-[#080808]/70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,transparent_30%,rgba(8,8,8,0.6)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-5%,rgba(139,92,246,0.18),transparent)]" />
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#080808] to-transparent" />

      <div className="absolute inset-0 overflow-hidden">
        <Meteors number={12} />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto">
        <BlurFade delay={0.0} inView>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm hover:border-violet-500/30 transition-colors duration-300 cursor-default">
            <span className="text-xs font-medium text-violet-400">LIVE</span>
            <div className="h-3 w-px bg-white/20" />
            <AnimatedShinyText className="text-xs text-neutral-300" shimmerWidth={80}>
              Public installers are now available for Windows, macOS, and Linux
            </AnimatedShinyText>
            <svg
              className="ml-1 h-3 w-3 text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </BlurFade>

        <BlurFade delay={0.08} inView>
          <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tight text-white mb-6">
            Turn your idea
            <br />
            <span className="text-neutral-400 font-normal">
              into clear specs.
            </span>
            <br />
            <AnimatedGradientText
              colorFrom="#a78bfa"
              colorTo="#60a5fa"
              className="font-bold"
            >
              Then ship it.
            </AnimatedGradientText>
          </h1>
        </BlurFade>

        <BlurFade delay={0.16} inView>
          <p className="text-lg sm:text-xl text-neutral-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Define your specifications first. Let AI build production-ready code.
            <br className="hidden sm:block" />
            <span className="text-neutral-500">
              Download the desktop app and start building right away.
            </span>
          </p>
        </BlurFade>

        <BlurFade delay={0.24} inView>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="#download"
              className="group relative px-7 py-3 text-sm font-semibold text-black bg-white rounded-full hover:bg-neutral-100 transition-all duration-200 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_4px_24px_rgba(139,92,246,0.2)]"
            >
              Download Xerolas
              <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href="#features"
              className="px-7 py-3 text-sm font-medium text-neutral-300 rounded-full border border-white/10 hover:border-white/20 hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              Learn how it works
            </Link>
          </div>
        </BlurFade>

        <BlurFade delay={0.32} inView>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {[
              { value: "3", unit: "", label: "builder modes" },
              { value: "100", unit: "%", label: "exportable code" },
              { value: "24", unit: "/7", label: "ai guidance" },
              { value: "1", unit: "", label: "download to first draft" },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className="text-2xl font-bold text-white font-heading tracking-tight">
                  {stat.value}
                  <span className="text-violet-400">{stat.unit}</span>
                </div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </BlurFade>

        <BlurFade delay={0.4} inView>
          <div className="mt-16 relative w-full max-w-4xl mx-auto" id="demo">
            <div className="absolute -inset-4 bg-gradient-to-r from-violet-600/20 via-blue-600/20 to-emerald-600/20 rounded-3xl blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                <span className="ml-3 text-xs text-neutral-600 font-mono">
                  xerolas — project workspace
                </span>
              </div>
              <div className="p-6 font-mono text-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-neutral-500 uppercase tracking-wide">
                        Project brief
                      </span>
                      <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                        READY
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">MVP</div>
                    <div className="text-xs text-neutral-500">
                      SaaS onboarding flow ·{" "}
                      <span className="text-emerald-400">scoped</span>
                    </div>
                    <div className="mt-3 h-1 rounded-full bg-white/[0.06]">
                      <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-violet-500 to-emerald-500" />
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-neutral-500 uppercase tracking-wide">
                        Spec flow
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                      4<span className="text-sm text-neutral-400"> steps</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      brief · ux · design · code
                    </div>
                    <div className="mt-3 flex gap-0.5">
                      {[8, 12, 10, 15, 13, 17, 16, 18, 14, 20, 19, 22, 18, 24, 20, 26].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-violet-500/40"
                          style={{ height: `${h}px` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-neutral-500 uppercase tracking-wide">
                        Build output
                      </span>
                      <span className="text-xs font-medium text-blue-400">
                        EXPORT
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mb-1">
                      React + API
                    </div>
                    <div className="text-xs text-neutral-500">
                      typed routes ·{" "}
                      <span className="text-emerald-400">db ready</span>
                    </div>
                    <div className="mt-3 text-xs font-mono text-neutral-600">
                      <span className="text-emerald-400">●</span> Auth{" "}
                      <span className="text-emerald-400">included</span>
                      {"  "}
                      <span className="text-blue-400">●</span> Deploy{" "}
                      <span className="text-blue-400">ready</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
