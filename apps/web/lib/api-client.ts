const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiOptions = { clientId?: string | null };

function buildHeaders(token: string, options?: ApiOptions): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (options?.clientId) {
    headers["X-Client-Id"] = options.clientId;
  }
  return headers;
}

async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
  options?: ApiOptions
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(token, options),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, token: string, options?: ApiOptions) =>
    apiFetch<T>(path, token, undefined, options),
  post: <T>(path: string, token: string, body: unknown, options?: ApiOptions) =>
    apiFetch<T>(path, token, { method: "POST", body: JSON.stringify(body) }, options),
};
