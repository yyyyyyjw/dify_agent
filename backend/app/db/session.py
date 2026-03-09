from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# 数据库连接 URL
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# 创建引擎
# 如果是 SQLite，需要 check_same_thread=False
engine = create_engine(
    SQLALCHEMY_DATABASE_URL
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
