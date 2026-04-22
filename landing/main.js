const RELEASES_API = 'https://api.github.com/repos/ideepakchauhan7/Xerolas/releases/latest';
const FALLBACK_RELEASES_URL = 'https://github.com/ideepakchauhan7/Xerolas/releases';

const versionChip = document.getElementById('version-chip');
const notes = document.getElementById('release-notes');
const windowsButton = document.getElementById('download-windows');
const macosButton = document.getElementById('download-macos');
const linuxButton = document.getElementById('download-linux');
const releaseLink = document.getElementById('release-link');

function escapeHtml(value) {
  return value.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
}

function setDownloadLink(element, asset) {
  if (!element) return;
  if (!asset) {
    element.setAttribute('aria-disabled', 'true');
    element.href = '#';
    return;
  }

  element.removeAttribute('aria-disabled');
  element.href = asset.browser_download_url;
}

function findAsset(assets, matcher) {
  return assets.find((asset) => matcher(asset.name.toLowerCase())) ?? null;
}

async function loadLatestRelease() {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' }
    });

    if (!response.ok) {
      throw new Error(`GitHub Releases request failed with ${response.status}`);
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];

    const windowsAsset = findAsset(assets, (name) => name.endsWith('.exe'));
    const macosAsset = findAsset(assets, (name) => name.endsWith('.dmg'));
    const linuxAsset =
      findAsset(assets, (name) => name.endsWith('.appimage')) ??
      findAsset(assets, (name) => name.endsWith('.deb'));

    setDownloadLink(windowsButton, windowsAsset);
    setDownloadLink(macosButton, macosAsset);
    setDownloadLink(linuxButton, linuxAsset);

    versionChip.textContent = `Latest release: ${release.tag_name || 'Unknown version'}`;
    releaseLink.href = release.html_url || FALLBACK_RELEASES_URL;
    notes.innerHTML = release.body
      ? release.body
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')
      : '<p>No release notes were provided for the latest version.</p>';
  } catch (error) {
    versionChip.textContent = 'Latest release: unavailable';
    notes.innerHTML = '<p>Could not load release details right now. Use GitHub Releases directly.</p>';
    setDownloadLink(windowsButton, null);
    setDownloadLink(macosButton, null);
    setDownloadLink(linuxButton, null);
    releaseLink.href = FALLBACK_RELEASES_URL;
    console.error(error);
  }
}

void loadLatestRelease();
