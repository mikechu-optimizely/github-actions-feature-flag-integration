/**
 * Retries a function with exponential backoff on failure.
 * @param fn Function returning a promise to retry
 * @param maxRetries Maximum number of attempts
 * @param baseDelay Initial delay in ms
 * @returns Result of fn if successful, throws last error if all retries fail
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 200,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      const delay = baseDelay * 2 ** attempt + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
  throw lastError;
}
