import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  AI_PROVIDER_IDS,
  type AiProviderId,
  getAiProviderLabel,
  type ProviderCredentialStatus
} from '../src/shared/types';

interface StoredCredential {
  encryptedValue?: string;
  plaintextDevValue?: string;
  last4: string;
  updatedAt: string;
}

type StoredCredentialMap = Partial<Record<AiProviderId, StoredCredential>>;

const DEV_PLAINTEXT_ENV = 'XEROLAS_ALLOW_PLAINTEXT_KEYS';

function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), 'provider-credentials.json');
}

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function allowPlaintextDevStorage(): boolean {
  return !app.isPackaged && process.env[DEV_PLAINTEXT_ENV] === '1';
}

function getStorageMode(): ProviderCredentialStatus['storage'] {
  if (safeStorage.isEncryptionAvailable()) {
    return 'encrypted';
  }

  return allowPlaintextDevStorage() ? 'plaintext-dev' : 'unavailable';
}

function getStorageMessage(): string | null {
  const mode = getStorageMode();
  if (mode === 'encrypted') {
    return null;
  }

  if (mode === 'plaintext-dev') {
    return `Development-only plaintext storage is enabled by ${DEV_PLAINTEXT_ENV}=1.`;
  }

  return 'OS key encryption is unavailable, so Xerolas cannot persist API keys on this system.';
}

function readStore(): StoredCredentialMap {
  const filePath = getCredentialsPath();
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed as StoredCredentialMap;
  } catch {
    return {};
  }
}

function writeStore(store: StoredCredentialMap): void {
  const filePath = getCredentialsPath();
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
}

function redactLast4(apiKey: string): string {
  const compact = apiKey.trim();
  return compact.length <= 4 ? compact : compact.slice(-4);
}

function decryptCredential(provider: AiProviderId, credential: StoredCredential | undefined): string | null {
  if (!credential) {
    return null;
  }

  if (credential.encryptedValue) {
    try {
      return safeStorage.decryptString(Buffer.from(credential.encryptedValue, 'base64'));
    } catch {
      return null;
    }
  }

  if (allowPlaintextDevStorage() && credential.plaintextDevValue) {
    return credential.plaintextDevValue;
  }

  console.warn(`${getAiProviderLabel(provider)} key is stored in an unsupported credential format.`);
  return null;
}

export function getProviderCredentialStatuses(): ProviderCredentialStatus[] {
  const store = readStore();
  const storage = getStorageMode();
  const message = getStorageMessage();

  return AI_PROVIDER_IDS.map((provider) => {
    const credential = store[provider];
    const configured = Boolean(credential?.encryptedValue || credential?.plaintextDevValue);
    return {
      provider,
      configured,
      last4: configured && credential?.last4 ? credential.last4 : null,
      storage,
      message: storage === 'unavailable' && !configured ? message : null
    };
  });
}

export function readProviderApiKey(provider: AiProviderId): string | null {
  return decryptCredential(provider, readStore()[provider]);
}

export function saveProviderApiKey(provider: AiProviderId, apiKey: string): void {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error('Enter an API key before saving.');
  }

  const storage = getStorageMode();
  if (storage === 'unavailable') {
    throw new Error(getStorageMessage() ?? 'OS key encryption is unavailable.');
  }

  const store = readStore();
  const credential: StoredCredential = {
    last4: redactLast4(normalizedKey),
    updatedAt: new Date().toISOString()
  };

  if (storage === 'encrypted') {
    credential.encryptedValue = safeStorage.encryptString(normalizedKey).toString('base64');
  } else {
    credential.plaintextDevValue = normalizedKey;
  }

  store[provider] = credential;
  writeStore(store);
}

export function clearProviderApiKey(provider: AiProviderId): void {
  const store = readStore();
  delete store[provider];
  writeStore(store);
}
