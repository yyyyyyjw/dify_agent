import axios from 'axios';

// Docker 部署时为空字符串，走 next.config.ts 的 rewrites 代理到 backend 容器
// 本地开发时在 .env.local 中设置 NEXT_PUBLIC_API_URL=http://localhost:8000
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const api = axios.create({
  baseURL: API_URL,
});

// 请求拦截器：自动注入 JWT Token
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401 未授权
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const fetchSSE = async (url: string, data: any, onMessage: (data: any) => void) => {
  const token = sessionStorage.getItem('token');
  const response = await fetch(`${API_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  // 用行缓冲拼接跨 read() 切片的数据，避免大块 SSE 事件被截断导致 JSON 解析失败
  let lineBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    lineBuffer += decoder.decode(value, { stream: true });
    const lines = lineBuffer.split('\n');
    // 最后一段可能是不完整的行，留给下次拼接
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonData = JSON.parse(line.slice(6));
          // 后端发来的 error 事件：抛出错误让 handleSendMessage catch 块统一处理
          if (jsonData.event === 'error') {
            throw new Error(jsonData.message || '消息发送失败，请稍后重试');
          }
          onMessage(jsonData);
        } catch (e) {
          if (e instanceof Error && !e.message.includes('JSON')) {
            throw e;
          }
          console.error('Error parsing SSE data', e);
        }
      }
    }
  }
};
