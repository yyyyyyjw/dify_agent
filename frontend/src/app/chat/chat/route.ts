import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://backend:8000';

/**
 * 专用的 SSE 透传路由。
 * Next.js rewrites 代理流式响应时会产生缓冲，导致 SSE 事件无法实时到达浏览器。
 * Route Handler 可以直接把 backendResponse.body (ReadableStream) 作为响应体返回，
 * 完全不缓冲，实现真正的服务端推送。
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const authHeader = request.headers.get('Authorization') ?? '';

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BACKEND_URL}/chat/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body,
    });
  } catch {
    return new Response(JSON.stringify({ detail: 'Backend unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!backendResponse.ok) {
    return new Response(backendResponse.body, { status: backendResponse.status });
  }

  // 直接透传 ReadableStream，不缓冲
  return new Response(backendResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  });
}
