export class ProviderRequestError extends Error {
  provider: string;
  status: number;
  retryable: boolean;

  constructor(provider: string, status: number, message: string, retryable = false) {
    super(message);
    this.name = 'ProviderRequestError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function isCapacityErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  return (
    normalizedMessage.includes('resource_exhausted') ||
    normalizedMessage.includes('high demand') ||
    normalizedMessage.includes('temporarily unavailable') ||
    normalizedMessage.includes('overloaded') ||
    normalizedMessage.includes('try again later') ||
    normalizedMessage.includes('quota exceeded')
  );
}

export function isRetryableProviderError(error: unknown): error is ProviderRequestError {
  return error instanceof ProviderRequestError && (error.retryable || isCapacityErrorMessage(error.message));
}
