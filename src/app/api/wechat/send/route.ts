import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;

export async function POST(req: Request) {
  const { botName, userId, text } = await req.json();

  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }
  if (!botName || !userId || !text) {
    return NextResponse.json({ error: 'botName, userId and text are required' }, { status: 400 });
  }

  const response = await fetch(`${GATEWAY_URL}/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_API_KEY}` },
    body: JSON.stringify({ bot_name: botName, user_id: userId, content: text }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
