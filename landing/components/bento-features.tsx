"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid";

function DesktopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3.75 5.25h16.5v10.5H3.75z" />
      <path d="M9 18.75h6" />
    </svg>
  );
}
function ShortcutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M7.5 7.5h3v3h-3zm6 0h3v3h-3zm-6 6h3v3h-3zm6 0h3v3h-3z" />
    </svg>
  );
}
function CloudIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M6 18.75h10.5a3.75 3.75 0 1 0-.631-7.447 5.25 5.25 0 0 0-10.072 1.197A3.75 3.75 0 0 0 6 18.75Z" />
    </svg>
  );
}
function PromptIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M7.5 8.25h9m-9 4.5h6m-9.75 7.5 1.69-5.07A2.25 2.25 0 0 0 5.25 13.5V6A2.25 2.25 0 0 1 7.5 3.75h9A2.25 2.25 0 0 1 18.75 6v7.5A2.25 2.25 0 0 1 16.5 15.75H9.57a2.25 2.25 0 0 0-2.134 1.54L6 21.75Z" />
    </svg>
  );
}
function HistoryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 6v6l4.5 2.25" />
      <path d="M3.75 12a8.25 8.25 0 1 0 2.418-5.832" />
      <path d="M3.75 4.5v4.5h4.5" />
    </svg>
  );
}
function UpdateIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M16.023 9.348h4.992V4.356" />
      <path d="M2.985 19.644v-4.992h4.992" />
      <path d="M4.5 12a7.5 7.5 0 0 1 12.779-5.303l3.736 3.651M19.5 12a7.5 7.5 0 0 1-12.779 5.303l-3.736-3.651" />
    </svg>
  );
}

const OBIBackground = () => (
  <div className="absolute inset-0 p-4 opacity-30">
    <div className="h-full flex items-end gap-0.5">
      {Array.from({ length: 24 }, (_, i) => Math.max(5, Math.round(22 + Math.sin(i * 0.75) * 28 + (i % 4) * 7))).map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm"
          style={{
            height: `${h}%`,
            background: i > 12 ? "rgba(139, 92, 246, 0.6)" : "rgba(96, 165, 250, 0.4)",
          }}
        />
      ))}
    </div>
  </div>
);

const EventBackground = () => (
  <div className="absolute inset-0 p-4 opacity-20">
    <div className="font-mono text-xs text-emerald-400 space-y-1 leading-5">
      {["→ capture active in VS Code", "→ chart selected from PDF", "→ UI region captured from Figma", "→ answer panel opened beside selection", "→ copied result without leaving app"].map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  </div>
);

const StatArbBackground = () => (
  <div className="absolute inset-0 flex items-center justify-center opacity-20">
    <div className="relative w-40 h-20">
      <svg viewBox="0 0 160 80" className="w-full h-full">
        <polyline points="0,60 20,44 40,55 60,24 80,45 100,16 120,36 140,12 160,28" fill="none" stroke="#a78bfa" strokeWidth="2" />
        <polyline points="0,66 20,50 40,61 60,32 80,53 100,24 120,42 140,20 160,38" fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="4 2" />
      </svg>
    </div>
  </div>
);

const RiskBackground = () => (
  <div className="absolute inset-0 p-4 flex items-center justify-center opacity-25">
    <div className="text-center">
      <div className="text-5xl font-bold font-mono text-emerald-400">4</div>
      <div className="text-xs text-neutral-500 mt-1">BYOK providers</div>
    </div>
  </div>
);

const PaperBackground = () => (
  <div className="absolute inset-0 p-4 opacity-20">
    <div className="font-mono text-xs text-blue-400 space-y-1">
      {["$ xerolas modes", "✓ AI Overview", "✓ Extract text", "✓ Explain code", "✓ Translate", "✓ Summarize", "✓ Ask question"].map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  </div>
);

const CppBackground = () => (
  <div className="absolute inset-0 p-4 opacity-20 overflow-hidden">
    <div className="font-mono text-xs text-violet-400 leading-5">
      {["history[0] = last capture", "history[1] = previous result", "history[2] = extracted text", "history[3] = translated block", "history.limit = 10"].map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  </div>
);

const BENTO_ITEMS = [
  {
    name: "Works system-wide",
    Icon: DesktopIcon,
    description: "Use Xerolas across every app and window on your desktop, not just inside one browser tab.",
    tag: "Desktop",
    background: <OBIBackground />,
    className: "md:col-span-2",
  },
  {
    name: "One global shortcut",
    Icon: ShortcutIcon,
    description: "Press Ctrl+Shift+Space from anywhere to start a capture without hunting for the app window.",
    tag: "Fast",
    background: <EventBackground />,
    className: "md:col-span-1",
  },
  {
    name: "No upload required",
    Icon: CloudIcon,
    description: "The selected region is captured natively and sent directly for analysis without a manual file picker.",
    background: <StatArbBackground />,
    className: "md:col-span-1",
  },
  {
    name: "Configurable prompts",
    Icon: PromptIcon,
    description: "Describe, extract text, explain code, translate, summarize, or answer the most useful question from the selected region.",
    background: <RiskBackground />,
    className: "md:col-span-1",
  },
  {
    name: "Capture history",
    Icon: HistoryIcon,
    description: "Your last 10 captures and results stay available locally so you can re-open them without repeating the capture.",
    tag: "Local",
    background: <CppBackground />,
    className: "md:col-span-1",
  },
  {
    name: "Silent updates",
    Icon: UpdateIcon,
    description: "Xerolas checks for updates in the background so the installed desktop app stays current without manual downloads each time.",
    tag: "Automatic",
    background: <PaperBackground />,
    className: "md:col-span-2",
  },
];

export function BentoFeatures() {
  return (
    <section id="capabilities" className="relative py-28 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(96,165,250,0.06),transparent)]" />

      <div className="max-w-6xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-blue-400 mb-3 uppercase tracking-widest">
              Features
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-5">
              Everything you need.
              <br />
              <span className="text-neutral-500">Nothing you don&apos;t.</span>
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto text-lg">
              Xerolas stays focused on one job: helping you understand anything visible on your screen as quickly as possible.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
          <BentoGrid>
            {BENTO_ITEMS.map((item, i) => (
              <BentoCard key={i} {...item} />
            ))}
          </BentoGrid>
        </BlurFade>
      </div>
    </section>
  );
}
