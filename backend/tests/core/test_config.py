"""Tests for application configuration."""
import pytest
from app.core.config import Settings


class TestSettings:
    """Test Settings configuration class."""
    
    def test_settings_has_required_fields(self):
        """Verify all required configuration fields exist."""
        required_fields = [
            'DATABASE_URL',
            'REDIS_URL',
            'OPENAI_API_KEY',
            'GOOGLE_MAPS_API_KEY',
            'JWT_SECRET',
        ]
        
        settings = Settings()
        for field in required_fields:
            assert hasattr(settings, field), f"Missing required field: {field}"
    
    def test_settings_has_feature_flags(self):
        """Verify feature flag fields exist."""
        feature_flags = [
            'USE_MOCK_VISION',
            'USE_ENHANCED_PIPELINE',
        ]
        
        settings = Settings()
        for flag in feature_flags:
            assert hasattr(settings, flag), f"Missing feature flag: {flag}"
    
    def test_use_mock_vision_defaults_to_false(self):
        """Mock vision should be disabled by default."""
        settings = Settings()
        assert settings.USE_MOCK_VISION is False
    
    def test_use_enhanced_pipeline_defaults_to_true(self):
        """Enhanced pipeline should be enabled by default."""
        settings = Settings()
        assert settings.USE_ENHANCED_PIPELINE is True
    
    def test_environment_properties(self):
        """Test environment helper properties."""
        settings = Settings()
        
        # Should have environment detection methods
        assert hasattr(settings, 'is_development')
        assert hasattr(settings, 'is_production')
        assert isinstance(settings.is_development, bool)
        assert isinstance(settings.is_production, bool)
    
    def test_jwt_defaults(self):
        """Test JWT configuration defaults."""
        settings = Settings()
        
        assert settings.JWT_ALGORITHM == "HS256"
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 60 * 24 * 7  # 7 days
    
    def test_rate_limits_exist(self):
        """Test rate limiting configuration."""
        settings = Settings()
        
        assert hasattr(settings, 'RATE_LIMIT_UPLOADS_PER_HOUR')
        assert hasattr(settings, 'RATE_LIMIT_OPTIMIZATIONS_PER_DAY')
        assert settings.RATE_LIMIT_UPLOADS_PER_HOUR > 0
        assert settings.RATE_LIMIT_OPTIMIZATIONS_PER_DAY > 0
    
    def test_google_maps_config(self):
        """Test Google Maps configuration."""
        settings = Settings()
        
        assert settings.MAX_WAYPOINTS_IN_URL == 9
        assert settings.DISTANCE_MATRIX_CACHE_TTL == 60 * 60 * 24 * 30  # 30 days
    
    def test_api_prefix(self):
        """Test API versioning prefix."""
        settings = Settings()
        
        assert settings.API_V1_PREFIX == "/v1"
    
    def test_project_name(self):
        """Test project name configuration."""
        settings = Settings()
        
        assert settings.PROJECT_NAME == "Plan_A"
