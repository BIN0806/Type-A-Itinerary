"""Tests for OCR service."""
import pytest
from PIL import Image
import io
from app.services.ocr_service import ocr_service


class TestExtractText:
    """Test text extraction from images."""
    
    @pytest.fixture
    def sample_text_image(self):
        """Create a simple test image with text."""
        # Create a white image with black text
        img = Image.new('RGB', (400, 100), color='white')
        # Note: For real tests, use PIL ImageDraw to add text
        # or use actual test image files
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()
    
    @pytest.mark.integration
    def test_extract_simple_text(self, sample_text_image):
        """Test basic OCR extraction (requires Tesseract installed)."""
        result = ocr_service.extract_text(sample_text_image)
        
        assert "text" in result
        assert "confidence" in result
        assert "regions" in result
        assert isinstance(result["regions"], list)
    
    @pytest.mark.integration
    def test_empty_image_returns_empty_text(self):
        """Test OCR on blank image."""
        img = Image.new('RGB', (100, 100), color='white')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        
        result = ocr_service.extract_text(buffer.getvalue())
        
        assert result["text"] == "" or len(result["text"].strip()) == 0
    
    def test_invalid_image_handles_gracefully(self):
        """Test error handling for invalid image data."""
        invalid_bytes = b"not an image"
        
        result = ocr_service.extract_text(invalid_bytes)
        
        assert "error" in result or result["text"] == ""
        assert result["confidence"] == 0.0
    
    @pytest.mark.integration
    def test_has_text_detection(self, sample_text_image):
        """Test text presence detection."""
        # This requires actual image with text
        has_text = ocr_service.has_text(sample_text_image, min_confidence=0.5)
        
        assert isinstance(has_text, bool)


# Note: Integration tests marked with @pytest.mark.integration
# Run with: pytest -m integration
# Skip with: pytest -m "not integration"
