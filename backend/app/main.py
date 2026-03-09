from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.db.session import engine, Base
from app.models.models import User, Conversation, Message, Feedback
from app.api import auth, chat, feedback, admin
from app.core.dify import dify_client

# 创建数据库表
Base.metadata.create_all(bind=engine)

# 自动迁移：添加新列（如果不存在）
def _run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_level VARCHAR NOT NULL DEFAULT 'free'"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

_run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # 关闭时释放 Dify HTTP 长连接
    await dify_client.close()


app = FastAPI(title="Dify Agent API", lifespan=lifespan)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Dify Agent API"}
