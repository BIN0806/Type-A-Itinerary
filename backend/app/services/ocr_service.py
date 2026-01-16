"""OCR service for extracting text from images using Tesseract."""
import logging
from typing import List, Dict, Optional
from PIL import Image
import pytesseract
import io

logger = logging.getLogger(__name__)


class OCRService:
    """Service for extracting text from images using Tesseract OCR."""
    
    def __init__(self):
        """Initialize OCR service."""
        # Configure Tesseract if needed
        # pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'
        pass
    
    def extract_text(self, image_bytes: bytes) -> Dict[str, any]:
        """
        Extract text from an image.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Dictionary with extracted text and metadata:
            {
                "text": "extracted text",
                "confidence": 0.85,
                "regions": [...],
                "language": "eng"
            }
        """
        try:
            # Load image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Extract text with details
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            
            # Get full text
            text = pytesseract.image_to_string(image)
            
            # Calculate average confidence (filter out -1 values)
            confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            # Extract text regions
            regions = []
            n_boxes = len(data['text'])
            for i in range(n_boxes):
                if int(data['conf'][i]) > 0:  # Only include confident detections
                    regions.append({
                        'text': data['text'][i],
                        'confidence': int(data['conf'][i]) / 100.0,
                        'bbox': {
                            'x': data['left'][i],
                            'y': data['top'][i],
                            'width': data['width'][i],
                            'height': data['height'][i]
                        }
                    })
            
            # Detect language
            try:
                detected_lang = pytesseract.image_to_osd(image)
                # Parse OSD output for language (basic)
                language = "eng"  # Default
            except Exception:
                language = "eng"
            
            result = {
                "text": text.strip(),
                "confidence": avg_confidence / 100.0,
                "regions": regions,
                "language": language
            }
            
            logger.info(f"OCR extracted {len(text)} characters with {avg_confidence:.2f}% confidence")
            return result
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {
                "text": "",
                "confidence": 0.0,
                "regions": [],
                "language": "unknown",
                "error": str(e)
            }
    
    def extract_text_batch(self, images: List[bytes]) -> List[Dict[str, any]]:
        """
        Extract text from multiple images.
        
        Args:
            images: List of image bytes
            
        Returns:
            List of OCR results
        """
        results = []
        for i, image_bytes in enumerate(images):
            logger.info(f"Processing image {i+1}/{len(images)}")
            result = self.extract_text(image_bytes)
            results.append(result)
        
        return results
    
    def has_text(self, image_bytes: bytes, min_confidence: float = 0.5) -> bool:
        """
        Check if an image contains readable text.
        
        Args:
            image_bytes: Raw image bytes
            min_confidence: Minimum confidence threshold
            
        Returns:
            True if text was found above confidence threshold
        """
        result = self.extract_text(image_bytes)
        return bool(result["text"]) and result["confidence"] >= min_confidence


# Singleton instance
ocr_service = OCRService()
