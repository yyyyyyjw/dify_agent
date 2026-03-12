*** 该分支下的配置支持本地运行，为最基础的版本 ***
# Dify Agent 前后端分离系统

这是一个集成了 Dify 工作流 API 的全栈应用，包含 FastAPI 后端和 React 前端。支持用户管理、流式对话持久化及评分反馈功能。

## 🌟 项目特点

- **前后端分离**：后端使用 FastAPI，前端使用现代 React 框架。
- **Dify 集成**：深度对接 Dify 工作流 API，支持 SSE 流式返回。
- **持久化存储**：自动保存对话历史和用户反馈。
- **容器化部署**：支持 Docker Compose 一键启动。

## 🚀 快速启动

### 1. 环境准备
确保已安装：
- Docker & Docker Compose
- Python 3.10+
- Node.js 18+

### 2. 配置环境变量
在根目录及 `backend/` 目录下根据模板创建 `.env` 文件。

**根目录 `.env` 示例：**
```env
# 数据库配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=dify_agent
```

**后端 `.env` 示例 (`backend/.env`)：**
```env
DATABASE_URL=postgresql://postgres:your_password@db:your_port/dify_agent
SECRET_KEY=your_secret_key
DIFY_API_KEY=your_dify_api_key
DIFY_API_URL=http://your_dify_api:your_port/v1
```

### 3. 一键启动 (Docker)
```bash
docker-compose up -d --build
```

## 📂 目录结构

- `backend/`: FastAPI 后端代码。
- `frontend/`: React 前端代码。
- `data/`: 数据库持久化存储目录（已忽略）。
- `docker-compose.yml`: 多容器定义。
- 
---

更多详细信息请参考 [Backend README](backend/README.md) 和 [Frontend README](frontend/README.md)。
