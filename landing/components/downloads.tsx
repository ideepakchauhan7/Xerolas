const RELEASES_API = "https://api.github.com/repos/ideepakchauhan7/Xerolas-downloads/releases/latest";
const RELEASES_PAGE = "https://github.com/ideepakchauhan7/Xerolas-downloads/releases/latest";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
};

function pickAsset(assets: ReleaseAsset[], matcher: (asset: ReleaseAsset) => boolean) {
  return assets.find(matcher);
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(RELEASES_API, {
      next: { revalidate: 3600 },
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GitHubRelease;
  } catch {
    return null;
  }
}

export async function Downloads() {
  const release = await getLatestRelease();
  const assets = release?.assets ?? [];
  const windows = pickAsset(assets, (asset) => asset.name.endsWith(".exe") && !asset.name.endsWith(".blockmap"));
  const mac = pickAsset(assets, (asset) => asset.name.endsWith(".dmg"));
  const appImage = pickAsset(assets, (asset) => asset.name.endsWith(".AppImage"));
  const deb = pickAsset(assets, (asset) => asset.name.endsWith(".deb"));

  const downloadOptions = [
    { label: "Windows", href: windows?.browser_download_url ?? RELEASES_PAGE, meta: windows?.name ?? "NSIS installer (.exe)" },
    { label: "macOS", href: mac?.browser_download_url ?? RELEASES_PAGE, meta: mac?.name ?? "Apple Silicon dmg" },
    { label: "Linux AppImage", href: appImage?.browser_download_url ?? RELEASES_PAGE, meta: appImage?.name ?? "Portable AppImage" },
    { label: "Linux .deb", href: deb?.browser_download_url ?? RELEASES_PAGE, meta: deb?.name ?? "Debian package" },
  ];

  const published = release?.published_at
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(release.published_at))
    : null;

  return (
    <section id="download" className="relative py-24 px-4 border-t border-white/[0.05]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(139,92,246,0.08),transparent)]" />

      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-violet-400 mb-3 uppercase tracking-widest">
            Download Xerolas
          </p>
          <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-5">
            Public installers, ready now.
          </h2>
          <p className="text-neutral-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Download Xerolas for Windows, macOS, or Linux directly from the public release feed. No sign-in and no API key setup required.
          </p>
        </div>

        <div className="card-glow rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 sm:p-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
            <div>
              <div className="text-sm text-neutral-500 uppercase tracking-widest mb-3">
                Latest public release
              </div>
              <div className="text-3xl sm:text-4xl font-heading font-bold text-white">
                {release?.tag_name ?? "GitHub Releases"}
              </div>
              <div className="mt-3 text-sm text-neutral-400">
                {published ? `Published ${published}` : "Installers are published from the public downloads repository."}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <a
                href={release?.html_url ?? RELEASES_PAGE}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 rounded-full border border-white/10 text-neutral-300 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all duration-200"
              >
                View release notes
              </a>
              <a
                href="https://github.com/ideepakchauhan7/Xerolas-downloads"
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 rounded-full border border-white/10 text-neutral-300 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all duration-200"
              >
                Open downloads repo
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {downloadOptions.map((option) => (
              <a
                key={option.label}
                href={option.href}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.16] transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white font-semibold">{option.label}</span>
                  <span className="text-violet-400 transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
                <div className="text-sm text-neutral-500 leading-relaxed">{option.meta}</div>
              </a>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-6 text-xs text-neutral-600">
            <span>✓ Public GitHub release assets</span>
            <span>✓ Auto-update feed included</span>
            <span>✓ Windows, macOS, and Linux builds</span>
          </div>
        </div>
      </div>
    </section>
  );
}
