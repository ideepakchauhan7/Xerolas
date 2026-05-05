import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnalysisResult,
  AppRuntimeState,
  AskQuestionState,
  DesktopAssistantApi,
  HistoryViewModel,
  OverlayPayload,
  AiProviderId,
  ProviderKeySaveInput,
  ProviderKeyTestInput,
  ProviderKeyActionResult,
  QuickActionId,
  ResultStreamState,
  SaveSettingsInput,
  SaveSettingsResult,
  SelectionPayload,
  SettingsViewModel
} from '../src/shared/types';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrappedListener = (_event: Electron.IpcRendererEvent, value: T) => {
    listener(value);
  };

  ipcRenderer.on(channel, wrappedListener);
  return () => {
    ipcRenderer.removeListener(channel, wrappedListener);
  };
}

const api: DesktopAssistantApi = {
  getAppState: () => ipcRenderer.invoke('state:get') as Promise<AppRuntimeState>,
  onAppState: (listener) => subscribe<AppRuntimeState>('state:update', listener),
  requestCapture: (quickActionId?: QuickActionId) =>
    ipcRenderer.invoke('capture:start', quickActionId) as Promise<void>,
  rerunResult: (quickActionId: QuickActionId) =>
    ipcRenderer.invoke('result:rerun', quickActionId) as Promise<void>,
  getAskQuestionState: () =>
    ipcRenderer.invoke('ask-question:get') as Promise<AskQuestionState>,
  onAskQuestionState: (listener) =>
    subscribe<AskQuestionState>('ask-question:update', listener),
  openAskQuestionComposer: () =>
    ipcRenderer.invoke('ask-question:open') as Promise<void>,
  closeAskQuestionComposer: () =>
    ipcRenderer.invoke('ask-question:close') as Promise<void>,
  updateAskQuestionDraft: (questionText: string) =>
    ipcRenderer.invoke('ask-question:update', questionText) as Promise<void>,
  submitAskQuestion: (questionText: string) =>
    ipcRenderer.invoke('ask-question:submit', questionText) as Promise<void>,
  toggleResult: () => ipcRenderer.invoke('result:toggle') as Promise<void>,
  collapseResult: () => ipcRenderer.invoke('result:collapse') as Promise<void>,
  minimizeResult: () => ipcRenderer.invoke('result:minimize') as Promise<void>,
  openExternalLink: (url: string) => ipcRenderer.invoke('external:open', url) as Promise<void>,
  shareResult: () => ipcRenderer.invoke('result:share') as Promise<void>,
  openSettings: () => ipcRenderer.invoke('settings:open') as Promise<void>,
  getOverlayPayload: () =>
    ipcRenderer.invoke('overlay:getPayload') as Promise<OverlayPayload | null>,
  onOverlayPayload: (listener) => subscribe<OverlayPayload>('overlay:update', listener),
  submitSelection: (selection) =>
    ipcRenderer.invoke('overlay:submit', selection) as Promise<void>,
  cancelSelection: () => ipcRenderer.invoke('overlay:cancel') as Promise<void>,
  getResult: () => ipcRenderer.invoke('result:get') as Promise<AnalysisResult | null>,
  onResult: (listener) => subscribe<AnalysisResult | null>('result:update', listener),
  getResultOverflowEnabled: () => ipcRenderer.invoke('result:overflow:get') as Promise<boolean>,
  onResultOverflowEnabled: (listener) => subscribe<boolean>('result:overflow:update', listener),
  getResultStream: () =>
    ipcRenderer.invoke('result:stream:get') as Promise<ResultStreamState | null>,
  onResultStream: (listener) =>
    subscribe<ResultStreamState | null>('result:stream', listener),
  reportResultLayoutHeight: (height: number) => {
    ipcRenderer.send('result:layout-height', height);
  },
  getHistory: () => ipcRenderer.invoke('history:get') as Promise<HistoryViewModel>,
  onHistory: (listener) => subscribe<HistoryViewModel>('history:update', listener),
  selectHistoryEntry: (id) => ipcRenderer.invoke('history:select', id) as Promise<void>,
  clearHistory: () => ipcRenderer.invoke('history:clear') as Promise<void>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<SettingsViewModel>,
  saveSettings: (patch: SaveSettingsInput) =>
    ipcRenderer.invoke('settings:save', patch) as Promise<SaveSettingsResult>,
  saveProviderKey: (input: ProviderKeySaveInput) =>
    ipcRenderer.invoke('provider-key:save', input) as Promise<ProviderKeyActionResult>,
  clearProviderKey: (provider: AiProviderId) =>
    ipcRenderer.invoke('provider-key:clear', provider) as Promise<ProviderKeyActionResult>,
  testProviderConnection: (input: ProviderKeyTestInput) =>
    ipcRenderer.invoke('provider-key:test', input) as Promise<ProviderKeyActionResult>
};

contextBridge.exposeInMainWorld('desktopAssistant', api);

declare global {
  interface Window {
    desktopAssistant: DesktopAssistantApi;
  }
}
