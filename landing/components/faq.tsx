"use client";

import { useState } from "react";
import { BlurFade } from "@/components/ui/blur-fade";

const FAQ_ITEMS = [
  {
    question: "Is Xerolas really free?",
    answer:
      "Yes. Xerolas is free to download and install through the current public release flow. Your AI provider may have its own usage limits or billing rules.",
  },
  {
    question: "Do I need an API key?",
    answer:
      "Yes. Xerolas now uses a bring-your-own-key model for public builds. Add a provider key once in Settings, then capture from anywhere on your desktop.",
  },
  {
    question: "Is my screen data private?",
    answer:
      "Only the region you explicitly select is sent for analysis. Xerolas is not continuously monitoring your desktop, and your local history stays on your device.",
  },
  {
    question: "What powers Xerolas analysis?",
    answer:
      "Xerolas uses cloud AI vision models for screenshot understanding and answer generation.",
  },
  {
    question: "Does it work on all three platforms?",
    answer:
      "Yes. Xerolas is built for Windows, macOS, and Linux through the current desktop release pipeline.",
  },
  {
    question: "How do updates work?",
    answer:
      "Xerolas checks for updates in the background and uses the bundled update feed from the public GitHub release channel.",
  },
  {
    question: "Does Xerolas use web search?",
    answer:
      "Yes, when you explicitly enable it in Settings and the selected provider supports it. When search is used, Xerolas shows source links in the result panel.",
  },
  {
    question: "Can I customize what the AI does?",
    answer:
      "Yes. Xerolas includes quick actions like AI Overview, Extract text, Explain code, Translate, Summarize, and Ask question so you can steer what happens to each capture.",
  },
  {
    question: "Do I need to upload images manually?",
    answer:
      "No. Xerolas captures the selected screen region natively and sends it directly for analysis, so there is no manual file upload step.",
  },
];

function FaqItem({
  question,
  answer,
  index,
}: {
  question: string;
  answer: string;
  index: number;
}) {
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group"
      >
        <span className="text-sm font-medium text-white group-hover:text-neutral-200 transition-colors">
          {question}
        </span>
        <span
          className={`flex-shrink-0 h-5 w-5 rounded-full border border-white/20 flex items-center justify-center text-neutral-400 transition-all duration-200 ${
            open ? "rotate-45 border-violet-500/40 text-violet-400 bg-violet-500/10" : ""
          }`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M5 1v8M1 5h8" />
          </svg>
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? "max-h-48 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-sm text-neutral-400 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="relative py-28 px-4">
      <div className="max-w-3xl mx-auto">
        <BlurFade delay={0} inView>
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
              FAQ
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4">
              Frequently asked
              <br />
              <span className="text-neutral-500">questions.</span>
            </h2>
          </div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
          <div className="card-glow rounded-2xl px-6 divide-y divide-white/[0.06]">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem
                key={i}
                question={item.question}
                answer={item.answer}
                index={i}
              />
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
