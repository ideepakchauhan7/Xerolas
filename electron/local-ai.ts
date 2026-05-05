import {
  DEFAULT_PROVIDER_MODELS,
  getAiProviderLabel,
  type AiProviderId,
  type AppSettings,
  isManagedAiProviderId,
  type QuickActionId,
  type SourceLink
} from '../src/shared/types';
import { streamImageWithGemini } from '../backend/gemini';
import { streamImageWithOpenRouter } from '../backend/openrouter';
import { isRetryableProviderError, isRetryableStatus, ProviderRequestError } from '../backend/provider-error';

export interface LocalAnalyzeImageInput {
  quickActionId: QuickActionId;
  promptTemplate: string;
  imageBytes: Uint8Array;
  question?: string;
  settings: AppSettings;
  xerolasCloudGatewayBaseUrl?: string;
  readProviderKey: (provider: AiProviderId) => string | null;
}

export interface LocalAnalyzeStreamHandlers {
  onMeta?: (payload: { provider: string; model: string; usedFallback: boolean }) => void;
  onDelta?: (payload: { chunk: string; text: string }) => void;
  onSearch?: (payload: { webSearchInProgress: boolean }) => void;
  onGrounding?: (payload: { groundingUsed: boolean; sources: SourceLink[] }) => void;
}

export interface ProviderConnectionTestInput {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  webSearchEnabled: boolean;
  xerolasCloudGatewayBaseUrl?: string;
}

interface ProviderStreamInput {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
  webSearchEnabled: boolean;
  xerolasCloudGatewayBaseUrl?: string;
}

interface ProviderStreamResult {
  text: string;
  provider: AiProviderId;
  model: string;
  groundingUsed: boolean;
  sources: SourceLink[];
}

interface OpenAiResponseItem {
  type?: string;
  content?: unknown;
  text?: unknown;
  annotations?: unknown;
}

interface AnthropicContentBlock {
  type?: string;
  text?: unknown;
  content?: unknown;
  source?: {
    title?: unknown;
    url?: unknown;
  };
}

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const ANTHROPIC_MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const XEROLAS_CLOUD_ANALYZE_STREAM_PATH = '/v1/analyze/stream';
const XEROLAS_CLOUD_KEY_STATUS_PATH = '/v1/key/status';
const IMAGE_MIME_TYPE = 'image/png';
const MAX_SOURCES = 5;

const SYSTEM_INSTRUCTION = [
  'You are Xerolas, a desktop visual assistant.',
  'Use the captured image as the primary source of truth.',
  'Ignore surrounding app chrome unless it matters to the request.',
  'If the capture contains a question, puzzle, code block, error, document, or worksheet, solve or explain that content.',
  'Lead with the most useful answer first.',
  'Use plain text only. Do not use markdown tables, code fences, or bold markers.'
].join(' ');

const WEB_SEARCH_INSTRUCTION =
  'Web search is enabled. Use provider-native web search only when current external context improves the answer, and return sources when the provider supplies them.';

const VISUAL_ONLY_INSTRUCTION =
  'Web search is disabled by the user. Answer from the captured image and visible context only.';

function buildPrompt(promptTemplate: string, question: string | undefined, webSearchEnabled: boolean): string {
  const trimmedQuestion = question?.trim();
  const instructions = [SYSTEM_INSTRUCTION, webSearchEnabled ? WEB_SEARCH_INSTRUCTION : VISUAL_ONLY_INSTRUCTION].join(' ');

  if (!trimmedQuestion) {
    return `${instructions}\n\nUser request:\n${promptTemplate.trim()}`;
  }

  return [
    instructions,
    '',
    'Primary task:',
    promptTemplate.trim(),
    '',
    'User question about this capture:',
    trimmedQuestion,
    '',
    'Answer the user question using the captured image as the primary context. The question controls answer length, language, style, and exclusions. If the capture does not support the answer, say that briefly instead of guessing.'
  ].join('\n');
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function getProviderModel(settings: AppSettings, provider: AiProviderId): string {
  return settings.providerModelOverrides[provider]?.trim() || DEFAULT_PROVIDER_MODELS[provider];
}

function getProviderOrder(settings: AppSettings): AiProviderId[] {
  const seen = new Set<AiProviderId>([settings.primaryProviderId]);
  const ordered: AiProviderId[] = [settings.primaryProviderId];

  settings.fallbackProviderIds.forEach((provider) => {
    if (seen.has(provider)) {
      return;
    }

    seen.add(provider);
    ordered.push(provider);
  });

  return ordered;
}

function sourceHost(url: string, title?: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').trim();
    if (hostname) {
      return hostname;
    }
  } catch {
    // Fall through to title.
  }

  return title?.trim() || 'Source';
}

function mergeSources(existing: SourceLink[], next: SourceLink[]): SourceLink[] {
  const seen = new Set(existing.map((source) => source.url));
  const merged = [...existing];

  next.forEach((source) => {
    if (seen.has(source.url) || merged.length >= MAX_SOURCES) {
      return;
    }

    seen.add(source.url);
    merged.push(source);
  });

  return merged;
}

function normalizeSource(titleValue: unknown, urlValue: unknown): SourceLink | null {
  const url = typeof urlValue === 'string' ? urlValue.trim() : '';
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  if (!url) {
    return null;
  }

  try {
    new URL(url);
  } catch {
    return null;
  }

  const host = sourceHost(url, title);
  return {
    title: title || host || url,
    url,
    host
  };
}

function normalizeSources(value: unknown): SourceLink[] {
  const rawSources = Array.isArray(value) ? value : [];
  const sources: SourceLink[] = [];

  rawSources.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const raw = entry as Record<string, unknown>;
    const source = normalizeSource(raw.title ?? raw.host, raw.url);
    if (source) {
      sources.push(source);
    }
  });

  return mergeSources([], sources);
}

function normalizeGatewayBaseUrl(value: string | undefined): string {
  const baseUrl = value?.trim().replace(/\/+$/, '') ?? '';
  if (!baseUrl) {
    throw new ProviderRequestError(
      'xerolas-cloud',
      503,
      'Xerolas Cloud gateway is not configured in this build.',
      false
    );
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('Gateway URL must use HTTPS.');
    }
  } catch {
    throw new ProviderRequestError(
      'xerolas-cloud',
      503,
      'Xerolas Cloud gateway URL is invalid.',
      false
    );
  }

  return baseUrl;
}

function buildGatewayEndpoint(baseUrl: string | undefined, endpointPath: string): string {
  const normalizedBaseUrl = normalizeGatewayBaseUrl(baseUrl);
  const url = new URL(normalizedBaseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${endpointPath}`;
  return url.toString();
}

function normalizeOpenAiSources(value: unknown): SourceLink[] {
  const annotations = Array.isArray(value) ? value : [];
  const sources: SourceLink[] = [];

  annotations.forEach((annotation) => {
    if (!annotation || typeof annotation !== 'object') {
      return;
    }

    const raw = annotation as Record<string, unknown>;
    const citation = raw.url_citation as Record<string, unknown> | undefined;
    const source = normalizeSource(raw.title ?? citation?.title, raw.url ?? citation?.url);
    if (source) {
      sources.push(source);
    }
  });

  return sources.slice(0, MAX_SOURCES);
}

function extractOpenAiTextAndSources(payload: Record<string, unknown>): { text: string; sources: SourceLink[] } {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const textParts: string[] = [];
  let sources: SourceLink[] = [];

  output.forEach((item) => {
    const outputItem = item as OpenAiResponseItem;
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    content.forEach((part) => {
      if (!part || typeof part !== 'object') {
        return;
      }

      const raw = part as Record<string, unknown>;
      if (typeof raw.text === 'string') {
        textParts.push(raw.text);
      }
      sources = mergeSources(sources, normalizeOpenAiSources(raw.annotations));
    });

    if (typeof outputItem.text === 'string') {
      textParts.push(outputItem.text);
    }
  });

  if (!textParts.length && typeof payload.output_text === 'string') {
    textParts.push(payload.output_text);
  }

  return {
    text: textParts.join('').trim(),
    sources
  };
}

function extractAnthropicTextAndSources(content: unknown): { text: string; sources: SourceLink[] } {
  const blocks = Array.isArray(content) ? (content as AnthropicContentBlock[]) : [];
  const textParts: string[] = [];
  let sources: SourceLink[] = [];

  const visitBlock = (block: AnthropicContentBlock): void => {
    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text);
    }

    if (block.type === 'web_search_tool_result') {
      const source = normalizeSource(block.source?.title, block.source?.url);
      if (source) {
        sources = mergeSources(sources, [source]);
      }
    }

    if (Array.isArray(block.content)) {
      block.content.forEach((child) => {
        if (child && typeof child === 'object') {
          visitBlock(child as AnthropicContentBlock);
        }
      });
    }
  };

  blocks.forEach(visitBlock);

  return {
    text: textParts.join('').trim(),
    sources
  };
}

async function parseProviderError(provider: AiProviderId, response: Response): Promise<never> {
  const rawBody = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  const message =
    (payload.error as { message?: unknown } | undefined)?.message ??
    rawBody.trim() ??
    `${provider} request failed.`;

  throw new ProviderRequestError(
    provider,
    response.status,
    typeof message === 'string' && message.trim() ? message.trim() : `${provider} request failed.`,
    isRetryableStatus(response.status)
  );
}

async function parseXerolasCloudError(response: Response): Promise<never> {
  const rawBody = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  const errorPayload = payload.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : null;
  const message =
    errorPayload?.message ??
    payload.message ??
    rawBody.trim() ??
    'Xerolas Cloud request failed.';

  throw new ProviderRequestError(
    'xerolas-cloud',
    response.status,
    typeof message === 'string' && message.trim() ? message.trim() : 'Xerolas Cloud request failed.',
    response.status >= 500 || response.status === 408 || response.status === 425
  );
}

function createOpenAiRequestBody(input: ProviderStreamInput, stream: boolean): string {
  const body: Record<string, unknown> = {
    model: input.model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildPrompt(input.promptTemplate, input.question, input.webSearchEnabled)
          },
          {
            type: 'input_image',
            image_url: `data:${input.imageMimeType};base64,${input.imageBase64Data}`
          }
        ]
      }
    ],
    stream,
    max_output_tokens: 1400
  };

  if (input.webSearchEnabled) {
    body.tools = [{ type: 'web_search_preview' }];
  }

  return JSON.stringify(body);
}

async function streamOpenAi(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: createOpenAiRequestBody(input, true)
  });

  if (!response.ok) {
    await parseProviderError('openai', response);
  }

  if (!response.body) {
    throw new Error('OpenAI returned no stream for this capture.');
  }

  let aggregateText = '';
  let sources: SourceLink[] = [];
  let groundingUsed = false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (eventText: string): void => {
    const dataLines = eventText
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .filter(Boolean);

    const dataText = dataLines.join('\n').trim();
    if (!dataText || dataText === '[DONE]') {
      return;
    }

    const payload = JSON.parse(dataText) as Record<string, unknown>;
    const type = typeof payload.type === 'string' ? payload.type : '';

    if (type.includes('web_search')) {
      groundingUsed = true;
      if (!aggregateText) {
        handlers.onSearch?.({ webSearchInProgress: true });
      }
    }

    if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      aggregateText += payload.delta;
      handlers.onDelta?.({ chunk: payload.delta, text: aggregateText });
      return;
    }

    if (type === 'response.completed' && payload.response && typeof payload.response === 'object') {
      const complete = extractOpenAiTextAndSources(payload.response as Record<string, unknown>);
      sources = mergeSources(sources, complete.sources);
      groundingUsed = groundingUsed || sources.length > 0;
      if (!aggregateText && complete.text) {
        aggregateText = complete.text;
        handlers.onDelta?.({ chunk: complete.text, text: aggregateText });
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
    buffer = parts.pop() ?? '';

    parts.forEach(processEvent);

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processEvent(`${buffer.trim()}\n\n`);
  }

  if (!aggregateText.trim()) {
    throw new Error('OpenAI returned no text for this capture.');
  }

  return {
    text: aggregateText.trim(),
    provider: 'openai',
    model: input.model,
    groundingUsed,
    sources
  };
}

function createAnthropicRequestBody(input: ProviderStreamInput): string {
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: 1400,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.imageMimeType,
              data: input.imageBase64Data
            }
          },
          {
            type: 'text',
            text: buildPrompt(input.promptTemplate, input.question, input.webSearchEnabled)
          }
        ]
      }
    ]
  };

  if (input.webSearchEnabled) {
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 2
      }
    ];
  }

  return JSON.stringify(body);
}

async function streamAnthropic(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  const response = await fetch(ANTHROPIC_MESSAGES_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: createAnthropicRequestBody(input)
  });

  if (!response.ok) {
    await parseProviderError('anthropic', response);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const extracted = extractAnthropicTextAndSources(payload.content);

  if (!extracted.text) {
    throw new Error('Anthropic returned no text for this capture.');
  }

  handlers.onDelta?.({ chunk: extracted.text, text: extracted.text });

  return {
    text: extracted.text,
    provider: 'anthropic',
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : input.model,
    groundingUsed: extracted.sources.length > 0,
    sources: extracted.sources
  };
}

async function streamGeminiLocal(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  const opened = await streamImageWithGemini({
    apiKey: input.apiKey,
    primaryModel: input.model,
    fallbackModel: input.model,
    promptTemplate: input.promptTemplate,
    question: input.question,
    imageMimeType: input.imageMimeType,
    imageBase64Data: input.imageBase64Data,
    enableWebSearch: input.webSearchEnabled
  });

  let text = '';
  let sources: SourceLink[] = [];
  let groundingUsed = false;

  for await (const event of opened.stream) {
    if (event.type === 'grounding') {
      groundingUsed = event.grounding.groundingUsed || event.grounding.sources.length > 0;
      sources = event.grounding.sources;
      if (!text && groundingUsed) {
        handlers.onSearch?.({ webSearchInProgress: true });
      }
      handlers.onGrounding?.({ groundingUsed, sources });
      continue;
    }

    text += event.text;
    handlers.onDelta?.({ chunk: event.text, text });
  }

  if (!text.trim()) {
    throw new Error('Gemini returned no text for this capture.');
  }

  const grounding = opened.getGrounding();
  return {
    text: text.trim(),
    provider: 'gemini',
    model: opened.model,
    groundingUsed: grounding.groundingUsed || groundingUsed,
    sources: grounding.sources.length ? grounding.sources : sources
  };
}

async function streamOpenRouterLocal(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  const opened = await streamImageWithOpenRouter({
    apiKey: input.apiKey,
    model: input.model,
    enableWebSearch: input.webSearchEnabled,
    promptTemplate: input.promptTemplate,
    question: input.question,
    imageMimeType: input.imageMimeType,
    imageBase64Data: input.imageBase64Data
  });

  let text = '';
  let sources: SourceLink[] = [];
  let groundingUsed = false;

  for await (const event of opened.stream) {
    if (event.type === 'grounding') {
      groundingUsed = event.grounding.groundingUsed || event.grounding.sources.length > 0;
      sources = event.grounding.sources;
      if (!text && groundingUsed) {
        handlers.onSearch?.({ webSearchInProgress: true });
      }
      handlers.onGrounding?.({ groundingUsed, sources });
      continue;
    }

    text += event.text;
    handlers.onDelta?.({ chunk: event.text, text });
  }

  if (!text.trim()) {
    throw new Error('OpenRouter returned no text for this capture.');
  }

  const grounding = opened.getGrounding();
  return {
    text: text.trim(),
    provider: 'openrouter',
    model: opened.model,
    groundingUsed: grounding.groundingUsed || groundingUsed,
    sources: grounding.sources.length ? grounding.sources : sources
  };
}

async function streamXerolasCloud(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  const response = await fetch(buildGatewayEndpoint(input.xerolasCloudGatewayBaseUrl, XEROLAS_CLOUD_ANALYZE_STREAM_PATH), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      'X-Xerolas-Client': 'desktop'
    },
    body: JSON.stringify({
      promptTemplate: input.promptTemplate,
      question: input.question,
      imageMimeType: input.imageMimeType,
      imageBase64Data: input.imageBase64Data,
      webSearchEnabled: input.webSearchEnabled
    })
  });

  if (!response.ok) {
    await parseXerolasCloudError(response);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json() as Record<string, unknown>;
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      throw new Error('Xerolas Cloud returned no text for this capture.');
    }

    const sources = normalizeSources(payload.sources);
    handlers.onDelta?.({ chunk: text, text });
    handlers.onGrounding?.({
      groundingUsed: Boolean(payload.groundingUsed) || sources.length > 0,
      sources
    });

    return {
      text,
      provider: 'xerolas-cloud',
      model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : input.model,
      groundingUsed: Boolean(payload.groundingUsed) || sources.length > 0,
      sources
    };
  }

  if (!response.body) {
    throw new Error('Xerolas Cloud returned no stream for this capture.');
  }

  let aggregateText = '';
  let model = input.model;
  let groundingUsed = false;
  let sources: SourceLink[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (eventText: string): void => {
    const dataLines = eventText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .filter(Boolean);
    const dataText = dataLines.join('\n').trim();
    if (!dataText || dataText === '[DONE]') {
      return;
    }

    const payload = JSON.parse(dataText) as Record<string, unknown>;
    const type = typeof payload.type === 'string' ? payload.type : '';

    if (type === 'error') {
      const message = typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : 'Xerolas Cloud request failed.';
      throw new ProviderRequestError('xerolas-cloud', 502, message, false);
    }

    if (typeof payload.model === 'string' && payload.model.trim()) {
      model = payload.model.trim();
    }

    if ((type === 'search' || payload.webSearchInProgress === true) && !aggregateText) {
      handlers.onSearch?.({ webSearchInProgress: true });
    }

    const nextSources = normalizeSources(payload.sources);
    if (nextSources.length || payload.groundingUsed === true) {
      groundingUsed = Boolean(payload.groundingUsed) || nextSources.length > 0;
      sources = mergeSources(sources, nextSources);
      handlers.onGrounding?.({ groundingUsed, sources });
    }

    const delta =
      typeof payload.delta === 'string'
        ? payload.delta
        : typeof payload.chunk === 'string'
          ? payload.chunk
          : type === 'delta' && typeof payload.text === 'string'
            ? payload.text
            : '';
    if (delta) {
      aggregateText += delta;
      handlers.onDelta?.({ chunk: delta, text: aggregateText });
      return;
    }

    if ((type === 'done' || type === 'complete' || type === 'completed') && typeof payload.text === 'string' && !aggregateText) {
      aggregateText = payload.text;
      handlers.onDelta?.({ chunk: aggregateText, text: aggregateText });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      processEvent(part);
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processEvent(`${buffer.trim()}\n\n`);
  }

  if (!aggregateText.trim()) {
    throw new Error('Xerolas Cloud returned no text for this capture.');
  }

  return {
    text: aggregateText.trim(),
    provider: 'xerolas-cloud',
    model,
    groundingUsed,
    sources
  };
}

async function streamProvider(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  handlers.onMeta?.({ provider: getAiProviderLabel(input.provider), model: input.model, usedFallback: false });

  if (input.provider === 'openai') {
    return streamOpenAi(input, handlers);
  }

  if (input.provider === 'anthropic') {
    return streamAnthropic(input, handlers);
  }

  if (input.provider === 'gemini') {
    return streamGeminiLocal(input, handlers);
  }

  if (input.provider === 'xerolas-cloud') {
    return streamXerolasCloud(input, handlers);
  }

  return streamOpenRouterLocal(input, handlers);
}

export async function streamAnalyzeImageLocally(
  input: LocalAnalyzeImageInput,
  handlers: LocalAnalyzeStreamHandlers = {}
): Promise<{ text: string; provider: string; model: string; usedFallback: boolean; groundingUsed: boolean; sources: SourceLink[] }> {
  const providerOrder = getProviderOrder(input.settings);
  const imageBase64Data = bytesToBase64(input.imageBytes);
  let lastRetryableError: unknown = null;

  for (const provider of providerOrder) {
    const apiKey = input.readProviderKey(provider);
    if (!apiKey) {
      if (provider === input.settings.primaryProviderId) {
        throw new ProviderRequestError(
          provider,
          401,
          `Add a ${getAiProviderLabel(provider)} ${isManagedAiProviderId(provider) ? 'platform key' : 'API key'} in Settings before capturing.`,
          false
        );
      }
      continue;
    }

    const usedFallback = provider !== input.settings.primaryProviderId;
    try {
      const result = await streamProvider(
        {
          provider,
          apiKey,
          model: getProviderModel(input.settings, provider),
          promptTemplate: input.promptTemplate,
          question: input.question,
          imageMimeType: IMAGE_MIME_TYPE,
          imageBase64Data,
          webSearchEnabled: input.settings.webSearchEnabled,
          xerolasCloudGatewayBaseUrl: input.xerolasCloudGatewayBaseUrl
        },
        {
          ...handlers,
          onMeta: (payload) => {
            handlers.onMeta?.({ ...payload, usedFallback });
          }
        }
      );

      return {
        ...result,
        usedFallback
      };
    } catch (error) {
      if (!isRetryableProviderError(error)) {
        throw error;
      }

      lastRetryableError = error;
    }
  }

  if (lastRetryableError instanceof Error) {
    throw lastRetryableError;
  }

  throw new Error('No configured provider key is available for the selected provider order.');
}

export async function testProviderConnection(input: ProviderConnectionTestInput): Promise<void> {
  if (input.provider === 'xerolas-cloud') {
    const response = await fetch(buildGatewayEndpoint(input.xerolasCloudGatewayBaseUrl, XEROLAS_CLOUD_KEY_STATUS_PATH), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'application/json',
        'X-Xerolas-Client': 'desktop'
      }
    });

    if (!response.ok) {
      await parseXerolasCloudError(response);
    }

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (payload.valid === false || payload.revoked === true || payload.expired === true) {
      throw new ProviderRequestError('xerolas-cloud', 401, 'This Xerolas Cloud key is not active.', false);
    }

    return;
  }

  const transparentPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz6qWQAAAABJRU5ErkJggg==';

  const result = await streamProvider(
    {
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model,
      promptTemplate: 'Reply with OK if this provider connection works.',
      imageMimeType: IMAGE_MIME_TYPE,
      imageBase64Data: transparentPngBase64,
      webSearchEnabled: input.webSearchEnabled,
      xerolasCloudGatewayBaseUrl: input.xerolasCloudGatewayBaseUrl
    },
    {}
  );

  if (!result.text.trim()) {
    throw new Error('The provider test returned no text.');
  }
}
