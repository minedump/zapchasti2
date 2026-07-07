import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_API_KEY}` };
}

export async function GET() {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const res = await fetch(`${GATEWAY_URL}/v1/accounts`, { headers: authHeaders() });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const body = await req.json();
  const res = await fetch(`${GATEWAY_URL}/v1/accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
