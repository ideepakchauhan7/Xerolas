import Link from "next/link";

function StarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 341 350" fill="none">
      <path d="M340.625 120.312C296.875 146.354 257.812 164.583 223.438 175C257.812 185.417 296.875 203.646 340.625 229.688L303.125 295.312C255.208 266.146 219.792 241.667 196.875 221.875C204.167 254.167 207.812 296.875 207.812 350H132.812C132.812 296.875 136.458 254.167 143.75 221.875C120.833 241.667 85.4167 266.146 37.5 295.312L0 229.688C43.75 203.646 82.8125 185.417 117.188 175C82.8125 164.583 43.75 146.354 0 120.312L37.5 54.6875C85.4167 83.8542 120.833 108.333 143.75 128.125C136.458 95.8333 132.812 53.125 132.812 0H207.812C207.812 53.125 204.167 95.8333 196.875 128.125C219.792 108.333 255.208 83.8542 303.125 54.6875L340.625 120.312Z" fill="currentColor" />
    </svg>
  );
}

const FOOTER_LINKS = {
  Product: [
    { label: "Download", href: "#download" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Comparison", href: "#comparison" },
    { label: "FAQ", href: "#faq" },
  ],
  Releases: [
    { label: "Latest release", href: "https://github.com/ideepakchauhan7/Xerolas/releases/latest" },
    { label: "Changelog", href: "https://github.com/ideepakchauhan7/Xerolas/releases" },
    { label: "Source repo", href: "https://github.com/ideepakchauhan7/Xerolas" },
  ],
  Support: [
    { label: "Windows download", href: "#download" },
    { label: "macOS download", href: "#download" },
    { label: "Linux download", href: "#download" },
    { label: "Report issue", href: "https://github.com/ideepakchauhan7/Xerolas/issues/new?template=bug_report.yml" },
    { label: "Request feature", href: "https://github.com/ideepakchauhan7/Xerolas/issues/new?template=feature_request.yml" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-white/[0.05] px-4 pt-16 pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-white mb-4">
              <StarIcon />
              <span className="font-bold text-sm">Xerolas</span>
            </Link>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-[200px]">
              AI screen intelligence for your entire desktop.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.05] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-600">
            © {new Date().getFullYear()} Xerolas. Public downloads available now.
          </p>
          <div className="flex items-center gap-4">
            <p className="text-xs text-neutral-600">
              No account required · AI-powered analysis · Built for desktop capture
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
