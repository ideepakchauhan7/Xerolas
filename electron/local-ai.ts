import {
  DEFAULT_PROVIDER_MODELS,
  type AiProviderId,
  type AppSettings,
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

async function streamProvider(input: ProviderStreamInput, handlers: LocalAnalyzeStreamHandlers): Promise<ProviderStreamResult> {
  handlers.onMeta?.({ provider: input.provider, model: input.model, usedFallback: false });

  if (input.provider === 'openai') {
    return streamOpenAi(input, handlers);
  }

  if (input.provider === 'anthropic') {
    return streamAnthropic(input, handlers);
  }

  if (input.provider === 'gemini') {
    return streamGeminiLocal(input, handlers);
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
          `Add a ${provider} API key in Settings before capturing.`,
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
          webSearchEnabled: input.settings.webSearchEnabled
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
      webSearchEnabled: input.webSearchEnabled
    },
    {}
  );

  if (!result.text.trim()) {
    throw new Error('The provider test returned no text.');
  }
}
