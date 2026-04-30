import {
  isRetryableStatus,
  ProviderRequestError
} from './provider-error';
import type { SourceLink } from '../src/shared/types';

interface AnalyzeImageInput {
  apiKey: string;
  model: string;
  enableWebSearch: boolean;
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
}

interface OpenRouterGroundingResult {
  groundingUsed: boolean;
  sources: SourceLink[];
}

type OpenRouterStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'grounding'; grounding: OpenRouterGroundingResult };

interface OpenRouterOpenStreamResult {
  stream: AsyncGenerator<OpenRouterStreamEvent>;
  model: string;
  webSearchAttempted: boolean;
  getGrounding: () => OpenRouterGroundingResult;
}

interface OpenRouterCompletionResult {
  text: string;
  model: string;
  grounding: OpenRouterGroundingResult;
}

interface UrlCitationAnnotation {
  type?: string;
  url_citation?: {
    url?: unknown;
    title?: unknown;
  };
}

const EMPTY_GROUNDING: OpenRouterGroundingResult = {
  groundingUsed: false,
  sources: []
};

function getGroundingSignature(grounding: OpenRouterGroundingResult): string {
  return [grounding.groundingUsed ? '1' : '0', ...grounding.sources.map((source) => source.url)].join('|');
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const BASE_INSTRUCTION = [
  'You are Xerolas, a desktop visual assistant.',
  'Focus on the selected screen region and treat the captured image as the primary source of truth.',
  'Ignore browser chrome, toolbars, app frames, and surrounding UI unless they are directly relevant to the user request.',
  'If the capture contains a question, puzzle, article, code block, error, document, or worksheet, solve or explain that content instead of mainly narrating the layout.',
  'Lead with the most useful answer first, then give short supporting points if needed.',
  'Keep the response concise, grounded, and practical.',
  'Use plain text only. Do not use markdown tables, code fences, or bold markers.'
].join(' ');

const WEB_SEARCH_INSTRUCTION =
  'Use the available OpenRouter web search tool when current web context would improve the answer, and cite useful sources when the tool provides them.';

const NO_WEB_SEARCH_INSTRUCTION =
  'OpenRouter web search is disabled for this free fallback, so answer from the captured image and visible context only.';

function buildPrompt(input: AnalyzeImageInput): string {
  const trimmedPrompt = input.promptTemplate.trim();
  const trimmedQuestion = input.question?.trim();
  const instruction = [
    BASE_INSTRUCTION,
    input.enableWebSearch ? WEB_SEARCH_INSTRUCTION : NO_WEB_SEARCH_INSTRUCTION
  ].join(' ');

  if (!trimmedQuestion) {
    return `${instruction}\n\nUser request:\n${trimmedPrompt}`;
  }

  return [
    instruction,
    '',
    'Primary task:',
    trimmedPrompt,
    '',
    'User question about this capture:',
    trimmedQuestion,
    '',
    input.enableWebSearch
      ? "Answer the user's question using the captured image as the primary context, then verify or enrich the answer with OpenRouter web search when useful. If the answer is not supported by the capture or web context, say that briefly instead of guessing."
      : "Answer the user's question using the captured image as the primary context. If the answer is not supported by the capture, say that briefly instead of guessing."
  ].join('\n');
}

function deriveSourceHost(url: string, title: string | null): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').trim();
    if (hostname) {
      return hostname;
    }
  } catch {
    // Fall through to title-based fallback.
  }

  const normalizedTitle = title?.trim() ?? '';
  if (/^[\w.-]+\.[A-Za-z]{2,}$/i.test(normalizedTitle)) {
    return normalizedTitle;
  }

  return 'Source';
}

function normalizeSources(annotations: unknown[]): SourceLink[] {
  const seenUrls = new Set<string>();
  const sources: SourceLink[] = [];

  for (const annotation of annotations) {
    const raw = annotation as UrlCitationAnnotation | null;
    if (!raw || raw.type !== 'url_citation') {
      continue;
    }

    const url = typeof raw.url_citation?.url === 'string' ? raw.url_citation.url.trim() : '';
    const title = typeof raw.url_citation?.title === 'string' ? raw.url_citation.title.trim() : '';
    if (!url || seenUrls.has(url)) {
      continue;
    }

    try {
      new URL(url);
    } catch {
      continue;
    }

    seenUrls.add(url);
    const host = deriveSourceHost(url, title || null);
    sources.push({
      title: title || host || url,
      url,
      host
    });

    if (sources.length >= 5) {
      break;
    }
  }

  return sources;
}

function mergeSources(existing: SourceLink[], next: SourceLink[]): SourceLink[] {
  const seen = new Set(existing.map((source) => source.url));
  const merged = [...existing];

  next.forEach((source) => {
    if (seen.has(source.url) || merged.length >= 5) {
      return;
    }

    seen.add(source.url);
    merged.push(source);
  });

  return merged;
}

function getWebSearchRequestCount(payload: Record<string, unknown>): number {
  const usage = payload.usage as { server_tool_use?: { web_search_requests?: unknown } } | undefined;
  const rawCount = usage?.server_tool_use?.web_search_requests;
  return typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : 0;
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }

      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

function createRequestBody(input: AnalyzeImageInput, stream: boolean): string {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildPrompt(input)
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${input.imageMimeType};base64,${input.imageBase64Data}`
            }
          }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 1400,
    stream
  };

  if (stream) {
    body.stream_options = {
      include_usage: true
    };
  }

  if (input.enableWebSearch) {
    body.tools = [
      {
        type: 'openrouter:web_search',
        parameters: {
          max_results: 3,
          max_total_results: 3,
          search_context_size: 'low'
        }
      }
    ];
  }

  return JSON.stringify(body);
}

async function parseProviderError(response: Response): Promise<never> {
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
    'OpenRouter request failed.';

  throw new ProviderRequestError(
    'openrouter',
    response.status,
    typeof message === 'string' && message.trim() ? message.trim() : 'OpenRouter request failed.',
    isRetryableStatus(response.status)
  );
}

function parseSseBuffer(buffer: string): {
  events: string[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remainder = parts.pop() ?? '';
  return {
    events: parts,
    remainder
  };
}

function updateMetadataFromPayload(
  payload: Record<string, unknown>,
  state: { model: string; sources: SourceLink[]; webSearchRequests: number }
): void {
  if (typeof payload.model === 'string' && payload.model.trim()) {
    state.model = payload.model.trim();
  }

  state.webSearchRequests += getWebSearchRequestCount(payload);
}

function extractChoiceData(choice: unknown): { text: string; sources: SourceLink[] } {
  if (!choice || typeof choice !== 'object') {
    return { text: '', sources: [] };
  }

  const rawChoice = choice as {
    delta?: { content?: unknown; annotations?: unknown };
    message?: { content?: unknown; annotations?: unknown };
  };
  const annotations = [rawChoice.delta?.annotations, rawChoice.message?.annotations]
    .filter(Array.isArray)
    .flat() as unknown[];

  return {
    text: extractTextContent(rawChoice.delta?.content ?? rawChoice.message?.content),
    sources: normalizeSources(annotations)
  };
}

async function requestOpenRouterCompletion(input: AnalyzeImageInput): Promise<OpenRouterCompletionResult> {
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xerolas.vercel.app',
      'X-Title': 'Xerolas'
    },
    body: createRequestBody(input, false)
  });

  if (!response.ok) {
    await parseProviderError(response);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const state = {
    model: input.model,
    sources: [] as SourceLink[],
    webSearchRequests: 0
  };
  updateMetadataFromPayload(payload, state);

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const textParts: string[] = [];

  choices.forEach((choice) => {
    const data = extractChoiceData(choice);
    if (data.text) {
      textParts.push(data.text);
    }
    state.sources = mergeSources(state.sources, data.sources);
  });

  return {
    text: textParts.join('').trim(),
    model: state.model,
    grounding: {
      groundingUsed: state.webSearchRequests > 0 || state.sources.length > 0,
      sources: state.sources
    }
  };
}

async function requestOpenRouterStream(input: AnalyzeImageInput): Promise<OpenRouterOpenStreamResult> {
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xerolas.vercel.app',
      'X-Title': 'Xerolas'
    },
    body: createRequestBody(input, true)
  });

  if (!response.ok) {
    await parseProviderError(response);
  }

  if (!response.body) {
    throw new Error('OpenRouter returned no stream for this image.');
  }

  let latestModel = input.model;
  let latestSources: SourceLink[] = [];
  let webSearchRequests = 0;
  let emittedText = false;
  let lastGroundingSignature = '';

  const getGrounding = (): OpenRouterGroundingResult => ({
    groundingUsed: webSearchRequests > 0 || latestSources.length > 0,
    sources: latestSources
  });

  const createGroundingEvent = (): OpenRouterStreamEvent | null => {
    const grounding = getGrounding();
    if (!grounding.groundingUsed && !grounding.sources.length) {
      return null;
    }

    const nextSignature = getGroundingSignature(grounding);
    if (nextSignature === lastGroundingSignature) {
      return null;
    }

    lastGroundingSignature = nextSignature;
    return { type: 'grounding', grounding };
  };

  const stream = async function* (): AsyncGenerator<OpenRouterStreamEvent> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (block: string): OpenRouterStreamEvent[] => {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .filter(Boolean);

      if (!dataLines.length) {
        return [];
      }

      const payloadText = dataLines.join('\n').trim();
      if (!payloadText || payloadText === '[DONE]') {
        return [];
      }

      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      const state = {
        model: latestModel,
        sources: latestSources,
        webSearchRequests
      };
      updateMetadataFromPayload(payload, state);
      latestModel = state.model;
      latestSources = state.sources;
      webSearchRequests = state.webSearchRequests;

      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const textEvents: OpenRouterStreamEvent[] = [];
      choices.forEach((choice) => {
        const data = extractChoiceData(choice);
        latestSources = mergeSources(latestSources, data.sources);
        if (data.text) {
          textEvents.push({ type: 'text', text: data.text });
        }
      });

      const groundingEvent = createGroundingEvent();
      return groundingEvent ? [groundingEvent, ...textEvents] : textEvents;
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.remainder;

      for (const block of parsed.events) {
        const events = processEventBlock(block);
        for (const event of events) {
          if (event.type === 'text' && event.text.trim()) {
            emittedText = true;
          }
          yield event;
        }
      }

      if (done) {
        break;
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const events = processEventBlock(trailing);
      for (const event of events) {
        if (event.type === 'text' && event.text.trim()) {
          emittedText = true;
        }
        yield event;
      }
    }

    if (!emittedText) {
      const completion = await requestOpenRouterCompletion(input);
      latestModel = completion.model;
      latestSources = mergeSources(latestSources, completion.grounding.sources);
      webSearchRequests += completion.grounding.groundingUsed ? 1 : 0;

      const groundingEvent = createGroundingEvent();
      if (groundingEvent) {
        yield groundingEvent;
      }

      if (!completion.text) {
        throw new Error('OpenRouter returned no text for this image.');
      }

      emittedText = true;
      yield { type: 'text', text: completion.text };
    }
  };

  return {
    stream: stream(),
    model: latestModel,
    webSearchAttempted: input.enableWebSearch,
    getGrounding
  };
}

export async function streamImageWithOpenRouter(input: AnalyzeImageInput): Promise<OpenRouterOpenStreamResult> {
  return requestOpenRouterStream(input);
}

export async function analyzeImageWithOpenRouter(
  input: AnalyzeImageInput
): Promise<{ text: string; model: string; groundingUsed: boolean; sources: SourceLink[] }> {
  const opened = await requestOpenRouterStream(input);
  let text = '';

  for await (const event of opened.stream) {
    if (event.type === 'text') {
      text += event.text;
    }
  }

  if (!text.trim()) {
    throw new Error('OpenRouter returned no text for this image.');
  }

  const grounding = opened.getGrounding();

  return {
    text: text.trim(),
    model: opened.model,
    groundingUsed: grounding.groundingUsed,
    sources: grounding.sources
  };
}
