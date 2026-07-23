from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    openai_api_key: str = ""
    openrouter_api_key: str = ""
    
    @property
    def api_key(self) -> str:
        """Returnerer den første tilgjengelige API-nøkkelen."""
        return self.openai_api_key or self.openrouter_api_key
    
    model_config = {
        "env_file": ".env",
        "extra": "allow"
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()