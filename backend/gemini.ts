import {
  isRetryableProviderError,
  isRetryableStatus,
  ProviderRequestError
} from './provider-error';
import type { SourceLink } from '../src/shared/types';

interface AnalyzeImageInput {
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiGroundingResult {
  groundingUsed: boolean;
  sources: SourceLink[];
}

type GeminiStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'grounding'; grounding: GeminiGroundingResult };

interface GeminiOpenStreamResult {
  stream: AsyncGenerator<GeminiStreamEvent>;
  model: string;
  usedFallback: boolean;
  webSearchAttempted: boolean;
  getGrounding: () => GeminiGroundingResult;
}

const SHARED_GEMINI_INSTRUCTION = [
  'You are Xerolas, a desktop visual assistant.',
  'Focus on the main subject inside the selected region.',
  'Ignore browser chrome, toolbars, app frames, and surrounding UI unless they are directly relevant to the user request.',
  'If the capture contains a question, puzzle, article, code block, error, document, or worksheet, solve or explain that content instead of mainly narrating the layout.',
  'Lead with the most useful answer first, then give short supporting points if needed.',
  'Keep the response concise, grounded in what is visible, and practical.',
  'Use plain text only. Do not use markdown tables, code fences, or bold markers.'
].join(' ');

const GROUNDED_GEMINI_INSTRUCTION = [
  'Always combine visual understanding with the available Google Search grounding tool so the answer can use current web context when Gemini can ground it.',
  'When web grounding returns sources, base current facts on those sources and keep the source attribution available through grounding metadata.'
].join(' ');

const VISUAL_ONLY_CAPACITY_FALLBACK_INSTRUCTION =
  'Google Search grounding is temporarily unavailable for this retry. Do not mention that limitation unless the user asks; answer from the captured image and visible context only.';

const EMPTY_GROUNDING: GeminiGroundingResult = {
  groundingUsed: false,
  sources: []
};

function getGroundingSignature(grounding: GeminiGroundingResult): string {
  return [grounding.groundingUsed ? '1' : '0', ...grounding.sources.map((source) => source.url)].join('|');
}

function buildGeminiPrompt(promptTemplate: string, question?: string, useGrounding = true): string {
  const trimmedPrompt = promptTemplate.trim();
  const trimmedQuestion = question?.trim();
  const instruction = [
    SHARED_GEMINI_INSTRUCTION,
    useGrounding ? GROUNDED_GEMINI_INSTRUCTION : VISUAL_ONLY_CAPACITY_FALLBACK_INSTRUCTION
  ].join(' ');

  if (!trimmedQuestion) {
    return `${instruction}

User request:
${trimmedPrompt}`;
  }

  const questionInstruction = useGrounding
    ? "Answer the user's question using the captured image as the primary context, then verify or enrich the answer with Google Search grounding when available. If the answer is not supported by the capture or grounded web context, say that briefly instead of guessing."
    : "Answer the user's question using the captured image as the primary context. If the answer is not supported by the capture, say that briefly instead of guessing.";

  return [
    instruction,
    '',
    'Primary task:',
    trimmedPrompt,
    '',
    'User question about this capture:',
    trimmedQuestion,
    '',
    questionInstruction
  ].join('\n');
}

function extractGeminiTextChunk(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const content = (candidate as { content?: { parts?: GeminiPart[] } }).content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');

    if (text) {
      return text;
    }
  }

  const promptFeedback = payload.promptFeedback as { blockReason?: unknown } | undefined;
  if (typeof promptFeedback?.blockReason === 'string' && promptFeedback.blockReason.trim()) {
    throw new Error(`Gemini blocked the request: ${promptFeedback.blockReason.trim()}.`);
  }

  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function deriveSourceHost(uri: string, title: string | null): string {
  try {
    const hostname = new URL(uri).hostname.replace(/^www\./i, '').trim();
    if (hostname && !hostname.includes('vertexaisearch.cloud.google.com')) {
      return hostname;
    }
  } catch {
    // Ignore parse failures and fall through to title-based fallback.
  }

  const normalizedTitle = title?.trim() ?? '';
  if (/^[\w.-]+\.[A-Za-z]{2,}$/i.test(normalizedTitle)) {
    return normalizedTitle;
  }

  try {
    const hostname = new URL(uri).hostname.replace(/^www\./i, '').trim();
    if (hostname) {
      return hostname;
    }
  } catch {
    // Ignore parse failures and use a generic label.
  }

  return 'Source';
}

function normalizeGroundingSources(chunks: unknown[]): SourceLink[] {
  const seenUrls = new Set<string>();
  const sources: SourceLink[] = [];

  for (const chunk of chunks) {
    const web =
      chunk && typeof chunk === 'object'
        ? ((chunk as { web?: unknown }).web as Record<string, unknown> | undefined)
        : undefined;
    const uri = typeof web?.uri === 'string' ? web.uri.trim() : '';
    const title = typeof web?.title === 'string' ? web.title.trim() : '';

    if (!uri || seenUrls.has(uri)) {
      continue;
    }

    try {
      new URL(uri);
    } catch {
      continue;
    }

    seenUrls.add(uri);
    const host = deriveSourceHost(uri, title || null);
    sources.push({
      title: title || host || uri,
      url: uri,
      host
    });

    if (sources.length >= 5) {
      break;
    }
  }

  return sources;
}

function extractGeminiGrounding(payload: Record<string, unknown>): GeminiGroundingResult {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const groundingMetadata =
      candidate && typeof candidate === 'object'
        ? ((candidate as { groundingMetadata?: unknown }).groundingMetadata as
            | Record<string, unknown>
            | undefined)
        : undefined;

    if (!groundingMetadata) {
      continue;
    }

    const queries = Array.isArray(groundingMetadata.webSearchQueries)
      ? groundingMetadata.webSearchQueries.filter(
          (query): query is string => typeof query === 'string' && query.trim().length > 0
        )
      : [];
    const chunks = Array.isArray(groundingMetadata.groundingChunks)
      ? groundingMetadata.groundingChunks
      : [];
    const supports = Array.isArray(groundingMetadata.groundingSupports)
      ? groundingMetadata.groundingSupports
      : [];

    const sources = normalizeGroundingSources(chunks);
    const groundingUsed = queries.length > 0 || chunks.length > 0 || supports.length > 0;

    if (groundingUsed || sources.length > 0) {
      return {
        groundingUsed,
        sources
      };
    }
  }

  return EMPTY_GROUNDING;
}

function createGeminiRequestBody(input: {
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
  useGrounding?: boolean;
}): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          { text: buildGeminiPrompt(input.promptTemplate, input.question, input.useGrounding ?? true) },
          {
            inline_data: {
              mime_type: input.imageMimeType,
              data: input.imageBase64Data
            }
          }
        ]
      }
    ],
    ...(input.useGrounding === false
      ? {}
      : {
          tools: [
            {
              google_search: {}
            }
          ]
        })
  });
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

async function requestGeminiAnalysisStream(input: {
  apiKey: string;
  model: string;
  promptTemplate: string;
  question?: string;
  imageMimeType: string;
  imageBase64Data: string;
  useGrounding?: boolean;
}): Promise<{
  stream: AsyncGenerator<GeminiStreamEvent>;
  model: string;
  webSearchAttempted: boolean;
  getGrounding: () => GeminiGroundingResult;
}> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey
      },
      body: createGeminiRequestBody(input)
    }
  );

  const parseProviderError = async (): Promise<never> => {
    const rawBody = await response.text();
    let payload: Record<string, unknown> = {};

    try {
      payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }

    const errorMessage =
      (payload.error as { message?: unknown } | undefined)?.message ??
      rawBody.trim() ??
      'Gemini request failed.';

    throw new ProviderRequestError(
      'gemini',
      response.status,
      typeof errorMessage === 'string' && errorMessage.trim()
        ? errorMessage.trim()
        : 'Gemini request failed.',
      isRetryableStatus(response.status)
    );
  };

  if (!response.ok) {
    await parseProviderError();
  }

  if (!response.body) {
    throw new Error('Gemini returned no stream for this image.');
  }

  let latestGrounding = EMPTY_GROUNDING;

  const stream = async function* (): AsyncGenerator<GeminiStreamEvent> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastGroundingSignature = '';

    const processEventBlock = (block: string): GeminiStreamEvent[] => {
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

      const events: GeminiStreamEvent[] = [];
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      const grounding = extractGeminiGrounding(payload);
      if (grounding.groundingUsed || grounding.sources.length > 0) {
        latestGrounding = grounding;
        const nextSignature = getGroundingSignature(grounding);
        if (nextSignature !== lastGroundingSignature) {
          lastGroundingSignature = nextSignature;
          events.push({ type: 'grounding', grounding });
        }
      }

      const chunkText = extractGeminiTextChunk(payload);
      if (chunkText) {
        events.push({ type: 'text', text: chunkText });
      }

      return events;
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.remainder;

      for (const block of parsed.events) {
        const events = processEventBlock(block);
        for (const event of events) {
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
        yield event;
      }
    }
  };

  return {
    stream: stream(),
    model: input.model,
    webSearchAttempted: input.useGrounding ?? true,
    getGrounding: () => latestGrounding
  };
}

async function openGeminiAnalysisStream(input: AnalyzeImageInput): Promise<GeminiOpenStreamResult> {
  const attempts: Array<{
    model: string;
    usedFallback: boolean;
    useGrounding: boolean;
    delayMs: number;
  }> = [
    {
      model: input.primaryModel,
      usedFallback: false,
      useGrounding: true,
      delayMs: 0
    },
    {
      model: input.primaryModel,
      usedFallback: false,
      useGrounding: true,
      delayMs: 700
    }
  ];

  if (input.fallbackModel && input.fallbackModel !== input.primaryModel) {
    attempts.push({
      model: input.fallbackModel,
      usedFallback: true,
      useGrounding: true,
      delayMs: 0
    });
  }

  attempts.push({
    model: input.primaryModel,
    usedFallback: false,
    useGrounding: false,
    delayMs: 400
  });

  if (input.fallbackModel && input.fallbackModel !== input.primaryModel) {
    attempts.push({
      model: input.fallbackModel,
      usedFallback: true,
      useGrounding: false,
      delayMs: 0
    });
  }

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }

    try {
      const opened = await requestGeminiAnalysisStream({
        apiKey: input.apiKey,
        model: attempt.model,
        promptTemplate: input.promptTemplate,
        question: input.question,
        imageMimeType: input.imageMimeType,
        imageBase64Data: input.imageBase64Data,
        useGrounding: attempt.useGrounding
      });
      return {
        ...opened,
        usedFallback: attempt.usedFallback
      };
    } catch (error) {
      if (!isRetryableProviderError(error)) {
        throw error;
      }
    }
  }

  throw new ProviderRequestError(
    'gemini',
    503,
    'Xerolas is temporarily waiting for Gemini capacity. Please try again in a moment.',
    true
  );
}

export async function streamImageWithGemini(
  input: AnalyzeImageInput
): Promise<GeminiOpenStreamResult> {
  return openGeminiAnalysisStream(input);
}

export async function analyzeImageWithGemini(
  input: AnalyzeImageInput
): Promise<{ text: string; model: string; usedFallback: boolean; groundingUsed: boolean; sources: SourceLink[] }> {
  const opened = await openGeminiAnalysisStream(input);
  let text = '';

  for await (const event of opened.stream) {
    if (event.type === 'text') {
      text += event.text;
    }
  }

  if (!text.trim()) {
    throw new Error('Gemini returned no text for this image.');
  }

  const grounding = opened.getGrounding();

  return {
    text: text.trim(),
    model: opened.model,
    usedFallback: opened.usedFallback,
    groundingUsed: grounding.groundingUsed,
    sources: grounding.sources
  };
}
