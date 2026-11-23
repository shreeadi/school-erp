from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-based configuration for the AI service."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    # Restricted runtime role; Row-Level Security applies to every query.
    database_url: str = "postgresql://erp_app:erp_app_dev_password@localhost:5432/school_erp"
    # Shared secret with the NestJS API. Only the API may call this service.
    ai_service_token: str = "change-me-to-a-long-random-secret-at-least-32-chars"
    # Max age of a signed tenant context, in seconds.
    context_max_age_seconds: int = 60
    # LLM provider settings (used from the AI phase onwards).
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5-5"
    llm_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
