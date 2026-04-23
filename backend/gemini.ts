import {
  isRetryableProviderError,
  isRetryableStatus,
  ProviderRequestError
} from './provider-error';

interface AnalyzeImageInput {
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  promptTemplate: string;
  imageMimeType: string;
  imageBase64Data: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiOpenStreamResult {
  stream: AsyncGenerator<string>;
  model: string;
  usedFallback: boolean;
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

function buildGeminiPrompt(promptTemplate: string): string {
  return `${SHARED_GEMINI_INSTRUCTION}\n\nUser request:\n${promptTemplate.trim()}`;
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

function createGeminiRequestBody(input: {
  promptTemplate: string;
  imageMimeType: string;
  imageBase64Data: string;
}): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          { text: buildGeminiPrompt(input.promptTemplate) },
          {
            inline_data: {
              mime_type: input.imageMimeType,
              data: input.imageBase64Data
            }
          }
        ]
      }
    ]
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
  imageMimeType: string;
  imageBase64Data: string;
}): Promise<{ stream: AsyncGenerator<string>; model: string }> {
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

  const stream = async function* (): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (block: string): string[] => {
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
      const chunkText = extractGeminiTextChunk(payload);
      return chunkText ? [chunkText] : [];
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.remainder;

      for (const block of parsed.events) {
        const chunks = processEventBlock(block);
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      if (done) {
        break;
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const chunks = processEventBlock(trailing);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };

  return {
    stream: stream(),
    model: input.model
  };
}

async function openGeminiAnalysisStream(input: AnalyzeImageInput): Promise<GeminiOpenStreamResult> {
  try {
    const primary = await requestGeminiAnalysisStream({
      apiKey: input.apiKey,
      model: input.primaryModel,
      promptTemplate: input.promptTemplate,
      imageMimeType: input.imageMimeType,
      imageBase64Data: input.imageBase64Data
    });
    return {
      ...primary,
      usedFallback: false
    };
  } catch (initialError) {
    if (!isRetryableProviderError(initialError)) {
      throw initialError;
    }
  }

  await sleep(700);

  try {
    const retry = await requestGeminiAnalysisStream({
      apiKey: input.apiKey,
      model: input.primaryModel,
      promptTemplate: input.promptTemplate,
      imageMimeType: input.imageMimeType,
      imageBase64Data: input.imageBase64Data
    });
    return {
      ...retry,
      usedFallback: false
    };
  } catch (retryError) {
    if (!isRetryableProviderError(retryError)) {
      throw retryError;
    }
  }

  if (input.fallbackModel && input.fallbackModel !== input.primaryModel) {
    try {
      const fallback = await requestGeminiAnalysisStream({
        apiKey: input.apiKey,
        model: input.fallbackModel,
        promptTemplate: input.promptTemplate,
        imageMimeType: input.imageMimeType,
        imageBase64Data: input.imageBase64Data
      });
      return {
        ...fallback,
        usedFallback: true
      };
    } catch (fallbackError) {
      if (!isRetryableProviderError(fallbackError)) {
        throw fallbackError;
      }
    }
  }

  throw new Error('Xerolas is temporarily waiting for Gemini capacity. Please try again in a moment.');
}

export async function streamImageWithGemini(
  input: AnalyzeImageInput
): Promise<GeminiOpenStreamResult> {
  return openGeminiAnalysisStream(input);
}

export async function analyzeImageWithGemini(
  input: AnalyzeImageInput
): Promise<{ text: string; model: string; usedFallback: boolean }> {
  const opened = await openGeminiAnalysisStream(input);
  let text = '';

  for await (const chunk of opened.stream) {
    text += chunk;
  }

  if (!text.trim()) {
    throw new Error('Gemini returned no text for this image.');
  }

  return {
    text: text.trim(),
    model: opened.model,
    usedFallback: opened.usedFallback
  };
}
