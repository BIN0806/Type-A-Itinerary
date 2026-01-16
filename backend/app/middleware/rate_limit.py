from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from ..core.redis_client import get_redis

# Create limiter instance
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="redis://redis:6379",
    strategy="fixed-window"
)

# Rate limit handlers
def setup_rate_limiting(app):
    """Setup rate limiting middleware on FastAPI app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    return limiter
