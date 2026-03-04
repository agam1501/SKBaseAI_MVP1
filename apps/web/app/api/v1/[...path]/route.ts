import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const RAILWAY_URL = process.env.RAILWAY_API_URL

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'GET')
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'POST', await req.json())
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'PATCH', await req.json())
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'DELETE')
}

async function proxy(req: NextRequest, pathSegments: string[], method: string, body?: unknown) {
  const supabase = createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = `${RAILWAY_URL}/api/v1/${pathSegments.join('/')}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
