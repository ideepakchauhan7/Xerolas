import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  type AiProviderId,
  type AppSettings,
  BYOK_PROVIDER_IDS,
  HISTORY_LIMIT,
  isAiProviderId,
  normalizeFallbackProviderIds,
  normalizeProviderModelOverrides,
  normalizeTranslateTargetLanguage,
  type HistoryEntry,
  type Point,
  type ProviderModelOverrides,
  type QuickActionId,
  type Size,
  type SourceLink,
  type WidgetPositionMap
} from '../src/shared/types';

export interface LoadedSettings {
  quickActionId?: QuickActionId;
  promptTemplate?: string;
  translateTargetLanguage?: string;
  primaryProviderId?: AiProviderId;
  fallbackProviderIds?: AiProviderId[];
  providerModelOverrides?: ProviderModelOverrides;
  webSearchEnabled?: boolean;
  shortcut?: string;
  widgetPositions: WidgetPositionMap;
  resultWindowSize?: Size;
}

const LEGACY_USER_DATA_FOLDERS = ['Context AI', 'context-ai'];

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getHistoryPath(): string {
  return path.join(app.getPath('userData'), 'history.json');
}

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sanitizePoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybePoint = value as Partial<Point>;
  if (typeof maybePoint.x !== 'number' || typeof maybePoint.y !== 'number') {
    return null;
  }

  return {
    x: Math.round(maybePoint.x),
    y: Math.round(maybePoint.y)
  };
}

function sanitizeSize(value: unknown): Size | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeSize = value as Partial<Size>;
  if (typeof maybeSize.width !== 'number' || typeof maybeSize.height !== 'number') {
    return null;
  }

  return {
    width: Math.max(320, Math.round(maybeSize.width)),
    height: Math.max(420, Math.round(maybeSize.height))
  };
}

function sanitizeWidgetPositions(value: unknown): WidgetPositionMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, point]) => {
      const safePoint = sanitizePoint(point);
      return safePoint ? [key, safePoint] : null;
    })
    .filter((entry): entry is [string, Point] => entry !== null);

  return Object.fromEntries(entries);
}

function sanitizeFallbackProviderIds(value: unknown, primaryProviderId: AiProviderId): AiProviderId[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return normalizeFallbackProviderIds(
    value.filter((entry): entry is AiProviderId => isAiProviderId(entry)),
    primaryProviderId
  );
}

function sanitizeProviderModelOverrides(value: unknown): ProviderModelOverrides | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const overrides: ProviderModelOverrides = {};
  BYOK_PROVIDER_IDS.forEach((provider) => {
    const model = typeof raw[provider] === 'string' ? raw[provider].trim() : '';
    if (model) {
      overrides[provider] = model;
    }
  });

  return normalizeProviderModelOverrides(overrides);
}

function sanitizeQuickActionId(value: unknown): QuickActionId | undefined {
  if (
    value === 'describe' ||
    value === 'extract' ||
    value === 'code' ||
    value === 'translate' ||
    value === 'summarize' ||
    value === 'ask' ||
    value === 'custom'
  ) {
    return value;
  }

  return undefined;
}

function sanitizeSettings(value: unknown): LoadedSettings {
  if (!value || typeof value !== 'object') {
    return { widgetPositions: {} };
  }

  const raw = value as Record<string, unknown>;
  const primaryProviderId = isAiProviderId(raw.primaryProviderId) ? raw.primaryProviderId : undefined;
  return {
    quickActionId: sanitizeQuickActionId(raw.quickActionId),
    promptTemplate:
      typeof raw.promptTemplate === 'string' && raw.promptTemplate.trim()
        ? raw.promptTemplate.trim()
        : undefined,
    translateTargetLanguage:
      typeof raw.translateTargetLanguage === 'string'
        ? normalizeTranslateTargetLanguage(raw.translateTargetLanguage)
        : undefined,
    primaryProviderId,
    fallbackProviderIds: primaryProviderId
      ? sanitizeFallbackProviderIds(raw.fallbackProviderIds, primaryProviderId)
      : undefined,
    providerModelOverrides: sanitizeProviderModelOverrides(raw.providerModelOverrides),
    webSearchEnabled: typeof raw.webSearchEnabled === 'boolean' ? raw.webSearchEnabled : undefined,
    shortcut:
      typeof raw.shortcut === 'string' && raw.shortcut.trim()
        ? raw.shortcut.trim()
        : undefined,
    widgetPositions: sanitizeWidgetPositions(raw.widgetPositions),
    resultWindowSize: sanitizeSize(raw.resultWindowSize) ?? undefined
  };
}

function sanitizeRect(value: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rect = value as Record<string, unknown>;
  if (
    typeof rect.x !== 'number' ||
    typeof rect.y !== 'number' ||
    typeof rect.width !== 'number' ||
    typeof rect.height !== 'number'
  ) {
    return null;
  }

  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function sanitizeSourceLink(value: unknown): SourceLink | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  if (
    typeof raw.title !== 'string' ||
    !raw.title.trim() ||
    typeof raw.url !== 'string' ||
    !raw.url.trim() ||
    typeof raw.host !== 'string' ||
    !raw.host.trim()
  ) {
    return null;
  }

  return {
    title: raw.title.trim(),
    url: raw.url.trim(),
    host: raw.host.trim()
  };
}

function sanitizeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const quickActionId = sanitizeQuickActionId(raw.quickActionId);
  const selection = raw.selection as Record<string, unknown> | undefined;
  const absoluteBounds = sanitizeRect(selection?.absoluteBounds);
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map((entry) => sanitizeSourceLink(entry)).filter((entry): entry is SourceLink => entry !== null)
    : [];

  if (
    typeof raw.id !== 'string' ||
    !raw.id.trim() ||
    typeof raw.createdAt !== 'string' ||
    !raw.createdAt.trim() ||
    typeof raw.provider !== 'string' ||
    !raw.provider.trim() ||
    typeof raw.model !== 'string' ||
    !raw.model.trim() ||
    typeof raw.usedFallback !== 'boolean' ||
    !quickActionId ||
    typeof raw.promptTemplate !== 'string' ||
    !raw.promptTemplate.trim() ||
    typeof raw.text !== 'string' ||
    !raw.text.trim() ||
    typeof raw.imageDataUrl !== 'string' ||
    !raw.imageDataUrl.startsWith('data:image/') ||
    !selection ||
    typeof selection.displayId !== 'string' ||
    !selection.displayId.trim() ||
    !absoluteBounds
  ) {
    return null;
  }

  return {
    id: raw.id.trim(),
    createdAt: raw.createdAt.trim(),
    provider: raw.provider.trim(),
    model: raw.model.trim(),
    usedFallback: raw.usedFallback,
    groundingUsed: typeof raw.groundingUsed === 'boolean' ? raw.groundingUsed : sources.length > 0,
    sources,
    quickActionId,
    promptTemplate: raw.promptTemplate.trim(),
    text: raw.text.trim(),
    imageDataUrl: raw.imageDataUrl,
    selection: {
      displayId: selection.displayId.trim(),
      absoluteBounds
    }
  };
}

export function loadSettings(): LoadedSettings {
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      return { widgetPositions: {} };
    }

    const raw = fs.readFileSync(settingsPath, 'utf8');
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { widgetPositions: {} };
  }
}

function copyFileIfMissing(sourcePath: string, destinationPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(destinationPath)) {
    return;
  }

  ensureParentDirectory(destinationPath);
  fs.copyFileSync(sourcePath, destinationPath);
}

export function migrateLegacyUserData(): void {
  const userDataPath = app.getPath('userData');
  const appDataPath = app.getPath('appData');
  const settingsPath = getSettingsPath();
  const historyPath = getHistoryPath();

  for (const folderName of LEGACY_USER_DATA_FOLDERS) {
    const legacyPath = path.join(appDataPath, folderName);
    if (legacyPath === userDataPath || !fs.existsSync(legacyPath)) {
      continue;
    }

    copyFileIfMissing(path.join(legacyPath, 'settings.json'), settingsPath);
    copyFileIfMissing(path.join(legacyPath, 'history.json'), historyPath);

    if (fs.existsSync(settingsPath) || fs.existsSync(historyPath)) {
      return;
    }
  }
}

export function saveSettings(settings: AppSettings): void {
  const settingsPath = getSettingsPath();
  ensureParentDirectory(settingsPath);
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

export function loadHistory(): HistoryEntry[] {
  const historyPath = getHistoryPath();

  try {
    if (!fs.existsSync(historyPath)) {
      return [];
    }

    const raw = JSON.parse(fs.readFileSync(historyPath, 'utf8')) as { items?: unknown };
    const items = Array.isArray(raw.items) ? raw.items : [];
    return items
      .map((entry) => sanitizeHistoryEntry(entry))
      .filter((entry): entry is HistoryEntry => entry !== null)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  const historyPath = getHistoryPath();
  ensureParentDirectory(historyPath);
  fs.writeFileSync(
    historyPath,
    `${JSON.stringify({ items: entries.slice(0, HISTORY_LIMIT) }, null, 2)}\n`,
    'utf8'
  );
}

export function clearHistory(): void {
  const historyPath = getHistoryPath();

  try {
    if (fs.existsSync(historyPath)) {
      fs.unlinkSync(historyPath);
    }
  } catch {
    // Best-effort cleanup only.
  }
}
