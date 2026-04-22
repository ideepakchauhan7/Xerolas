"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { label: "Download", href: "#download" },
  { label: "How it works", href: "#features" },
  { label: "Capabilities", href: "#strategies" },
  { label: "FAQ", href: "#faq" },
];

function StarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 341 350"
      fill="none"
    >
      <path
        d="M340.625 120.312C296.875 146.354 257.812 164.583 223.438 175C257.812 185.417 296.875 203.646 340.625 229.688L303.125 295.312C255.208 266.146 219.792 241.667 196.875 221.875C204.167 254.167 207.812 296.875 207.812 350H132.812C132.812 296.875 136.458 254.167 143.75 221.875C120.833 241.667 85.4167 266.146 37.5 295.312L0 229.688C43.75 203.646 82.8125 185.417 117.188 175C82.8125 164.583 43.75 146.354 0 120.312L37.5 54.6875C85.4167 83.8542 120.833 108.333 143.75 128.125C136.458 95.8333 132.812 53.125 132.812 0H207.812C207.812 53.125 204.167 95.8333 196.875 128.125C219.792 108.333 255.208 83.8542 303.125 54.6875L340.625 120.312Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed top-4 inset-x-0 z-50 flex justify-center px-4">
      <nav
        className={`hidden lg:flex w-full max-w-5xl items-center justify-between px-5 py-2.5 rounded-full transition-all duration-300 ${
          scrolled
            ? "glass-nav shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            : "bg-transparent"
        }`}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity"
          >
            <StarIcon />
            <span className="font-bold text-base tracking-tight">Xerolas</span>
          </Link>
          <div className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-md hover:bg-white/5 transition-all duration-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="#demo"
            className="px-4 py-1.5 text-sm text-neutral-300 hover:text-white rounded-full hover:bg-white/5 transition-all duration-200"
          >
            See workflow
          </Link>
          <Link
            href="#download"
            className="px-4 py-1.5 text-sm font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition-all duration-200"
          >
            Download app
          </Link>
        </div>
      </nav>

      <nav className="flex lg:hidden w-full items-center justify-between px-4 py-2.5 rounded-full glass-nav">
        <Link href="/" className="flex items-center gap-2 text-white">
          <StarIcon />
          <span className="font-bold text-sm">Xerolas</span>
        </Link>
        <button
          className="text-neutral-400 hover:text-white p-1 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="absolute top-16 inset-x-4 lg:hidden glass-nav rounded-2xl p-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2 text-sm text-neutral-300 hover:text-white rounded-lg hover:bg-white/5 transition-all"
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-white/10 mt-2 pt-2 flex flex-col gap-2">
            <Link
              href="#demo"
              className="px-3 py-2 text-sm text-center text-neutral-300 hover:text-white rounded-lg hover:bg-white/5 transition-all"
            >
              See workflow
            </Link>
            <Link
              href="#download"
              className="px-3 py-2 text-sm font-medium text-center bg-white text-black rounded-lg hover:bg-neutral-200 transition-all"
            >
              Download app
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
