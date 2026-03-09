# Dify Agent 前后端分离系统 (Backend)

这是一个基于 FastAPI 开发的后端系统，旨在对接 Dify 工作流 API，并提供用户管理、对话持久化及评分反馈功能。

## 🚀 快速启动

### 1. 环境准备
确保已安装：
- Docker & Docker Compose
- Python 3.10+

### 2. 配置环境变量
在 `backend/` 目录下创建 `.env` 文件（已在 `.gitignore` 中忽略，请勿提交）：
```env
# 数据库配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=dify_agent
DATABASE_URL=postgresql://postgres:your_password@db:5432/dify_agent

# JWT 配置
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Dify 配置
DIFY_API_KEY=your_dify_api_key
DIFY_API_URL=http://host.docker.internal:端口/v1
```
> **注意**：在 Docker 环境下，`DATABASE_URL` 的主机名应为 `db`（或 docker-compose 中定义的数据库服务名）。

### 3. 启动数据库
```bash
docker-compose up -d
```

### 4. 运行后端
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
访问 API 文档：`http://127.0.0.1:8000/docs`

---

## 🛠️ 核心接口说明

### 1. 用户认证 (Auth)
- `POST /auth/register`: 注册新用户。
- `POST /auth/login`: 登录并获取 JWT Token。
- `GET /auth/me`: 获取当前登录用户信息。

### 2. 对话管理 (Chat)
- `POST /chat/chat`: 发送消息。
  - 支持流式返回 (SSE)。
  - 自动调用 Dify 工作流。
  - 自动保存用户提问和 AI 回答到本地数据库。
- `GET /chat/conversations`: 获取历史对话列表。
- `GET /chat/conversations/{id}/messages`: 获取特定对话的所有消息。

### 3. 评分反馈 (Feedback)
- `POST /feedback/`: 为 AI 的回答评分。
  - 参数：`message_id` (本地消息ID), `rating` (1-5), `comment` (可选)。
- `GET /feedback/{message_id}`: 查看某条消息的评分。

---

## 📂 目录结构
- `app/api/`: 路由接口实现。
- `app/core/`: 核心配置（Dify 客户端、JWT 安全、全局配置）。
- `app/crud/`: 数据库增删改查逻辑。
- `app/models/`: SQLAlchemy 数据库模型。
- `app/schemas/`: Pydantic 数据验证模型。
- `app/db/`: 数据库连接与会话管理。
