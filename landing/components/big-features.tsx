"use client";

import { BlurFade } from "@/components/ui/blur-fade";

const BIG_FEATURES = [
  {
    eyebrow: "Works System-Wide",
    title: "Not just inside a browser tab.",
    description:
      "Xerolas works across every app and window on your desktop: VS Code, Figma, Chrome, Excel, Slack, terminals, PDFs, and more.",
    bullets: [
      "Capture from any app without changing focus",
      "Trigger the overlay with one global shortcut",
      "Ask about anything visible on your screen",
    ],
    visual: (
      <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 font-mono text-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-neutral-500">desktop-context · active windows</span>
        </div>
        {[
          { app: "VS Code", note: "Explain code selection", color: "text-emerald-400" },
          { app: "Figma", note: "Analyze layout region", color: "text-blue-400" },
          { app: "Chrome", note: "Summarize article block", color: "text-violet-400" },
          { app: "Terminal", note: "Explain stack trace", color: "text-emerald-400" },
        ].map((row, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
            <span className={`shrink-0 font-semibold ${row.color}`}>{row.app}</span>
            <span className="text-neutral-400 flex-1 leading-relaxed">{row.note}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Bring Your Own Key",
    title: "Choose the provider you trust.",
    description:
      "Add your own provider key once in Settings. Xerolas keeps saved keys out of normal settings storage and uses only the provider path you choose.",
    bullets: [
      "No file upload flow or manual screenshot export",
      "Provider keys are encrypted locally when the OS supports it",
      "Runs from the tray and stays ready in the background",
    ],
    visual: (
      <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 font-mono text-xs overflow-hidden">
        <div className="text-neutral-500 mb-4">setup-checklist · local control</div>
        {[
          { label: "Xerolas account", state: "No" },
          { label: "Your provider key", state: "Yes" },
          { label: "Manual uploads", state: "No" },
          { label: "Desktop install", state: "Yes" },
          { label: "Capture from any app", state: "Yes" },
        ].map((row, i) => (
          <div key={i} className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">{row.label}</span>
              <span className={row.state === "Yes" ? "text-emerald-400" : "text-violet-400"}>{row.state}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.05]">
              <div
                className={`h-full rounded-full ${row.state === "Yes" ? "bg-gradient-to-r from-emerald-500 to-blue-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-500"}`}
                style={{ width: row.state === "Yes" ? "88%" : "22%" }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Prompt Modes",
    title: "Tell it what to do with each capture.",
    description:
      "Describe what is visible, extract text, explain code, translate, summarize, or answer the most useful question implied by what you selected.",
    bullets: [
      "Quick actions tuned for common screen tasks",
      "Reusable capture history for the last 10 results",
      "Silent updates and background-ready desktop flow",
    ],
    visual: (
      <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 font-mono text-xs">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-neutral-600">$</span>
          <span className="text-white">xerolas modes</span>
        </div>
        {[
          { text: "AI Overview", color: "text-emerald-400" },
          { text: "Extract text", color: "text-blue-400" },
          { text: "Explain code", color: "text-violet-400" },
          { text: "Translate", color: "text-orange-400" },
          { text: "Summarize", color: "text-emerald-400" },
          { text: "Ask question", color: "text-blue-400" },
        ].map((line, i) => (
          <div key={i} className={`leading-6 ${line.color}`}>
            {line.text}
          </div>
        ))}
      </div>
    ),
  },
];

export function BigFeatures() {
  return (
    <section className="relative py-24 px-4">
      <div className="max-w-6xl mx-auto space-y-32">
        {BIG_FEATURES.map((feat, i) => (
          <BlurFade key={i} delay={0} inView>
            <div
              className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-center ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-4">
                  {feat.eyebrow}
                </p>
                <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-5 leading-tight">
                  {feat.title}
                </h2>
                <p className="text-neutral-400 leading-relaxed mb-7">
                  {feat.description}
                </p>
                <ul className="space-y-3">
                  {feat.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-neutral-400">
                      <svg
                        className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-violet-600/10 via-blue-600/10 to-transparent rounded-2xl blur-xl" />
                <div className="relative">{feat.visual}</div>
              </div>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}
