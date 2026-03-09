import httpx
import json
from typing import AsyncGenerator, Dict, Any, Optional
from app.core.config import settings


class DifyClient:
    def __init__(self):
        self.api_key = settings.DIFY_API_KEY
        self.base_url = settings.DIFY_API_URL
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        # 持久化 HTTP 客户端，复用 TCP/TLS 连接，减少每次请求的握手开销
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                # 流式请求：connect/write 保留超时，read=None 避免长回答被截断
                timeout=httpx.Timeout(connect=15.0, read=None, write=30.0, pool=15.0),
                limits=httpx.Limits(
                    max_keepalive_connections=10,
                    max_connections=20,
                    keepalive_expiry=30.0,
                ),
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def send_chat_message(
        self,
        query: str,
        user_id: str,
        dify_conversation_id: Optional[str] = None,
        inputs: Dict[str, Any] = {},
        streaming: bool = True
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        调用 Dify Chatflow API（/chat-messages）
        """
        url = f"{self.base_url}/chat-messages"
        data = {
            "query": query,
            "inputs": inputs,
            "response_mode": "streaming" if streaming else "blocking",
            "user": user_id,
        }
        if dify_conversation_id:
            data["conversation_id"] = dify_conversation_id

        client = self._get_client()

        if streaming:
            async with client.stream("POST", url, headers=self.headers, json=data) as response:
                if response.status_code != 200:
                    error_detail = await response.aread()
                    raise Exception(f"Dify API Error: {response.status_code} - {error_detail.decode()}")

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    line_data = line[6:]
                    if not line_data:
                        continue
                    try:
                        chunk = json.loads(line_data)
                        yield chunk
                    except json.JSONDecodeError:
                        continue
        else:
            response = await client.post(url, headers=self.headers, json=data)
            if response.status_code != 200:
                raise Exception(f"Dify API Error: {response.status_code} - {response.text}")
            yield response.json()


dify_client = DifyClient()
