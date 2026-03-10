from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# 数据库连接 URL
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# 创建引擎
# pool_pre_ping：每次取出连接前检测是否仍然有效，避免因 PostgreSQL 超时回收导致的 "connection closed" 错误
# pool_size/max_overflow：4 个 gunicorn worker × 5 个连接 = 最多 20 个长连接
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# 会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 基类
Base = declarative_base()

# 获取数据库连接的依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
