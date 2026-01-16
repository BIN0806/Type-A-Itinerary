from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # Database
    DATABASE_URL: str
    
    # Redis
    REDIS_URL: str
    
    # External APIs
    OPENAI_API_KEY: str
    GOOGLE_MAPS_API_KEY: str
    
    # Security
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Application
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/v1"
    PROJECT_NAME: str = "V2V - Visual to Voyage"
    
    # Rate Limiting
    RATE_LIMIT_UPLOADS_PER_HOUR: int = 10
    RATE_LIMIT_OPTIMIZATIONS_PER_DAY: int = 50
    
    # Google Maps
    MAX_WAYPOINTS_IN_URL: int = 9
    DISTANCE_MATRIX_CACHE_TTL: int = 60 * 60 * 24 * 30  # 30 days
    
    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"
    
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
