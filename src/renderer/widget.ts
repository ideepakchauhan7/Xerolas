import type { AppRuntimeState } from '../shared/types';

const captureTrigger = document.getElementById('capture-trigger') as HTMLButtonElement;
const toggleResultButton = document.getElementById('toggle-result') as HTMLButtonElement;
const openSettingsButton = document.getElementById('open-settings') as HTMLButtonElement;

function renderState(state: AppRuntimeState): void {
  if (state.captureInProgress) {
    captureTrigger.title = 'Selecting or analyzing…';
    return;
  }

  if (state.lastError) {
    captureTrigger.title = state.lastError;
    return;
  }

  if (!state.captureReady) {
    captureTrigger.title = state.accessMessage;
    return;
  }

  if (state.hasResult) {
    captureTrigger.title = state.resultVisible ? 'Result panel is open' : 'Open the latest result';
    return;
  }

  captureTrigger.title = 'Double-click to scan this screen';
}

captureTrigger.addEventListener('dblclick', async () => {
  await window.desktopAssistant.requestCapture();
});

toggleResultButton.addEventListener('click', async () => {
  await window.desktopAssistant.toggleResult();
});

openSettingsButton.addEventListener('click', async () => {
  await window.desktopAssistant.openSettings();
});

window.desktopAssistant.onAppState(renderState);
window.desktopAssistant.getAppState().then(renderState).catch(console.error);
