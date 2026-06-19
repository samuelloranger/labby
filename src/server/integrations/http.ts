export const TIMEOUT_MS = 15_000;

// Trim, strip a trailing slash, treat empty as null.
export function normalizeBase(url?: string): string | null {
  return url?.trim().replace(/\/$/, '') || null;
}

// Run a fetch flow; any thrown error becomes a soft { error } result.
// Fallback message is `${label} unreachable` when the throw is not an Error.
export async function soft<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : `${label} unreachable` };
  }
}
