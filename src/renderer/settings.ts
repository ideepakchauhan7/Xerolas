import {
  QUICK_ACTIONS,
  getQuickActionById,
  type QuickActionId,
  type SaveSettingsInput,
  type SettingsViewModel
} from '../shared/types';

const form = document.getElementById('settings-form') as HTMLFormElement;
const backendInfo = document.getElementById('backend-info') as HTMLSpanElement;
const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
const promptTemplateInput = document.getElementById('prompt-template') as HTMLTextAreaElement;
const statusText = document.getElementById('settings-status-text') as HTMLSpanElement;
const closeSettingsButton = document.getElementById('close-settings') as HTMLButtonElement;
const quickActionPresets = document.getElementById('quick-action-presets') as HTMLDivElement;

let currentQuickActionId: QuickActionId = 'describe';

function renderQuickActionButtons(activeQuickActionId: QuickActionId): void {
  quickActionPresets.innerHTML = '';

  QUICK_ACTIONS.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset-chip${action.id === activeQuickActionId ? ' is-active' : ''}`;
    button.textContent = action.id === 'describe' ? 'AI Overview' : action.label;
    button.addEventListener('click', () => {
      currentQuickActionId = action.id;
      promptTemplateInput.value = action.prompt;
      renderQuickActionButtons(currentQuickActionId);
    });
    quickActionPresets.appendChild(button);
  });
}

function renderSettings(viewModel: SettingsViewModel): void {
  currentQuickActionId = viewModel.settings.quickActionId;
  shortcutInput.value = viewModel.settings.shortcut;
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

  statusText.textContent = viewModel.shortcutRegistered
    ? `Ready to capture. ${quickActionLabel} is the current default action.`
    : 'Settings saved, but the shortcut could not be registered.';
}

function resolveQuickActionId(promptTemplate: string): QuickActionId {
  return QUICK_ACTIONS.find((preset) => preset.prompt === promptTemplate)?.id ?? currentQuickActionId;
}

closeSettingsButton.addEventListener('click', () => {
  window.close();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const promptTemplate = promptTemplateInput.value.trim();
  const nextQuickActionId = resolveQuickActionId(promptTemplate);
  const payload: SaveSettingsInput = {
    shortcut: shortcutInput.value.trim(),
    quickActionId: nextQuickActionId,
    promptTemplate
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
