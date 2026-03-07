import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

const BACKEND_URL = process.env.API_BACKEND_URL

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

  const url = `${BACKEND_URL}/api/v1/${pathSegments.join("/")}`;
  const clientId = req.headers.get("x-client-id");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  if (clientId) headers["X-Client-Id"] = clientId;

  const isFormData = body instanceof FormData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined && body !== null
      ? { body: isFormData ? body : JSON.stringify(body) }
      : {}),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
