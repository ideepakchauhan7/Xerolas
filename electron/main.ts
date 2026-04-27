import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  Tray
} from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import {
  type AnalysisResult,
  type AppRuntimeState,
  type AppSettings,
  DEFAULT_SETTINGS,
  type DisplaySnapshot,
  getQuickActionById,
  getQuickActionLabel,
  HISTORY_LIMIT,
  type HistoryEntry,
  type HistoryViewModel,
  type OverlayPayload,
  type QuickActionId,
  type Rect,
  type ResultStreamState,
  resolveQuickActionId,
  type SaveSettingsInput,
  type SaveSettingsResult,
  type SelectionPayload,
  type Size,
  type SettingsViewModel
} from '../src/shared/types';
import {
  type BackendSession,
  GatewayRequestError,
  requestSession,
  streamAnalyzeImage
} from './backend-client';
import { loadAppConfig } from './app-config';
import { assertRuntimeSecurity, verifyPackagedIntegrity } from './runtime-security';
import {
  clearHistory as clearStoredHistory,
  loadHistory,
  loadSettings,
  migrateLegacyUserData,
  saveHistory,
  saveSettings as persistSettings
} from './store';
import { createPerfSession, isPerfLoggingEnabled, perfMark, type PerfSession } from './perf';

app.setName('Xerolas');
app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const RENDERER_DIST = path.join(__dirname, '..', '..', 'dist');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const SHOW_FLOATING_WIDGET = false;
const TRANSPARENT_WINDOW_BACKGROUND = '#00000000';
const SHOULD_PREWARM_OVERLAY_WINDOW = process.platform !== 'linux';
const WIDGET_SIZE = { width: 164, height: 84 };
const RESULT_MIN_SIZE = { width: 440, height: 520 }; // keep landing-style inspector from clipping
const SETTINGS_WINDOW_SIZE = { width: 940, height: 820 };
const WINDOW_PREWARM_DELAY_MS = 180;
const LEGACY_DEFAULT_SHORTCUTS = new Set([
  'CommandOrControl+Shift+Space',
  'Control+Alt+PrintScreen',
  'Control+Alt+Space'
]);
const LEGACY_DESCRIBE_PROMPTS = new Set([
  'Describe what is shown in this screen region and highlight the most actionable details.'
]);
const LEGACY_CODE_DEFAULT_PROMPTS = new Set([
  getQuickActionById('code')?.prompt ?? ''
]);

const appWindows = {
  overlay: null as BrowserWindow | null,
  result: null as BrowserWindow | null,
  settings: null as BrowserWindow | null
};

let tray: Tray | null = null;
let isQuitting = false;
let settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  widgetPositions: { ...DEFAULT_SETTINGS.widgetPositions },
  resultWindowSize: { ...DEFAULT_SETTINGS.resultWindowSize }
};
let historyItems: HistoryEntry[] = [];
let latestAnalysis: AnalysisResult | null = null;
let currentResultStream: ResultStreamState | null = null;
let overlayPayload: OverlayPayload | null = null;
let shortcutRegistered = false;
let captureInProgress = false;
let lastError: string | null = null;
let backendBaseUrl = '';
let updateGithubOwner = '';
let updateGithubRepo = '';
let appManagedDefaults: Partial<Pick<AppSettings, 'quickActionId' | 'promptTemplate'>> = {};
let backendSession: BackendSession | null = null;
let backendSessionRequest: Promise<BackendSession> | null = null;
let activeCaptureSessionId: number | null = null;
let nextCaptureSessionId = 0;
let captureRestoreState: { settingsWasVisible: boolean } = {
  settingsWasVisible: false
};
const widgetWindows = new Map<string, BrowserWindow>();
const appPerfSession = createPerfSession('app');
let currentCapturePerfSession: PerfSession | null = null;
let widgetShownPerfLogged = false;
let resultWindowAutoResizeEnabled = false;
let settingResultWindowBounds = false;
const SESSION_REFRESH_BUFFER_MS = 60_000;

function toRect(input: Electron.Rectangle): Rect {
  return {
    x: Math.round(input.x),
    y: Math.round(input.y),
    width: Math.round(input.width),
    height: Math.round(input.height)
  };
}

function getDesktopBounds(displays: Electron.Display[]): Rect {
  const minX = Math.min(...displays.map((display) => display.bounds.x));
  const minY = Math.min(...displays.map((display) => display.bounds.y));
  const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function makeDisplayLabel(display: Electron.Display, index: number): string {
  return display.label?.trim() ? display.label.trim() : `Display ${index + 1}`;
}

function getWidgetDefaultBounds(display: Electron.Display): Rect {
  const x = display.workArea.x + display.workArea.width - WIDGET_SIZE.width - 22;
  const y = display.workArea.y + Math.max(18, Math.round(display.workArea.height * 0.22));
  return { x, y, width: WIDGET_SIZE.width, height: WIDGET_SIZE.height };
}

function clampWidgetBounds(display: Electron.Display, candidate: Rect): Rect {
  const workArea = display.workArea;
  const x = Math.min(
    Math.max(candidate.x, workArea.x),
    workArea.x + workArea.width - candidate.width
  );
  const y = Math.min(
    Math.max(candidate.y, workArea.y),
    workArea.y + workArea.height - candidate.height
  );

  return {
    x,
    y,
    width: candidate.width,
    height: candidate.height
  };
}

function getWidgetBoundsForDisplay(display: Electron.Display): Rect {
  const saved = settings.widgetPositions[String(display.id)];
  if (!saved) {
    return getWidgetDefaultBounds(display);
  }

  return clampWidgetBounds(display, {
    x: saved.x,
    y: saved.y,
    width: WIDGET_SIZE.width,
    height: WIDGET_SIZE.height
  });
}

function getSettingsBounds(): Rect {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const margin = 24;
  const width = Math.min(
    SETTINGS_WINDOW_SIZE.width,
    Math.max(560, display.workArea.width - margin * 2)
  );
  const height = Math.min(
    SETTINGS_WINDOW_SIZE.height,
    Math.max(700, display.workArea.height - margin * 2)
  );

  return {
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width,
    height
  };
}

function clampResultWindowSize(display: Electron.Display, requestedSize: Size): Size {
  const margin = 16;
  const maxWidth = Math.max(RESULT_MIN_SIZE.width, display.workArea.width - margin * 2);
  const maxHeight = Math.max(RESULT_MIN_SIZE.height, display.workArea.height - margin * 2);

  return {
    width: Math.min(Math.max(requestedSize.width, RESULT_MIN_SIZE.width), maxWidth),
    height: Math.min(Math.max(requestedSize.height, RESULT_MIN_SIZE.height), maxHeight)
  };
}

function persistResultWindowSize(nextSize: Size): void {
  if (
    settings.resultWindowSize.width === nextSize.width &&
    settings.resultWindowSize.height === nextSize.height
  ) {
    return;
  }

  settings = {
    ...settings,
    resultWindowSize: nextSize
  };
  persistSettings(settings);
}

function markAppPerf(step: string, details?: Record<string, unknown>): void {
  appPerfSession?.mark(step, details);
}

function markCapturePerf(step: string, details?: Record<string, unknown>): void {
  currentCapturePerfSession?.mark(step, details);
}

function setVisibleOnAllWorkspaces(window: BrowserWindow): void {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
}

function applyProductionWindowHardening(window: BrowserWindow): void {
  if (!app.isPackaged || DEV_SERVER_URL) {
    return;
  }

  window.webContents.on('devtools-opened', () => {
    window.webContents.closeDevTools();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

async function loadPage(
  window: BrowserWindow,
  page: 'widget' | 'overlay' | 'result' | 'settings',
  query: Record<string, string> = {}
): Promise<void> {
  if (DEV_SERVER_URL) {
    const url = new URL(`${DEV_SERVER_URL}/${page}.html`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    await window.loadURL(url.toString());
    return;
  }

  await window.loadFile(path.join(RENDERER_DIST, `${page}.html`), { query });
}

function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="10" y="10" width="44" height="44" rx="18" fill="#111111"/>
      <circle cx="23" cy="32" r="5" fill="#ffffff"/>
      <circle cx="41" cy="32" r="5" fill="#ffffff"/>
      <path d="M23 45c4.5-5.2 13.5-5.2 18 0" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/>
    </svg>
  `.trim();

  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );

  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }

  return image.resize({
    width: process.platform === 'darwin' ? 18 : 20,
    height: process.platform === 'darwin' ? 18 : 20
  });
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Xerolas');
  tray.on('double-click', () => {
    void startCaptureFlow();
  });
  tray.on('click', () => {
    void toggleResultWindow();
  });
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'Capture Screen Region',
      enabled: hasCaptureAccess(),
      click: () => {
        void startCaptureFlow();
      }
    },
    {
      label: latestAnalysis && appWindows.result?.isVisible() ? 'Hide Last Result' : 'Show Last Result',
      enabled: Boolean(latestAnalysis),
      click: () => {
        void toggleResultWindow();
      }
    },
    { type: 'separator' },
    {
      label: historyItems.length ? `History (${historyItems.length})` : 'History',
      enabled: Boolean(historyItems.length),
      click: () => {
        void showMostRecentHistoryResult();
      }
    },
    {
      label: 'Settings',
      click: () => {
        void openSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function buildRuntimeState(): AppRuntimeState {
  return {
    captureInProgress,
    captureReady: !getBackendConfigurationIssue(),
    accessMessage: getAccessMessage(),
    resultVisible: Boolean(appWindows.result?.isVisible()),
    hasResult: Boolean(latestAnalysis || currentResultStream),
    historyCount: historyItems.length,
    lastPreview: currentResultStream?.text.slice(0, 120) ?? latestAnalysis?.text.slice(0, 120) ?? '',
    lastError
  };
}

function buildHistoryViewModel(): HistoryViewModel {
  return {
    items: historyItems,
    limit: HISTORY_LIMIT
  };
}

function broadcastState(): void {
  const state = buildRuntimeState();

  widgetWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('state:update', state);
    }
  });

  [appWindows.result, appWindows.settings]
    .filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
    .forEach((window) => window.webContents.send('state:update', state));

  refreshTrayMenu();
}

function broadcastHistory(): void {
  const historyViewModel = buildHistoryViewModel();

  [appWindows.result, appWindows.settings, ...widgetWindows.values()]
    .filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
    .forEach((window) => window.webContents.send('history:update', historyViewModel));

  refreshTrayMenu();
}

function getActiveResultSelection(): SelectionPayload | null {
  return currentResultStream?.selection ?? latestAnalysis?.selection ?? null;
}

function broadcastResultStream(): void {
  [appWindows.result]
    .filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
    .forEach((window) => window.webContents.send('result:stream', currentResultStream));
}

function pushResultStreamState(nextState: ResultStreamState | null): void {
  currentResultStream = nextState;
  broadcastResultStream();
  broadcastState();
}

function broadcastActiveResult(): void {
  [appWindows.result]
    .filter((window): window is BrowserWindow => Boolean(window && !window.isDestroyed()))
    .forEach((window) => window.webContents.send('result:update', latestAnalysis));
}

function beginCaptureSession(): number {
  const captureSessionId = ++nextCaptureSessionId;
  activeCaptureSessionId = captureSessionId;
  return captureSessionId;
}

function endCaptureSession(): void {
  activeCaptureSessionId = null;
}

function isCaptureSessionActive(captureSessionId: number | null | undefined): boolean {
  return captureSessionId !== null && captureSessionId !== undefined && activeCaptureSessionId === captureSessionId;
}

async function clearActiveResultState(options: { hideWindow?: boolean } = {}): Promise<void> {
  latestAnalysis = null;
  resultWindowAutoResizeEnabled = false;
  broadcastActiveResult();
  pushResultStreamState(null);
  if (options.hideWindow !== false) {
    await hideResultWindow();
  }
}

async function dismissActiveCaptureSession(): Promise<void> {
  endCaptureSession();
  hideOverlayWindow();
  await clearActiveResultState();
}

function clearError(): void {
  lastError = null;
  broadcastState();
}

function setError(error: unknown): void {
  lastError = error instanceof Error ? error.message : String(error);
  broadcastState();
}

function getErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalizedMessage = rawMessage.trim().toLowerCase();
  if (
    normalizedMessage.includes('high demand') ||
    normalizedMessage.includes('resource_exhausted') ||
    normalizedMessage.includes('temporarily waiting for gemini capacity') ||
    normalizedMessage.includes('try again later')
  ) {
    return 'Xerolas is temporarily waiting for Gemini capacity. Please try again in a moment.';
  }

  return rawMessage;
}

function showCaptureFailure(error: unknown): void {
  dialog.showErrorBox('Xerolas Capture Failed', getErrorMessage(error));
}

function isLocalDevelopmentBackend(baseUrl: string): boolean {
  try {
    const parsedUrl = new URL(baseUrl);
    return (
      parsedUrl.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function getBackendConfigurationIssue(): string | null {
  if (!backendBaseUrl) {
    return 'This build is missing a backend gateway URL.';
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(backendBaseUrl);
  } catch {
    return 'The configured backend gateway URL is invalid.';
  }

  if (isLocalDevelopmentBackend(backendBaseUrl)) {
    return null;
  }

  if (parsedUrl.protocol !== 'https:') {
    return 'Remote backend communication requires HTTPS.';
  }

  return null;
}

function isBackendSessionFresh(session: BackendSession | null, nowMs = Date.now()): boolean {
  return Boolean(session && session.expiresAtMs - nowMs > SESSION_REFRESH_BUFFER_MS);
}

async function fetchBackendSession(forceRefresh = false): Promise<BackendSession> {
  if (!forceRefresh && isBackendSessionFresh(backendSession)) {
    return backendSession as BackendSession;
  }

  if (backendSessionRequest) {
    return backendSessionRequest;
  }

  backendSessionRequest = requestSession({
    backendBaseUrl,
    appVersion: app.getVersion(),
    platform: process.platform
  })
    .then((session) => {
      backendSession = session;
      return session;
    })
    .finally(() => {
      backendSessionRequest = null;
    });

  return backendSessionRequest;
}

async function warmBackendSession(): Promise<void> {
  if (getBackendConfigurationIssue()) {
    return;
  }

  try {
    await fetchBackendSession();
  } catch (error) {
    console.warn(
      'Backend session bootstrap failed:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function getAccessMessage(): string {
  const backendConfigurationIssue = getBackendConfigurationIssue();
  if (backendConfigurationIssue) {
    return backendConfigurationIssue;
  }

  return `Ready. Use ${settings.shortcut || DEFAULT_SETTINGS.shortcut} to capture a region.`;
}

function buildSettingsViewModel(): SettingsViewModel {
  return {
    settings,
    shortcutRegistered,
    backendConfigured: !getBackendConfigurationIssue(),
    backendBaseUrl: backendBaseUrl || null
  };
}

function configureAutoUpdater(): void {
  if (!app.isPackaged || !updateGithubOwner || !updateGithubRepo) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: updateGithubOwner,
    repo: updateGithubRepo,
    private: false
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-update check failed:', error);
  });

  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: 'An update is ready.',
      detail: 'The update was downloaded in the background and will install after restart.'
    });

    if (response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdatesAndNotify();
}

async function createWidgetWindow(display: Electron.Display): Promise<BrowserWindow> {
  const displayId = String(display.id);
  const bounds = getWidgetBoundsForDisplay(display);

  const widget = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: TRANSPARENT_WINDOW_BACKGROUND,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      devTools: Boolean(DEV_SERVER_URL)
    }
  });

  widget.removeMenu();
  widget.setContentProtection(true);
  applyProductionWindowHardening(widget);
  widget.setAlwaysOnTop(true, 'screen-saver');
  setVisibleOnAllWorkspaces(widget);

  widget.on('move', () => {
    const [x, y] = widget.getPosition();
    settings.widgetPositions[displayId] = { x, y };
    persistSettings(settings);
  });

  widget.on('closed', () => {
    widgetWindows.delete(displayId);
  });

  await loadPage(widget, 'widget', { displayId });
  widget.showInactive();
  if (!widgetShownPerfLogged) {
    widgetShownPerfLogged = true;
    markAppPerf('widget-shown', { displayId });
  }
  widgetWindows.set(displayId, widget);
  return widget;
}

async function syncWidgetWindows(): Promise<void> {
  if (!SHOW_FLOATING_WIDGET) {
    Array.from(widgetWindows.values()).forEach((window) => {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    widgetWindows.clear();
    broadcastState();
    return;
  }

  const displays = screen.getAllDisplays();
  const currentIds = new Set(displays.map((display) => String(display.id)));

  Array.from(widgetWindows.entries()).forEach(([displayId, window]) => {
    if (!currentIds.has(displayId)) {
      widgetWindows.delete(displayId);
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  for (const display of displays) {
    const displayId = String(display.id);
    const existing = widgetWindows.get(displayId);
    const nextBounds = getWidgetBoundsForDisplay(display);

    if (!existing || existing.isDestroyed()) {
      await createWidgetWindow(display);
      continue;
    }

    existing.setBounds(nextBounds, false);
    existing.setAlwaysOnTop(true, 'screen-saver');
    setVisibleOnAllWorkspaces(existing);
    if (!captureInProgress && !existing.isVisible()) {
      existing.showInactive();
    }
  }

  broadcastState();
  broadcastHistory();
}

function showWidgets(): void {
  if (!SHOW_FLOATING_WIDGET) {
    return;
  }

  widgetWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.showInactive();
      window.setAlwaysOnTop(true, 'screen-saver');
    }
  });
}

function hideWidgets(): void {
  if (!SHOW_FLOATING_WIDGET) {
    return;
  }

  widgetWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.hide();
    }
  });
}

function computeResultBounds(selection: Rect, preferredSize?: Size): Rect {
  const display = screen.getDisplayMatching({
    x: selection.x,
    y: selection.y,
    width: Math.max(selection.width, 1),
    height: Math.max(selection.height, 1)
  });

  const workArea = display.workArea;
  const margin = 16;
  const size = clampResultWindowSize(display, preferredSize ?? settings.resultWindowSize);
  const rightCandidate = selection.x + selection.width + margin;
  const leftCandidate = selection.x - size.width - margin;
  const workAreaRight = workArea.x + workArea.width;
  const x =
    rightCandidate + size.width <= workAreaRight - margin
      ? rightCandidate
      : leftCandidate >= workArea.x + margin
        ? leftCandidate
        : workAreaRight - size.width - margin;
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - size.height - margin;
  const y = Math.min(Math.max(selection.y, minY), maxY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(size.width),
    height: Math.round(size.height)
  };
}

function estimateAutoResultWindowSize(selection: SelectionPayload, text: string): Size {
  const display = screen.getDisplayMatching({
    x: selection.absoluteBounds.x,
    y: selection.absoluteBounds.y,
    width: Math.max(selection.absoluteBounds.width, 1),
    height: Math.max(selection.absoluteBounds.height, 1)
  });
  const visibleLength = text.replace(/\s+/g, ' ').trim().length;
  const estimatedLines = Math.max(8, Math.ceil(Math.max(visibleLength, 120) / 40));
  const width = Math.max(440, Math.min(620, Math.round(selection.absoluteBounds.width * 0.48) + 220));
  const height = Math.max(520, Math.min(Math.round(display.workArea.height * 0.84), 400 + estimatedLines * 20));

  return clampResultWindowSize(display, { width, height });
}

function maybeAutoResizeResultWindow(text: string, selection: SelectionPayload): void {
  if (!resultWindowAutoResizeEnabled || !appWindows.result || appWindows.result.isDestroyed()) {
    return;
  }

  const resultWindow = appWindows.result;
  if (resultWindow.isMinimized()) {
    return;
  }

  const nextSize = estimateAutoResultWindowSize(selection, text);
  const nextBounds = computeResultBounds(selection.absoluteBounds, nextSize);
  const currentBounds = resultWindow.getBounds();
  if (
    currentBounds.x === nextBounds.x &&
    currentBounds.y === nextBounds.y &&
    currentBounds.width === nextBounds.width &&
    currentBounds.height === nextBounds.height
  ) {
    return;
  }

  settingResultWindowBounds = true;
  try {
    resultWindow.setBounds(nextBounds, false);
  } finally {
    settingResultWindowBounds = false;
  }
}

async function ensureResultWindow(): Promise<BrowserWindow> {
  if (appWindows.result && !appWindows.result.isDestroyed()) {
    return appWindows.result;
  }

  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const initialSelection = getActiveResultSelection();
  const initialSize = clampResultWindowSize(activeDisplay, settings.resultWindowSize);
  const initialBounds = initialSelection
    ? computeResultBounds(
        initialSelection.absoluteBounds,
        currentResultStream ? estimateAutoResultWindowSize(initialSelection, currentResultStream.text) : undefined
      )
    : {
        x: activeDisplay.workArea.x + activeDisplay.workArea.width - initialSize.width - 16,
        y: activeDisplay.workArea.y + 16,
        width: initialSize.width,
        height: initialSize.height
      };

  const resultWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    frame: false,
    transparent: true,
    backgroundColor: TRANSPARENT_WINDOW_BACKGROUND,
    resizable: true,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    minimizable: true,
    maximizable: false,
    minWidth: RESULT_MIN_SIZE.width,
    minHeight: RESULT_MIN_SIZE.height,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: Boolean(DEV_SERVER_URL)
    }
  });

  resultWindow.removeMenu();
  resultWindow.setContentProtection(true);
  applyProductionWindowHardening(resultWindow);
  resultWindow.setAlwaysOnTop(true, 'screen-saver');
  setVisibleOnAllWorkspaces(resultWindow);
  resultWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      resultWindow.hide();
      broadcastState();
    }
  });
  resultWindow.on('closed', () => {
    appWindows.result = null;
  });
  resultWindow.on('resize', () => {
    if (resultWindow.isDestroyed() || resultWindow.isMinimized()) {
      return;
    }

    if (settingResultWindowBounds) {
      return;
    }

    resultWindowAutoResizeEnabled = false;
    persistResultWindowSize({
      width: resultWindow.getBounds().width,
      height: resultWindow.getBounds().height
    });
  });

  await loadPage(resultWindow, 'result');
  appWindows.result = resultWindow;
  return resultWindow;
}

async function showResultWindow(options: {
  reposition?: boolean;
  selection?: SelectionPayload;
  preferredSize?: Size;
  clearStream?: boolean;
} = {}): Promise<void> {
  const selection = options.selection ?? getActiveResultSelection();
  if (!selection) {
    return;
  }

  const resultWindow = await ensureResultWindow();
  if (resultWindow.isMinimized()) {
    resultWindow.restore();
  }
  if (options.reposition) {
    const bounds = computeResultBounds(selection.absoluteBounds, options.preferredSize);
    settingResultWindowBounds = true;
    try {
      resultWindow.setBounds(bounds, false);
    } finally {
      settingResultWindowBounds = false;
    }
  }
  resultWindow.webContents.send('result:update', latestAnalysis);
  resultWindow.webContents.send('history:update', buildHistoryViewModel());
  resultWindow.webContents.send('result:stream', options.clearStream ? null : currentResultStream);
  resultWindow.show();
  resultWindow.focus();
  markCapturePerf('result-window-shown', {
    width: resultWindow.getBounds().width,
    height: resultWindow.getBounds().height
  });
  broadcastState();
}

async function hideResultWindow(): Promise<void> {
  if (appWindows.result && !appWindows.result.isDestroyed()) {
    appWindows.result.hide();
  }
  broadcastState();
}

async function minimizeResultWindow(): Promise<void> {
  if (appWindows.result && !appWindows.result.isDestroyed()) {
    appWindows.result.minimize();
  }
  broadcastState();
}

async function toggleResultWindow(): Promise<void> {
  if (!latestAnalysis && !currentResultStream) {
    return;
  }

  if (appWindows.result?.isVisible()) {
    await hideResultWindow();
    return;
  }

  await showResultWindow();
}

async function ensureSettingsWindow(): Promise<BrowserWindow> {
  if (appWindows.settings && !appWindows.settings.isDestroyed()) {
    return appWindows.settings;
  }

  const settingsBounds = getSettingsBounds();
  const settingsWindow = new BrowserWindow({
    x: settingsBounds.x,
    y: settingsBounds.y,
    width: settingsBounds.width,
    height: settingsBounds.height,
    frame: false,
    transparent: true,
    backgroundColor: TRANSPARENT_WINDOW_BACKGROUND,
    resizable: true,
    minWidth: 640,
    minHeight: 760,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      devTools: Boolean(DEV_SERVER_URL)
    }
  });

  settingsWindow.removeMenu();
  applyProductionWindowHardening(settingsWindow);
  settingsWindow.setAlwaysOnTop(true, 'screen-saver');
  setVisibleOnAllWorkspaces(settingsWindow);
  settingsWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
  settingsWindow.on('closed', () => {
    appWindows.settings = null;
  });

  await loadPage(settingsWindow, 'settings');
  appWindows.settings = settingsWindow;
  return settingsWindow;
}

async function openSettingsWindow(): Promise<void> {
  const settingsWindow = await ensureSettingsWindow();
  const nextBounds = getSettingsBounds();
  settingsWindow.setBounds(nextBounds, false);
  settingsWindow.show();
  settingsWindow.focus();
}

function showSettingsWindowIfNeeded(): void {
  if (
    captureRestoreState.settingsWasVisible &&
    appWindows.settings &&
    !appWindows.settings.isDestroyed()
  ) {
    appWindows.settings.show();
  }
}

function hideSettingsWindow(): void {
  if (appWindows.settings && !appWindows.settings.isDestroyed()) {
    appWindows.settings.hide();
  }
}

function hasCaptureAccess(): boolean {
  return !getBackendConfigurationIssue();
}

function ensureMacScreenPermission(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'denied' || status === 'restricted') {
    throw new Error(
      'Screen recording permission is required on macOS. Enable it in System Settings > Privacy & Security > Screen & System Audio Recording, then relaunch the app.'
    );
  }
}

async function buildOverlayPayload(): Promise<OverlayPayload> {
  ensureMacScreenPermission();
  markCapturePerf('desktop-capture-requested');

  const displays = screen.getAllDisplays();
  const desktopBounds = getDesktopBounds(displays);
  const maxWidth = Math.max(
    ...displays.map((display) => Math.ceil(display.bounds.width * display.scaleFactor))
  );
  const maxHeight = Math.max(
    ...displays.map((display) => Math.ceil(display.bounds.height * display.scaleFactor))
  );

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: maxWidth,
      height: maxHeight
    }
  });

  if (!sources.length) {
    throw new Error('No desktop capture sources were returned by Electron.');
  }

  markCapturePerf('desktop-capture-ready', {
    displayCount: displays.length,
    sourceCount: sources.length
  });

  const matchedSnapshots = displays
    .map((display, index) => {
      const matchedSource = sources.find((source) => source.display_id === String(display.id));
      if (!matchedSource || matchedSource.thumbnail.isEmpty()) {
        return null;
      }

      return {
        id: String(display.id),
        label: makeDisplayLabel(display, index),
        bounds: toRect(display.bounds),
        workArea: toRect(display.workArea),
        scaleFactor: display.scaleFactor,
        imageDataUrl: matchedSource.thumbnail.toDataURL()
      } satisfies DisplaySnapshot;
    })
    .filter((snapshot): snapshot is DisplaySnapshot => Boolean(snapshot));

  if (matchedSnapshots.length === displays.length) {
    return {
      mode: 'per-display',
      desktopBounds,
      displays: matchedSnapshots,
      promptLabel: getQuickActionLabel(settings.quickActionId)
    };
  }

  const combinedSource = sources.find((source) => !source.thumbnail.isEmpty()) ?? sources[0];
  if (combinedSource.thumbnail.isEmpty()) {
    throw new Error('Electron returned an empty desktop thumbnail.');
  }

  return {
    mode: 'combined',
    desktopBounds,
    displays: displays.map((display, index) => ({
      id: String(display.id),
      label: makeDisplayLabel(display, index),
      bounds: toRect(display.bounds),
      workArea: toRect(display.workArea),
      scaleFactor: display.scaleFactor,
      imageDataUrl: ''
    })),
    combinedImageDataUrl: combinedSource.thumbnail.toDataURL(),
    promptLabel: getQuickActionLabel(settings.quickActionId)
  };
}

async function ensureOverlayWindow(): Promise<BrowserWindow> {
  if (appWindows.overlay && !appWindows.overlay.isDestroyed()) {
    return appWindows.overlay;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: TRANSPARENT_WINDOW_BACKGROUND,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    minimizable: false,
    maximizable: false,
    movable: false,
    show: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: Boolean(DEV_SERVER_URL)
    }
  });

  overlay.removeMenu();
  applyProductionWindowHardening(overlay);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  setVisibleOnAllWorkspaces(overlay);
  overlay.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      void cancelCapture();
    }
  });
  overlay.on('closed', () => {
    overlayPayload = null;
    appWindows.overlay = null;
  });

  await loadPage(overlay, 'overlay');
  appWindows.overlay = overlay;
  return overlay;
}

async function showOverlayWindow(payload: OverlayPayload): Promise<void> {
  const overlay = await ensureOverlayWindow();
  overlayPayload = payload;
  overlay.setBounds(payload.desktopBounds, false);
  overlay.webContents.send('overlay:update', payload);
  overlay.show();
  overlay.focus();
  markCapturePerf('overlay-window-shown', {
    width: payload.desktopBounds.width,
    height: payload.desktopBounds.height
  });
}

function hideOverlayWindow(): void {
  overlayPayload = null;
  if (appWindows.overlay && !appWindows.overlay.isDestroyed()) {
    appWindows.overlay.hide();
  }
}

function scaleCrop(selection: Rect, basis: Rect, imageSize: Electron.Size): Electron.Rectangle {
  const relativeX = selection.x - basis.x;
  const relativeY = selection.y - basis.y;
  const x = Math.max(0, Math.floor((relativeX / basis.width) * imageSize.width));
  const y = Math.max(0, Math.floor((relativeY / basis.height) * imageSize.height));
  const width = Math.max(1, Math.ceil((selection.width / basis.width) * imageSize.width));
  const height = Math.max(1, Math.ceil((selection.height / basis.height) * imageSize.height));

  return {
    x,
    y,
    width: Math.min(width, imageSize.width - x),
    height: Math.min(height, imageSize.height - y)
  };
}

function cropSelectionImage(payload: OverlayPayload, selection: SelectionPayload): Electron.NativeImage {
  if (payload.mode === 'combined') {
    if (!payload.combinedImageDataUrl) {
      throw new Error('The combined desktop capture is missing.');
    }

    const image = nativeImage.createFromDataURL(payload.combinedImageDataUrl);
    return image.crop(scaleCrop(selection.absoluteBounds, payload.desktopBounds, image.getSize()));
  }

  const snapshot = payload.displays.find((display) => display.id === selection.displayId);
  if (!snapshot) {
    throw new Error('The selected display could not be matched to a captured screen.');
  }

  const image = nativeImage.createFromDataURL(snapshot.imageDataUrl);
  return image.crop(scaleCrop(selection.absoluteBounds, snapshot.bounds, image.getSize()));
}

function appendHistoryEntry(entry: HistoryEntry): void {
  historyItems = [entry, ...historyItems.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
  saveHistory(historyItems);
  broadcastHistory();
  broadcastState();
}

async function shareLatestResult(): Promise<void> {
  if (!latestAnalysis) {
    return;
  }

  clipboard.write({
    text: latestAnalysis.text,
    image: nativeImage.createFromDataURL(latestAnalysis.imageDataUrl)
  });
}

async function showHistoryEntry(id: string): Promise<void> {
  const entry = historyItems.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  latestAnalysis = entry;
  pushResultStreamState(null);
  clearError();
  await showResultWindow({ clearStream: true });
}

async function showMostRecentHistoryResult(): Promise<void> {
  if (!historyItems.length) {
    return;
  }

  latestAnalysis = historyItems[0];
  pushResultStreamState(null);
  clearError();
  await showResultWindow({ clearStream: true });
}

async function clearHistoryEntries(): Promise<void> {
  historyItems = [];
  clearStoredHistory();
  if (!latestAnalysis) {
    broadcastHistory();
    broadcastState();
    return;
  }

  broadcastHistory();
  broadcastState();
}

function applyQuickActionSelection(nextQuickActionId: QuickActionId | undefined): void {
  if (!nextQuickActionId || nextQuickActionId === settings.quickActionId) {
    return;
  }

  const presetPrompt = getQuickActionById(nextQuickActionId)?.prompt;
  settings = {
    ...settings,
    quickActionId: nextQuickActionId,
    promptTemplate: presetPrompt || settings.promptTemplate
  };
  persistSettings(settings);
}

function resolvePromptTemplateForQuickAction(
  quickActionId: QuickActionId,
  fallbackPromptTemplate: string
): string {
  return getQuickActionById(quickActionId)?.prompt ?? fallbackPromptTemplate;
}

function toPngBytes(imageDataUrl: string): Uint8Array {
  return nativeImage.createFromDataURL(imageDataUrl).toPNG();
}

async function analyzeExistingImage(
  imageDataUrl: string,
  imageBytes: Uint8Array,
  selection: SelectionPayload,
  quickActionId: QuickActionId,
  fallbackPromptTemplate: string,
  captureSessionId: number,
  options: { repositionResult?: boolean } = {}
): Promise<void> {
  const backendConfigurationIssue = getBackendConfigurationIssue();
  if (backendConfigurationIssue) {
    throw new Error(backendConfigurationIssue);
  }

  const promptTemplate = resolvePromptTemplateForQuickAction(quickActionId, fallbackPromptTemplate);
  if (!isCaptureSessionActive(captureSessionId)) {
    return;
  }

  const initialStreamState: ResultStreamState = {
    status: 'loading',
    quickActionId,
    text: '',
    message: 'Xerolas is analyzing this capture…',
    selection
  };
  resultWindowAutoResizeEnabled = Boolean(options.repositionResult);
  pushResultStreamState(initialStreamState);
  await showResultWindow({
    reposition: options.repositionResult,
    selection,
    preferredSize: estimateAutoResultWindowSize(selection, ''),
    clearStream: false
  });

  let session = await fetchBackendSession();
  markCapturePerf('backend-request-start', {
    quickActionId,
    bytes: imageBytes.byteLength
  });

  const startStream = async (sessionToken: string) =>
    streamAnalyzeImage(
      {
        backendBaseUrl,
        quickActionId,
        promptTemplate,
        imageBytes,
        appVersion: app.getVersion(),
        platform: process.platform,
        sessionToken
      },
      {
        onMeta: ({ model, usedFallback }) => {
          if (!isCaptureSessionActive(captureSessionId)) {
            return;
          }

          markCapturePerf('backend-stream-meta', {
            model,
            usedFallback
          });
        },
        onDelta: ({ text }) => {
          if (!isCaptureSessionActive(captureSessionId)) {
            return;
          }

          pushResultStreamState({
            status: 'streaming',
            quickActionId,
            text,
            message: null,
            selection
          });
          maybeAutoResizeResultWindow(text, selection);
        }
      }
    );

  let analysis: Awaited<ReturnType<typeof streamAnalyzeImage>>;
  try {
    analysis = await startStream(session.token);
  } catch (error) {
    if (error instanceof GatewayRequestError && error.status === 401) {
      session = await fetchBackendSession(true);
      analysis = await startStream(session.token);
    } else {
      if (!isCaptureSessionActive(captureSessionId)) {
        return;
      }

      pushResultStreamState({
        status: 'error',
        quickActionId,
        text: '',
        message: getErrorMessage(error),
        selection
      });
      throw error;
    }
  }

  if (!isCaptureSessionActive(captureSessionId)) {
    return;
  }

  markCapturePerf('backend-request-complete', {
    model: analysis.model,
    usedFallback: analysis.usedFallback
  });

  latestAnalysis = {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    provider: analysis.provider,
    model: analysis.model,
    usedFallback: analysis.usedFallback,
    groundingUsed: analysis.groundingUsed,
    sources: analysis.sources,
    quickActionId,
    promptTemplate,
    text: analysis.text,
    imageDataUrl,
    selection
  };

  appendHistoryEntry(latestAnalysis);
  clearError();
  currentResultStream = null;
  resultWindowAutoResizeEnabled = false;
  await showResultWindow({ selection, clearStream: true });
  broadcastResultStream();
  broadcastState();
}

async function finalizeCapture(selection: SelectionPayload, captureSessionId: number): Promise<void> {
  const activeOverlayPayload = overlayPayload;
  if (!activeOverlayPayload) {
    throw new Error('No active capture session was found.');
  }

  const croppedImage = cropSelectionImage(activeOverlayPayload, selection);
  const imageBytes = croppedImage.toPNG();
  const imageDataUrl = croppedImage.toDataURL();
  markCapturePerf('crop-complete', {
    width: selection.absoluteBounds.width,
    height: selection.absoluteBounds.height,
    bytes: imageBytes.byteLength
  });

  const backendConfigurationIssue = getBackendConfigurationIssue();
  if (backendConfigurationIssue) {
    throw new Error(backendConfigurationIssue);
  }

  await analyzeExistingImage(
    imageDataUrl,
    imageBytes,
    selection,
    settings.quickActionId,
    settings.promptTemplate,
    captureSessionId,
    { repositionResult: true }
  );
}

async function rerunLatestAnalysis(nextQuickActionId: QuickActionId): Promise<void> {
  if (!latestAnalysis) {
    return;
  }

  currentCapturePerfSession = createPerfSession(`rerun:${Date.now()}`);
  captureInProgress = true;
  broadcastState();

  try {
    markCapturePerf('triggered', {
      quickActionId: nextQuickActionId
    });
    const captureSessionId = activeCaptureSessionId ?? beginCaptureSession();
    await analyzeExistingImage(
      latestAnalysis.imageDataUrl,
      toPngBytes(latestAnalysis.imageDataUrl),
      latestAnalysis.selection,
      nextQuickActionId,
      latestAnalysis.promptTemplate,
      captureSessionId
    );
  } catch (error) {
    setError(error);
    showCaptureFailure(error);
  } finally {
    captureInProgress = false;
    broadcastState();
    currentCapturePerfSession = null;
  }
}

async function cancelCapture(): Promise<void> {
  await dismissActiveCaptureSession();

  captureInProgress = false;
  showWidgets();
  showSettingsWindowIfNeeded();
  broadcastState();
  currentCapturePerfSession = null;
}

async function startCaptureFlow(nextQuickActionId?: QuickActionId): Promise<void> {
  if (captureInProgress) {
    return;
  }

  currentCapturePerfSession = createPerfSession(`capture:${Date.now()}`);

  applyQuickActionSelection(nextQuickActionId);
  markCapturePerf('triggered', {
    quickActionId: nextQuickActionId ?? settings.quickActionId
  });

  if (!hasCaptureAccess()) {
    setError(getAccessMessage());
    currentCapturePerfSession = null;
    return;
  }

  clearError();
  await dismissActiveCaptureSession();
  captureInProgress = true;
  captureRestoreState = {
    settingsWasVisible: Boolean(appWindows.settings?.isVisible())
  };

  hideWidgets();
  hideSettingsWindow();
  const captureSessionId = beginCaptureSession();

  try {
    overlayPayload = await buildOverlayPayload();
    if (!isCaptureSessionActive(captureSessionId)) {
      return;
    }

    await showOverlayWindow(overlayPayload);
  } catch (error) {
    endCaptureSession();
    captureInProgress = false;
    showWidgets();
    showSettingsWindowIfNeeded();
    setError(error);
    showCaptureFailure(error);
    currentCapturePerfSession = null;
  }
}

async function prewarmSecondaryWindows(): Promise<void> {
  markAppPerf('window-prewarm-start', {
    overlayPrewarmed: SHOULD_PREWARM_OVERLAY_WINDOW
  });

  const prewarmTasks: Array<Promise<BrowserWindow>> = [ensureResultWindow(), ensureSettingsWindow()];
  if (SHOULD_PREWARM_OVERLAY_WINDOW) {
    prewarmTasks.push(ensureOverlayWindow());
  }

  await Promise.all(prewarmTasks);
  markAppPerf('window-prewarm-complete');
}

function registerShortcut(nextShortcut: string): boolean {
  globalShortcut.unregisterAll();

  if (!nextShortcut.trim()) {
    shortcutRegistered = false;
    return true;
  }

  shortcutRegistered = globalShortcut.register(nextShortcut, () => {
    void startCaptureFlow();
  });

  return shortcutRegistered;
}

async function saveSettingsPatch(patch: SaveSettingsInput): Promise<SaveSettingsResult> {
  const previousQuickActionId = settings.quickActionId;
  const trimmedPromptTemplate = patch.promptTemplate?.trim();
  const requestedQuickActionId =
    patch.quickActionId !== undefined
      ? patch.quickActionId
      : patch.promptTemplate !== undefined
        ? resolveQuickActionId(trimmedPromptTemplate || settings.promptTemplate)
        : settings.quickActionId;
  const presetPrompt = getQuickActionById(requestedQuickActionId)?.prompt;
  const nextPromptTemplate =
    patch.promptTemplate !== undefined
      ? trimmedPromptTemplate || presetPrompt || DEFAULT_SETTINGS.promptTemplate
      : patch.quickActionId !== undefined
        ? presetPrompt || settings.promptTemplate
        : settings.promptTemplate;
  const normalizedQuickActionId: QuickActionId =
    patch.promptTemplate !== undefined
      ? resolveQuickActionId(nextPromptTemplate)
      : requestedQuickActionId;
  const nextSettings: AppSettings = {
    ...settings,
    quickActionId: normalizedQuickActionId,
    promptTemplate: nextPromptTemplate,
    shortcut: patch.shortcut !== undefined ? patch.shortcut.trim() : settings.shortcut,
    widgetPositions: patch.widgetPositions ?? settings.widgetPositions
  };

  if (patch.shortcut !== undefined && patch.shortcut !== settings.shortcut) {
    const registered = registerShortcut(nextSettings.shortcut);
    if (!registered) {
      registerShortcut(settings.shortcut);
      return {
        success: false,
        message: `The shortcut "${nextSettings.shortcut}" could not be registered on this system.`,
        settings,
        shortcutRegistered,
        backendConfigured: !getBackendConfigurationIssue(),
        backendBaseUrl: backendBaseUrl || null
      };
    }
  }

  settings = nextSettings;
  persistSettings(settings);
  broadcastState();

  const messageParts: string[] = ['Settings saved.'];
  if (previousQuickActionId !== normalizedQuickActionId) {
    messageParts.push(`Quick action set to ${getQuickActionLabel(normalizedQuickActionId)}.`);
  }

  return {
    success: true,
    message: messageParts.join(' '),
    settings,
    shortcutRegistered,
    backendConfigured: !getBackendConfigurationIssue(),
    backendBaseUrl: backendBaseUrl || null
  };
}

function installIpcHandlers(): void {
  ipcMain.handle('state:get', () => buildRuntimeState());
  ipcMain.handle('capture:start', async (_event, quickActionId?: QuickActionId) => {
    await startCaptureFlow(quickActionId);
  });
  ipcMain.handle('result:toggle', async () => {
    await toggleResultWindow();
  });
  ipcMain.handle('result:collapse', async () => {
    await hideResultWindow();
  });
  ipcMain.handle('result:minimize', async () => {
    await minimizeResultWindow();
  });
  ipcMain.handle('external:open', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.trim()) {
      return;
    }

    let target: URL;
    try {
      target = new URL(url.trim());
    } catch {
      return;
    }

    if (!['https:', 'http:'].includes(target.protocol)) {
      return;
    }

    await shell.openExternal(target.toString());
  });
  ipcMain.handle('result:share', async () => {
    await shareLatestResult();
  });
  ipcMain.handle('result:rerun', async (_event, quickActionId: QuickActionId) => {
    await rerunLatestAnalysis(quickActionId);
  });
  ipcMain.handle('result:get', () => latestAnalysis);
  ipcMain.handle('result:stream:get', () => currentResultStream);
  ipcMain.handle('history:get', () => buildHistoryViewModel());
  ipcMain.handle('history:select', async (_event, id: string) => {
    await showHistoryEntry(id);
  });
  ipcMain.handle('history:clear', async () => {
    await clearHistoryEntries();
  });
  ipcMain.handle('settings:open', async () => {
    await openSettingsWindow();
  });
  ipcMain.handle('settings:get', () => buildSettingsViewModel());
  ipcMain.handle('settings:save', async (_event, patch: SaveSettingsInput) =>
    saveSettingsPatch(patch)
  );
  ipcMain.handle('overlay:getPayload', () => overlayPayload);
  ipcMain.handle('overlay:cancel', async () => {
    await cancelCapture();
  });
  ipcMain.handle('overlay:submit', async (_event, selection: SelectionPayload) => {
    try {
      markCapturePerf('selection-submitted', {
        width: selection.absoluteBounds.width,
        height: selection.absoluteBounds.height
      });
      const captureSessionId = activeCaptureSessionId;
      if (captureSessionId === null) {
        return;
      }

      await finalizeCapture(selection, captureSessionId);
    } catch (error) {
      showSettingsWindowIfNeeded();
      setError(error);
      showCaptureFailure(error);
    } finally {
      captureInProgress = false;
      broadcastState();
      currentCapturePerfSession = null;
    }
  });
}

app.on('second-instance', () => {
  void syncWidgetWindows();
  if (latestAnalysis || currentResultStream) {
    void showResultWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.exit(0);
  }
});

app.whenReady().then(async () => {
  markAppPerf('app-ready', {
    packaged: app.isPackaged,
    perfLogging: isPerfLoggingEnabled()
  });
  try {
    assertRuntimeSecurity();
    if (app.isPackaged) {
      verifyPackagedIntegrity(process.resourcesPath);
    }
  } catch (error) {
    isQuitting = true;
    dialog.showErrorBox(
      'Xerolas Security Check Failed',
      error instanceof Error ? error.message : 'Startup security validation failed.'
    );
    app.exit(1);
    return;
  }

  const appConfig = loadAppConfig();
  backendBaseUrl = appConfig?.backendBaseUrl ?? '';
  updateGithubOwner = appConfig?.updateGithubOwner ?? '';
  updateGithubRepo = appConfig?.updateGithubRepo ?? '';
  appManagedDefaults = {
    quickActionId: appConfig?.defaultQuickActionId,
    promptTemplate: appConfig?.defaultPromptTemplate
  };

  migrateLegacyUserData();
  const loadedSettings = loadSettings();
  const rawInitialPromptTemplate =
    loadedSettings.promptTemplate ??
    appManagedDefaults.promptTemplate ??
    DEFAULT_SETTINGS.promptTemplate;
  const migratedQuickActionId =
    loadedSettings.quickActionId === 'code' ? DEFAULT_SETTINGS.quickActionId : loadedSettings.quickActionId;
  const shortcut = LEGACY_DEFAULT_SHORTCUTS.has(loadedSettings.shortcut ?? '')
    ? DEFAULT_SETTINGS.shortcut
    : loadedSettings.shortcut ?? DEFAULT_SETTINGS.shortcut;
  const quickActionId =
    migratedQuickActionId ??
    appManagedDefaults.quickActionId ??
    resolveQuickActionId(rawInitialPromptTemplate);
  const shouldResetToDefaultDescribePrompt =
    quickActionId === 'describe' &&
    (LEGACY_DESCRIBE_PROMPTS.has(rawInitialPromptTemplate) ||
      (loadedSettings.quickActionId === 'code' &&
        (!loadedSettings.promptTemplate || LEGACY_CODE_DEFAULT_PROMPTS.has(rawInitialPromptTemplate))));
  const initialPromptTemplate = shouldResetToDefaultDescribePrompt
    ? DEFAULT_SETTINGS.promptTemplate
    : rawInitialPromptTemplate;

  const migratedResultWindowSize = loadedSettings.resultWindowSize
    ? {
        width: Math.max(loadedSettings.resultWindowSize.width, DEFAULT_SETTINGS.resultWindowSize.width),
        height: Math.max(loadedSettings.resultWindowSize.height, DEFAULT_SETTINGS.resultWindowSize.height)
      }
    : DEFAULT_SETTINGS.resultWindowSize;

  settings = {
    ...DEFAULT_SETTINGS,
    ...appManagedDefaults,
    ...loadedSettings,
    quickActionId,
    promptTemplate: initialPromptTemplate,
    shortcut,
    widgetPositions: loadedSettings.widgetPositions,
    resultWindowSize: migratedResultWindowSize
  };

  if (
    loadedSettings.shortcut !== undefined && loadedSettings.shortcut !== shortcut ||
    loadedSettings.quickActionId !== undefined && loadedSettings.quickActionId !== quickActionId ||
    loadedSettings.promptTemplate !== undefined && loadedSettings.promptTemplate !== initialPromptTemplate ||
    !loadedSettings.resultWindowSize ||
    loadedSettings.resultWindowSize.width < DEFAULT_SETTINGS.resultWindowSize.width ||
    loadedSettings.resultWindowSize.height < DEFAULT_SETTINGS.resultWindowSize.height
  ) {
    persistSettings(settings);
  }

  historyItems = loadHistory();
  latestAnalysis = null;
  markAppPerf('state-loaded', {
    historyCount: historyItems.length
  });

  registerShortcut(settings.shortcut);
  void warmBackendSession();
  installIpcHandlers();
  createTray();
  configureAutoUpdater();
  await syncWidgetWindows();
  broadcastHistory();
  markAppPerf('widgets-synced', {
    widgetCount: widgetWindows.size
  });
  setTimeout(() => {
    void prewarmSecondaryWindows().catch((error) => {
      perfMark('window-prewarm-error', {
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }, WINDOW_PREWARM_DELAY_MS);

  screen.on('display-added', () => {
    void syncWidgetWindows();
  });

  screen.on('display-removed', () => {
    void syncWidgetWindows();
  });

  screen.on('display-metrics-changed', () => {
    void syncWidgetWindows();
  });

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
});
