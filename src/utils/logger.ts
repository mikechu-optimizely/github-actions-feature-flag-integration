/**
 * Structured logging utilities for the application.
 */
export function error(message: string, ...args: unknown[]): void {
  console.error(`[ERROR] ${message}`, ...args);
}

/**
 * Logs warning messages.
 */
export function warn(message: string, ...args: unknown[]): void {
  console.warn(`[WARN] ${message}`, ...args);
}

/**
 * Logs informational messages.
 */
export function info(message: string, ...args: unknown[]): void {
  console.info(`[INFO] ${message}`, ...args);
}

/**
 * Logs debug messages.
 */
export function debug(message: string, ...args: unknown[]): void {
  console.debug(`[DEBUG] ${message}`, ...args);
}
