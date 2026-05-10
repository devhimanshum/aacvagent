import { auth } from '@/lib/firebase/config';

async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Wraps fetch with an AbortController timeout.
 * GET  → 30 s  (scanning inbox, fetching stats)
 * POST → 90 s  (processing a single CV through AI can take 30-45 s)
 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const timeoutMs   = method === 'GET' ? 30_000 : 90_000;
  const controller  = new AbortController();
  const timerId     = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = await getAuthHeader();
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body:    body !== undefined ? JSON.stringify(body) : undefined,
      signal:  controller.signal,
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        method === 'GET'
          ? 'Request timed out — server took longer than 30 s. Check your Outlook / API configuration.'
          : 'Request timed out — AI analysis took longer than 90 s. Check your OpenAI API key.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}

export const apiClient = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown)  => request<T>('PUT',    path, body),
  delete: <T>(path: string, body?: unknown)  => request<T>('DELETE', path, body),
};
