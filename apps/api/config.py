from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dims: int = 1536
    llm_model: str = "gpt-4o-mini"

    redis_url: str = "redis://localhost:6379/0"
    default_client_id: str = "00000000-0000-0000-0000-000000000001"
    cors_origins: str = "http://localhost:3000"
    site_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env", "../../.env"  # works from apps/api/ or project root
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
