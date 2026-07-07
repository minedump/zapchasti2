import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;

export async function GET(req: Request, { params }: { params: Promise<{ botName: string }> }) {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const { botName } = await params;
  const res = await fetch(`${GATEWAY_URL}/v1/accounts/${encodeURIComponent(botName)}/qr`, {
    headers: { Authorization: `Bearer ${GATEWAY_API_KEY}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
