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

export type TaxonomyBusinessCategory = {
  id: string;
  client_id: string | null;
  l1: string;
  l2: string;
  l3: string;
  node: string;
  label: string | null;
  parent_node_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  keywords: string | null;
};

export type TaxonomyApplication = {
  id: string;
  client_id: string | null;
  l1: string;
  l2: string;
  l3: string;
  node_id: string;
  label: string | null;
  software_vendor: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  product_name: string | null;
  keywords: unknown;
  app_group: string | null;
  category: string | null;
  description: string | null;
};

export type TaxonomyResolution = {
  id: string;
  client_id: string | null;
  l1_outcome: string;
  l2_action_type: string;
  l3_resolution_code: string;
  resolution_code: string;
  resolution_durability: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  definition: string | null;
  examples: string | null;
  usage_guidance: string | null;
};

export type TaxonomyRootCause = {
  id: string;
  client_id: string | null;
  l1_cause_domain: string;
  l2_cause_type: string;
  l3_root_cause: string;
  root_cause_code_id: string;
  usage_guidance: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  default_owner: string | null;
  preventability: string | null;
  change_related: string | null;
  definition: string | null;
  examples: string | null;
};

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
  patch: <T>(path: string, token: string, body: unknown, options?: ApiOptions) =>
    apiFetch<T>(
      path,
      token,
      { method: "PATCH", body: JSON.stringify(body) },
      options,
    ),
  getTaxonomyBusinessCategories: (token: string, options?: ApiOptions) =>
    apiFetch<TaxonomyBusinessCategory[]>(
      "/api/v1/taxonomies/business-category",
      token,
      undefined,
      options,
    ),
  getTaxonomyApplications: (token: string, options?: ApiOptions) =>
    apiFetch<TaxonomyApplication[]>(
      "/api/v1/taxonomies/application",
      token,
      undefined,
      options,
    ),
  getTaxonomyResolutions: (token: string, options?: ApiOptions) =>
    apiFetch<TaxonomyResolution[]>(
      "/api/v1/taxonomies/resolution",
      token,
      undefined,
      options,
    ),
  getTaxonomyRootCauses: (token: string, options?: ApiOptions) =>
    apiFetch<TaxonomyRootCause[]>(
      "/api/v1/taxonomies/root-cause",
      token,
      undefined,
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
