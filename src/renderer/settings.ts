import {
  QUICK_ACTIONS,
  getQuickActionById,
  getQuickActionPrompt,
  normalizeTranslateTargetLanguage,
  resolveQuickActionId,
  type QuickActionId,
  type SaveSettingsInput,
  type SettingsViewModel
} from '../shared/types';

const form = document.getElementById('settings-form') as HTMLFormElement;
const backendInfo = document.getElementById('backend-info') as HTMLSpanElement;
const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
const translateTargetLanguageInput = document.getElementById('translate-target-language') as HTMLInputElement;
const promptTemplateInput = document.getElementById('prompt-template') as HTMLTextAreaElement;
const statusText = document.getElementById('settings-status-text') as HTMLSpanElement;
const closeSettingsButton = document.getElementById('close-settings') as HTMLButtonElement;
const quickActionPresets = document.getElementById('quick-action-presets') as HTMLDivElement;
const summaryBackend = document.getElementById('summary-backend') as HTMLHeadingElement;
const summaryShortcut = document.getElementById('summary-shortcut') as HTMLHeadingElement;
const summaryAction = document.getElementById('summary-action') as HTMLHeadingElement;

let currentQuickActionId: QuickActionId = 'describe';
let currentTranslateTargetLanguage = 'English';
const SETTINGS_QUICK_ACTIONS = QUICK_ACTIONS.filter((action) => action.id !== 'ask');

function getCurrentTranslatePresetPrompt(targetLanguage = currentTranslateTargetLanguage): string {
  return getQuickActionPrompt('translate', { translateTargetLanguage: targetLanguage }) ?? '';
}

function renderQuickActionButtons(activeQuickActionId: QuickActionId): void {
  quickActionPresets.innerHTML = '';

  SETTINGS_QUICK_ACTIONS.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset-chip${action.id === activeQuickActionId ? ' is-active' : ''}`;
    button.textContent = action.id === 'describe' ? 'AI Overview' : action.label;
    button.addEventListener('click', () => {
      currentQuickActionId = action.id;
      promptTemplateInput.value =
        getQuickActionPrompt(action.id, {
          translateTargetLanguage: currentTranslateTargetLanguage
        }) ?? action.prompt;
      renderQuickActionButtons(currentQuickActionId);
      summaryAction.textContent = action.id === 'describe' ? 'AI Overview' : action.label;
    });
    quickActionPresets.appendChild(button);
  });
}

function summarizeBackend(viewModel: SettingsViewModel): string {
  if (!viewModel.backendConfigured || !viewModel.backendBaseUrl) {
    return 'Not configured';
  }

  try {
    return new URL(viewModel.backendBaseUrl).hostname;
  } catch {
    return 'Configured';
  }
}

function renderSettings(viewModel: SettingsViewModel): void {
  currentQuickActionId = viewModel.settings.quickActionId;
  currentTranslateTargetLanguage = normalizeTranslateTargetLanguage(viewModel.settings.translateTargetLanguage);
  shortcutInput.value = viewModel.settings.shortcut;
  translateTargetLanguageInput.value = currentTranslateTargetLanguage;
  promptTemplateInput.value = viewModel.settings.promptTemplate;
  renderQuickActionButtons(currentQuickActionId);

  if (viewModel.backendConfigured && viewModel.backendBaseUrl) {
    backendInfo.textContent = `Requests are routed through ${viewModel.backendBaseUrl}.`;
  } else {
    backendInfo.textContent = 'This build is missing a backend gateway URL.';
  }

  const quickActionLabel =
    currentQuickActionId === 'describe'
      ? 'AI Overview'
      : getQuickActionById(currentQuickActionId)?.label ?? 'Custom';

  summaryBackend.textContent = summarizeBackend(viewModel);
  summaryShortcut.textContent = viewModel.settings.shortcut || 'Unset';
  summaryAction.textContent = quickActionLabel;

  statusText.textContent = viewModel.shortcutRegistered
    ? `Ready to capture. ${quickActionLabel} is the current default action.`
    : 'Settings saved, but the shortcut could not be registered.';
}

translateTargetLanguageInput.addEventListener('input', () => {
  const nextTranslateTargetLanguage = normalizeTranslateTargetLanguage(translateTargetLanguageInput.value);
  const previousTranslatePrompt = getCurrentTranslatePresetPrompt();

  if (currentQuickActionId === 'translate' && promptTemplateInput.value.trim() === previousTranslatePrompt) {
    promptTemplateInput.value = getCurrentTranslatePresetPrompt(nextTranslateTargetLanguage);
  }

  currentTranslateTargetLanguage = nextTranslateTargetLanguage;
});

closeSettingsButton.addEventListener('click', () => {
  window.close();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const promptTemplate = promptTemplateInput.value.trim();
  const translateTargetLanguage = normalizeTranslateTargetLanguage(translateTargetLanguageInput.value);
  const nextQuickActionId =
    currentQuickActionId === 'translate' &&
    promptTemplate === getCurrentTranslatePresetPrompt(translateTargetLanguage)
      ? 'translate'
      : resolveQuickActionId(promptTemplate, {
          translateTargetLanguage
        });
  const payload: SaveSettingsInput = {
    shortcut: shortcutInput.value.trim(),
    quickActionId: nextQuickActionId,
    promptTemplate,
    translateTargetLanguage
  };

  const response = await window.desktopAssistant.saveSettings(payload);
  currentQuickActionId = response.settings.quickActionId;
  renderSettings({
    settings: response.settings,
    shortcutRegistered: response.shortcutRegistered,
    backendConfigured: response.backendConfigured,
    backendBaseUrl: response.backendBaseUrl
  });
  statusText.textContent = response.message;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.close();
  }
});

window.desktopAssistant.getSettings().then(renderSettings).catch(console.error);
