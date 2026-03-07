/** Use same-origin so the Next.js BFF proxy (RAILWAY_API_URL) is used; backend URL is server-only. */
const API_URL = "";

export type ApiOptions = { clientId?: string | null };

export type TicketUploadRowError = { row: number; message: string };
export type TicketUploadResult = {
  created: number;
  errors: TicketUploadRowError[];
};

function buildHeaders(
  token: string,
  options?: ApiOptions,
  omitContentType = false,
): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (!omitContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.clientId) {
    headers["X-Client-Id"] = options.clientId;
  }
  return headers;
}

async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
  options?: ApiOptions,
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
    let message = `API ${res.status}: ${text}`;
    try {
      const json = JSON.parse(text) as { detail?: string };
      if (typeof json.detail === "string") message = json.detail;
    } catch {
      /* use default message */
    }
    throw new Error(message);
  }
  const contentType = res.headers.get("content-type");
  const text = await res.text();
  if (!text || contentType?.includes("application/json") === false) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const apiClient = {
  get: <T>(path: string, token: string, options?: ApiOptions) =>
    apiFetch<T>(path, token, undefined, options),
  post: <T>(path: string, token: string, body: unknown, options?: ApiOptions) =>
    apiFetch<T>(
      path,
      token,
      { method: "POST", body: JSON.stringify(body) },
      options,
    ),

  /** Upload CSV file; returns result for 201 and 422 (invalid rows), throws for other errors. */
  uploadTickets: async (
    path: string,
    token: string,
    file: File,
    options?: ApiOptions,
  ): Promise<TicketUploadResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: buildHeaders(token, options, true),
      body: formData,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (res.status === 201 || res.status === 422) {
      const result = json as TicketUploadResult;
      return { created: result.created ?? 0, errors: result.errors ?? [] };
    }
    let message = `API ${res.status}: ${text}`;
    if (typeof (json as { detail?: string }).detail === "string") {
      message = (json as { detail: string }).detail;
    }
    throw new Error(message);
  },
};
