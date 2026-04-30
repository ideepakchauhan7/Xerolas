import {
  normalizeTranslateTargetLanguage,
  type SaveSettingsInput,
  type SettingsViewModel
} from '../shared/types';

const form = document.getElementById('settings-form') as HTMLFormElement;
const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
const translateTargetLanguageInput = document.getElementById('translate-target-language') as HTMLInputElement;
const statusText = document.getElementById('settings-status-text') as HTMLSpanElement;
const closeSettingsButton = document.getElementById('close-settings') as HTMLButtonElement;

function renderSettings(viewModel: SettingsViewModel): void {
  shortcutInput.value = viewModel.settings.shortcut;
  translateTargetLanguageInput.value = normalizeTranslateTargetLanguage(viewModel.settings.translateTargetLanguage);
  statusText.textContent = viewModel.shortcutRegistered ? '' : 'Hotkey could not be registered.';
}

closeSettingsButton.addEventListener('click', () => {
  window.close();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload: SaveSettingsInput = {
    shortcut: shortcutInput.value.trim(),
    translateTargetLanguage: normalizeTranslateTargetLanguage(translateTargetLanguageInput.value)
  };

  const response = await window.desktopAssistant.saveSettings(payload);
  renderSettings({
    settings: response.settings,
    shortcutRegistered: response.shortcutRegistered,
    backendConfigured: response.backendConfigured,
    backendBaseUrl: response.backendBaseUrl
  });
  statusText.textContent = response.success ? 'Saved.' : response.message;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.close();
  }
});

window.desktopAssistant.getSettings().then(renderSettings).catch(console.error);
