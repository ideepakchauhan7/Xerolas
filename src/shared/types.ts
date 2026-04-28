export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface DisplaySnapshot {
  id: string;
  label: string;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
  imageDataUrl: string;
}

export interface OverlayPayload {
  mode: 'per-display' | 'combined';
  desktopBounds: Rect;
  displays: DisplaySnapshot[];
  combinedImageDataUrl?: string;
  promptLabel: string;
}

export interface SelectionPayload {
  displayId: string;
  absoluteBounds: Rect;
}

export type QuickActionId =
  | 'describe'
  | 'extract'
  | 'code'
  | 'translate'
  | 'summarize'
  | 'ask'
  | 'custom';

export interface QuickActionPreset {
  id: Exclude<QuickActionId, 'custom'>;
  label: string;
  description: string;
  prompt: string;
}

export interface SourceLink {
  title: string;
  url: string;
  host: string;
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  groundingUsed: boolean;
  sources: SourceLink[];
  quickActionId: QuickActionId;
  promptTemplate: string;
  text: string;
  imageDataUrl: string;
  selection: SelectionPayload;
}

export interface HistoryEntry extends AnalysisResult {}

export interface HistoryViewModel {
  items: HistoryEntry[];
  limit: number;
}

export interface ResultStreamState {
  status: 'loading' | 'streaming' | 'error';
  quickActionId: QuickActionId;
  text: string;
  message: string | null;
  selection: SelectionPayload | null;
}

export interface WidgetPositionMap {
  [displayId: string]: Point;
}

export interface AppSettings {
  quickActionId: QuickActionId;
  promptTemplate: string;
  shortcut: string;
  widgetPositions: WidgetPositionMap;
  resultWindowSize: Size;
}

export interface AppRuntimeState {
  captureInProgress: boolean;
  captureReady: boolean;
  accessMessage: string;
  resultVisible: boolean;
  hasResult: boolean;
  historyCount: number;
  lastPreview: string;
  lastError: string | null;
}

export interface SettingsViewModel {
  settings: AppSettings;
  shortcutRegistered: boolean;
  backendConfigured: boolean;
  backendBaseUrl: string | null;
}

export interface SaveSettingsResult {
  success: boolean;
  message: string;
  settings: AppSettings;
  shortcutRegistered: boolean;
  backendConfigured: boolean;
  backendBaseUrl: string | null;
}

export interface SaveSettingsInput {
  quickActionId?: QuickActionId;
  promptTemplate?: string;
  shortcut?: string;
  widgetPositions?: WidgetPositionMap;
}

export interface DesktopAssistantApi {
  getAppState: () => Promise<AppRuntimeState>;
  onAppState: (listener: (state: AppRuntimeState) => void) => () => void;
  requestCapture: (quickActionId?: QuickActionId) => Promise<void>;
  rerunResult: (quickActionId: QuickActionId) => Promise<void>;
  toggleResult: () => Promise<void>;
  collapseResult: () => Promise<void>;
  minimizeResult: () => Promise<void>;
  openExternalLink: (url: string) => Promise<void>;
  shareResult: () => Promise<void>;
  openSettings: () => Promise<void>;
  getOverlayPayload: () => Promise<OverlayPayload | null>;
  onOverlayPayload: (listener: (payload: OverlayPayload) => void) => () => void;
  submitSelection: (selection: SelectionPayload) => Promise<void>;
  cancelSelection: () => Promise<void>;
  getResult: () => Promise<AnalysisResult | null>;
  onResult: (listener: (result: AnalysisResult | null) => void) => () => void;
  getResultOverflowEnabled: () => Promise<boolean>;
  onResultOverflowEnabled: (listener: (enabled: boolean) => void) => () => void;
  getResultStream: () => Promise<ResultStreamState | null>;
  onResultStream: (listener: (result: ResultStreamState | null) => void) => () => void;
  reportResultLayoutHeight: (height: number) => void;
  getHistory: () => Promise<HistoryViewModel>;
  onHistory: (listener: (history: HistoryViewModel) => void) => () => void;
  selectHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  getSettings: () => Promise<SettingsViewModel>;
  saveSettings: (patch: SaveSettingsInput) => Promise<SaveSettingsResult>;
}

export const QUICK_ACTIONS: QuickActionPreset[] = [
  {
    id: 'describe',
    label: 'Describe',
    description: 'Answer the most useful question visible in the capture.',
    prompt:
      'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.'
  },
  {
    id: 'extract',
    label: 'Extract text',
    description: 'Read and structure visible text cleanly.',
    prompt:
      'Extract all readable text from this image. Preserve headings, bullets, labels, values, and short line breaks when possible.'
  },
  {
    id: 'code',
    label: 'Explain code',
    description: 'Explain code, errors, or technical UI visible in the capture.',
    prompt:
      'Explain the code, terminal output, or technical UI visible in this screenshot. Focus on what it means, likely issues, and the most useful next steps.'
  },
  {
    id: 'translate',
    label: 'Translate',
    description: 'Translate visible text into natural English.',
    prompt:
      'Translate any visible text into natural English and preserve important formatting cues when possible.'
  },
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Compress the selected region into a short, useful summary.',
    prompt:
      'Summarize the key points visible in this selected region in a short, clear way. Focus on what matters most to the user.'
  },
  {
    id: 'ask',
    label: 'Ask question',
    description: 'Answer the most useful question implied by the selected screen region.',
    prompt:
      'Answer the most useful question a person would likely ask about this screenshot. Be direct, practical, and reference what is visible.'
  }
];

export const DEFAULT_QUICK_ACTION_ID: QuickActionId = 'describe';

export const DEFAULT_PROMPT_TEMPLATE =
  QUICK_ACTIONS.find((preset) => preset.id === DEFAULT_QUICK_ACTION_ID)?.prompt ??
  'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.';

export const DEFAULT_SHORTCUT = 'Control+Shift+Space';
export const HISTORY_LIMIT = 10;

export function getQuickActionById(id: QuickActionId | null | undefined): QuickActionPreset | null {
  if (!id || id === 'custom') {
    return null;
  }

  return QUICK_ACTIONS.find((preset) => preset.id === id) ?? null;
}

export function getQuickActionLabel(id: QuickActionId | null | undefined): string {
  return getQuickActionById(id)?.label ?? 'Custom';
}

export function resolveQuickActionId(promptTemplate: string): QuickActionId {
  const normalizedPrompt = promptTemplate.trim();
  if (!normalizedPrompt) {
    return DEFAULT_QUICK_ACTION_ID;
  }

  return QUICK_ACTIONS.find((preset) => preset.prompt === normalizedPrompt)?.id ?? 'custom';
}

export const DEFAULT_SETTINGS: AppSettings = {
  quickActionId: DEFAULT_QUICK_ACTION_ID,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  shortcut: DEFAULT_SHORTCUT,
  widgetPositions: {},
  resultWindowSize: {
    width: 340,
    height: 252
  }
};
