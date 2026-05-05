import {
  BYOK_PROVIDER_IDS,
  DEFAULT_PROVIDER_MODELS,
  getAiProviderLabel,
  isAiProviderId,
  isManagedAiProviderId,
  normalizeTranslateTargetLanguage,
  type AiProviderId,
  type ProviderCredentialStatus,
  type ProviderModelOverrides,
  type SaveSettingsInput,
  type SettingsViewModel
} from '../shared/types';

const form = document.getElementById('settings-form') as HTMLFormElement;
const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
const translateTargetLanguageInput = document.getElementById('translate-target-language') as HTMLInputElement;
const primaryProviderSelect = document.getElementById('primary-provider') as HTMLSelectElement;
const providerApiKeyInput = document.getElementById('provider-api-key') as HTMLInputElement;
const providerModelOverrideInput = document.getElementById('provider-model-override') as HTMLInputElement;
const providerKeyStatus = document.getElementById('provider-key-status') as HTMLSpanElement;
const webSearchEnabledInput = document.getElementById('web-search-enabled') as HTMLInputElement;
const fallbackProviderInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="fallback-provider"]')
);
const saveProviderKeyButton = document.getElementById('save-provider-key') as HTMLButtonElement;
const testProviderKeyButton = document.getElementById('test-provider-key') as HTMLButtonElement;
const clearProviderKeyButton = document.getElementById('clear-provider-key') as HTMLButtonElement;
const statusText = document.getElementById('settings-status-text') as HTMLSpanElement;
const closeSettingsButton = document.getElementById('close-settings') as HTMLButtonElement;

let currentViewModel: SettingsViewModel | null = null;

function getSelectedProvider(): AiProviderId {
  return isAiProviderId(primaryProviderSelect.value) ? primaryProviderSelect.value : 'gemini';
}

function getCredentialStatus(provider: AiProviderId): ProviderCredentialStatus | null {
  return currentViewModel?.credentialStatuses.find((status) => status.provider === provider) ?? null;
}

function renderCredentialStatus(): void {
  const provider = getSelectedProvider();
  const status = getCredentialStatus(provider);
  const isManagedProvider = isManagedAiProviderId(provider);
  const modelOverride = currentViewModel?.settings.providerModelOverrides[provider]?.trim();

  providerModelOverrideInput.disabled = isManagedProvider;
  providerModelOverrideInput.placeholder = isManagedProvider
    ? 'Managed by Xerolas Cloud'
    : DEFAULT_PROVIDER_MODELS[provider];
  providerModelOverrideInput.value = isManagedProvider ? '' : modelOverride ?? '';
  providerApiKeyInput.placeholder = isManagedProvider
    ? 'Paste an xlo_live_ platform key'
    : 'Paste a provider API key to save or test';

  fallbackProviderInputs.forEach((input) => {
    input.disabled = isManagedProvider || input.value === provider;
    if (isManagedProvider) {
      input.checked = false;
    }
  });

  if (!status) {
    providerKeyStatus.textContent = '';
    return;
  }

  if (status.configured) {
    const keyKind = isManagedProvider ? 'platform key' : 'API key';
    providerKeyStatus.textContent = `${getAiProviderLabel(provider)} ${keyKind} saved${status.last4 ? ` ending in ${status.last4}` : ''}.`;
    return;
  }

  const keyKind = isManagedProvider ? 'platform key' : 'API key';
  providerKeyStatus.textContent = status.message ?? `${getAiProviderLabel(provider)} ${keyKind} is not configured.`;
}

function renderCredentialStatuses(statuses: ProviderCredentialStatus[]): void {
  if (!currentViewModel) {
    return;
  }

  currentViewModel = {
    ...currentViewModel,
    credentialStatuses: statuses
  };
  providerApiKeyInput.value = '';
  renderCredentialStatus();
}

function renderSettings(viewModel: SettingsViewModel): void {
  currentViewModel = viewModel;
  shortcutInput.value = viewModel.settings.shortcut;
  translateTargetLanguageInput.value = normalizeTranslateTargetLanguage(viewModel.settings.translateTargetLanguage);
  primaryProviderSelect.value = viewModel.settings.primaryProviderId;
  webSearchEnabledInput.checked = viewModel.settings.webSearchEnabled;
  fallbackProviderInputs.forEach((input) => {
    input.checked = viewModel.settings.fallbackProviderIds.includes(input.value as AiProviderId);
  });
  renderCredentialStatus();
  statusText.textContent = viewModel.shortcutRegistered ? '' : 'Hotkey could not be registered.';
}

closeSettingsButton.addEventListener('click', () => {
  window.close();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload: SaveSettingsInput = {
    shortcut: shortcutInput.value.trim(),
    translateTargetLanguage: normalizeTranslateTargetLanguage(translateTargetLanguageInput.value),
    primaryProviderId: getSelectedProvider(),
    fallbackProviderIds: fallbackProviderInputs
      .filter((input) => !isManagedAiProviderId(getSelectedProvider()) && input.checked && input.value !== getSelectedProvider())
      .map((input) => input.value)
      .filter(isAiProviderId),
    providerModelOverrides: BYOK_PROVIDER_IDS.reduce((overrides, provider) => {
      const currentValue = currentViewModel?.settings.providerModelOverrides[provider] ?? '';
      overrides[provider] = provider === getSelectedProvider()
        ? providerModelOverrideInput.value.trim()
        : currentValue;
      return overrides;
    }, {} as ProviderModelOverrides),
    webSearchEnabled: webSearchEnabledInput.checked
  };

  const response = await window.desktopAssistant.saveSettings(payload);
  renderSettings({
    settings: response.settings,
    shortcutRegistered: response.shortcutRegistered,
    credentialStatuses: response.credentialStatuses
  });
  statusText.textContent = response.success ? 'Saved.' : response.message;
});

primaryProviderSelect.addEventListener('change', renderCredentialStatus);

saveProviderKeyButton.addEventListener('click', async () => {
  const response = await window.desktopAssistant.saveProviderKey({
    provider: getSelectedProvider(),
    apiKey: providerApiKeyInput.value
  });
  renderCredentialStatuses(response.credentialStatuses);
  statusText.textContent = response.message;
});

testProviderKeyButton.addEventListener('click', async () => {
  const response = await window.desktopAssistant.testProviderConnection({
    provider: getSelectedProvider(),
    apiKey: providerApiKeyInput.value.trim() || undefined,
    modelOverride: providerModelOverrideInput.value.trim() || undefined,
    webSearchEnabled: webSearchEnabledInput.checked
  });
  renderCredentialStatuses(response.credentialStatuses);
  statusText.textContent = response.message;
});

clearProviderKeyButton.addEventListener('click', async () => {
  const response = await window.desktopAssistant.clearProviderKey(getSelectedProvider());
  renderCredentialStatuses(response.credentialStatuses);
  statusText.textContent = response.message;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.close();
  }
});

window.desktopAssistant.getSettings().then(renderSettings).catch(console.error);
