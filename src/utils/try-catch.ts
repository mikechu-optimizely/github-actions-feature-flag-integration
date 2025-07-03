/**
 * Result type for tryCatch: either data or error is set, never both.
 */
export type Result<T, E = Error> = { data: T; error: null } | {
  data: null;
  error: E;
};

/**
 * Composable async error handling: wraps a promise and returns a result object.
 * @param promise Promise to execute
 * @returns Result object with data or error
 */
export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
