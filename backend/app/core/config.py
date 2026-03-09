from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 数据库配置
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "your_password"
    POSTGRES_DB: str = "dify_agent"
    DATABASE_URL: str = "postgresql://postgres:your_password@localhost:5432/dify_agent"

    # JWT 配置
    SECRET_KEY: str = "your_secret_key_here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # Dify 配置
    DIFY_API_KEY: str = "your_dify_api_key"
    DIFY_API_URL: str = "https://api.dify.ai/v1"

    class Config:
        env_file = ".env"

settings = Settings()
