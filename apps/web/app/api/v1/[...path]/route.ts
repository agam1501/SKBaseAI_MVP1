import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

/** Backend API base URL. Fallback for local dev when RAILWAY_API_URL is not set. */
const API_BASE_URL = process.env.RAILWAY_API_URL ?? "http://127.0.0.1:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxy(req, params.path, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const contentType = req.headers.get("content-type") ?? "";
  const body = contentType.includes("multipart/form-data")
    ? await req.formData()
    : await req.json().catch(() => undefined);
  return proxy(req, params.path, "POST", body);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxy(req, params.path, "PATCH", await req.json());
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxy(req, params.path, "DELETE");
}

async function proxy(
  req: NextRequest,
  pathSegments: string[],
  method: string,
  body?: unknown,
) {
  const supabase = createSupabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = `${API_BASE_URL}/api/v1/${pathSegments.join("/")}${req.nextUrl.search}`;
  const clientId = req.headers.get("x-client-id");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  if (clientId) headers["X-Client-Id"] = clientId;

  const isFormData = body instanceof FormData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && body !== null
        ? { body: isFormData ? body : JSON.stringify(body) }
        : {}),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Backend request failed";
    return NextResponse.json(
      {
        detail: `API proxy could not reach the backend (${API_BASE_URL}). Is the API server running? ${message}`,
      },
      { status: 503 },
    );
  }

  const text = await res.text();
  if (!text) {
    return NextResponse.json(
      { detail: "Backend returned empty response" },
      { status: 502 },
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON backend response (e.g. uvicorn plain-text 500) — pass through as-is
    return new NextResponse(text, { status: res.status });
  }
  return NextResponse.json(data, { status: res.status });
}
