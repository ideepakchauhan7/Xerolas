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

const SHARED_GEMINI_INSTRUCTION = [
  'You are Xerolas, a desktop visual assistant.',
  'Focus on the main subject inside the selected region.',
  'Ignore browser chrome, toolbars, app frames, and surrounding UI unless they are directly relevant to the user request.',
  'If the capture contains a question, puzzle, article, code block, error, document, or worksheet, solve or explain that content instead of mainly narrating the layout.',
  'Lead with the most useful answer first, then give short supporting points if needed.',
  'Keep the response concise, grounded in what is visible, and practical.',
  'Use plain text only. Do not use markdown tables, code fences, or bold markers.'
].join(' ');

function extractGeminiText(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const content = (candidate as { content?: { parts?: GeminiPart[] } }).content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (text) {
      return text;
    }
  }

  const promptFeedback = payload.promptFeedback as { blockReason?: unknown } | undefined;
  if (typeof promptFeedback?.blockReason === 'string' && promptFeedback.blockReason.trim()) {
    throw new Error(`Gemini blocked the request: ${promptFeedback.blockReason.trim()}.`);
  }

  throw new Error('Gemini returned no text for this image.');
}

function buildGeminiPrompt(promptTemplate: string): string {
  return `${SHARED_GEMINI_INSTRUCTION}\n\nUser request:\n${promptTemplate.trim()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestGeminiAnalysis(input: {
  apiKey: string;
  model: string;
  promptTemplate: string;
  imageMimeType: string;
  imageBase64Data: string;
}): Promise<{ text: string; model: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey
      },
      body: JSON.stringify({
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
      })
    }
  );

  const rawBody = await response.text();
  let payload: Record<string, unknown> = {};

  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
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
  }

  return {
    text: extractGeminiText(payload),
    model: input.model
  };
}

export async function analyzeImageWithGemini(
  input: AnalyzeImageInput
): Promise<{ text: string; model: string; usedFallback: boolean }> {
  try {
    const primaryResult = await requestGeminiAnalysis({
      apiKey: input.apiKey,
      model: input.primaryModel,
      promptTemplate: input.promptTemplate,
      imageMimeType: input.imageMimeType,
      imageBase64Data: input.imageBase64Data
    });
    return {
      ...primaryResult,
      usedFallback: false
    };
  } catch (initialError) {
    if (!isRetryableProviderError(initialError)) {
      throw initialError;
    }
  }

  await sleep(700);

  try {
    const retryResult = await requestGeminiAnalysis({
      apiKey: input.apiKey,
      model: input.primaryModel,
      promptTemplate: input.promptTemplate,
      imageMimeType: input.imageMimeType,
      imageBase64Data: input.imageBase64Data
    });
    return {
      ...retryResult,
      usedFallback: false
    };
  } catch (retryError) {
    if (!isRetryableProviderError(retryError)) {
      throw retryError;
    }
  }

  if (input.fallbackModel && input.fallbackModel !== input.primaryModel) {
    try {
      const fallbackResult = await requestGeminiAnalysis({
        apiKey: input.apiKey,
        model: input.fallbackModel,
        promptTemplate: input.promptTemplate,
        imageMimeType: input.imageMimeType,
        imageBase64Data: input.imageBase64Data
      });
      return {
        ...fallbackResult,
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
