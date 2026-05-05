import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { type QuickActionId } from '../src/shared/types';

export interface AppConfig {
  updateGithubOwner?: string;
  updateGithubRepo?: string;
  defaultQuickActionId?: QuickActionId;
  defaultPromptTemplate?: string;
  xerolasCloudGatewayBaseUrl?: string;
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

function sanitizeAppConfig(value: unknown): AppConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const updateGithubOwner =
    typeof raw.updateGithubOwner === 'string' && raw.updateGithubOwner.trim()
      ? raw.updateGithubOwner.trim()
      : undefined;
  const updateGithubRepo =
    typeof raw.updateGithubRepo === 'string' && raw.updateGithubRepo.trim()
      ? raw.updateGithubRepo.trim()
      : undefined;
  const defaultPromptTemplate =
    typeof raw.defaultPromptTemplate === 'string' && raw.defaultPromptTemplate.trim()
      ? raw.defaultPromptTemplate.trim()
      : undefined;
  const xerolasCloudGatewayBaseUrl =
    typeof raw.xerolasCloudGatewayBaseUrl === 'string' && raw.xerolasCloudGatewayBaseUrl.trim()
      ? raw.xerolasCloudGatewayBaseUrl.trim().replace(/\/+$/, '')
      : undefined;

  if (
    !updateGithubOwner &&
    !updateGithubRepo &&
    !defaultPromptTemplate &&
    !sanitizeQuickActionId(raw.defaultQuickActionId) &&
    !xerolasCloudGatewayBaseUrl
  ) {
    return null;
  }

  return {
    updateGithubOwner,
    updateGithubRepo,
    defaultQuickActionId: sanitizeQuickActionId(raw.defaultQuickActionId),
    defaultPromptTemplate,
    xerolasCloudGatewayBaseUrl
  };
}

function readConfigFile(filePath: string): AppConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    return sanitizeAppConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadAppConfig(): AppConfig | null {
  const envConfig = sanitizeAppConfig({
    updateGithubOwner: process.env.CONTEXT_AI_UPDATE_GITHUB_OWNER,
    updateGithubRepo: process.env.CONTEXT_AI_UPDATE_GITHUB_REPO,
    defaultQuickActionId: process.env.CONTEXT_AI_DEFAULT_QUICK_ACTION_ID,
    defaultPromptTemplate: process.env.CONTEXT_AI_DEFAULT_PROMPT,
    xerolasCloudGatewayBaseUrl:
      process.env.XEROLAS_CLOUD_GATEWAY_BASE_URL ||
      process.env.XEROLAS_CLOUD_GATEWAY_URL
  });

  if (envConfig) {
    return envConfig;
  }

  const candidatePaths = app.isPackaged
    ? [path.join(process.resourcesPath, 'app-config.json')]
    : [
        path.join(app.getAppPath(), 'config', 'app-config.local.json'),
        path.join(app.getAppPath(), 'build', 'app-config.json')
      ];

  for (const candidatePath of candidatePaths) {
    const config = readConfigFile(candidatePath);
    if (config) {
      return config;
    }
  }

  return null;
}
