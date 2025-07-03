import { tryCatch, Result } from "./try-catch.ts";

/**
 * Retries a function with exponential backoff on failure, returning a Result object.
 * @param fn Function returning a promise to retry
 * @param maxRetries Maximum number of attempts
 * @param baseDelay Initial delay in ms
 * @returns Result object with data or error
 */
export async function withExponentialBackoff<T, E = Error>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 200,
): Promise<Result<T, E>> {
  let attempt = 0;
  let lastError: E | unknown = null;
  while (attempt <= maxRetries) {
    const { data, error } = await tryCatch<T, E>(fn());
    if (data !== null) {
      return { data, error: null };
    }
    lastError = error;
    if (attempt === maxRetries) {
      break;
    }
    const delay = baseDelay * 2 ** attempt + Math.random() * 100;
    
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    attempt++;
  }
  return {
    data: null, error: lastError as E
  };
}
