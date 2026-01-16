import base64
import logging
from typing import List, Optional
from openai import OpenAI
import json

from ..core.config import settings
from ..models.schemas import CandidateLocation
from .ocr_service import ocr_service
from .entity_extractor import entity_extractor

logger = logging.getLogger(__name__)


class VisionService:
    """Service for analyzing images using OpenAI Vision API combined with OCR."""
    
    def __init__(self, use_enhanced_pipeline: bool = True):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.use_enhanced_pipeline = use_enhanced_pipeline
    
    def analyze_image(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Analyze an image and extract location information using multi-modal approach.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            List of candidate locations found in the image
        """
        if self.use_enhanced_pipeline:
            return self._analyze_enhanced(image_bytes)
        else:
            return self._analyze_vision_only(image_bytes)
    
    def _analyze_enhanced(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Enhanced analysis using OCR + Vision API.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Combined candidates from both sources
        """
        try:
            # Step 1: OCR text extraction
            logger.info("Running OCR extraction...")
            ocr_result = ocr_service.extract_text(image_bytes)
            
            # Step 2: Extract entities from OCR
            ocr_candidates = []
            if ocr_result.get("text"):
                logger.info(f"OCR extracted: {ocr_result['text'][:100]}...")
                ocr_candidates = entity_extractor.extract_from_ocr_result(ocr_result)
                logger.info(f"OCR entities: {len(ocr_candidates)} candidates")
            
            # Step 3: Vision API for landmark recognition
            logger.info("Running Vision API analysis...")
            vision_candidates = self._analyze_vision_only(image_bytes)
            logger.info(f"Vision API: {len(vision_candidates)} candidates")
            
            # Step 4: Combine results with confidence boosting
            combined = entity_extractor.extract_from_vision_result(
                vision_candidates,
                ocr_candidates
            )
            
            logger.info(f"Enhanced analysis complete: {len(combined)} total candidates")
            return combined
            
        except Exception as e:
            logger.error(f"Enhanced analysis failed, falling back to vision-only: {e}")
            return self._analyze_vision_only(image_bytes)
    
    def _analyze_vision_only(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Original vision-only analysis (fallback or legacy mode).
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Candidates from Vision API only
        """
        try:
            # Encode image to base64
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            
            # Create prompt for location extraction
            prompt = """Analyze this image and extract any travel-related locations, landmarks, or places mentioned.
            
Look for:
- Location names in captions or overlays
- Recognizable landmarks or buildings
- Place names in text
- Geographic locations

Return ONLY a valid JSON array of objects with this exact format:
[
  {
    "name": "Place Name",
    "description": "Brief description or context",
    "confidence": 0.95
  }
]

If no locations are found, return an empty array: []

Be specific with place names. Include city names where visible."""

            # Call OpenAI Vision API
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
                temperature=0.3
            )
            
            # Parse response
            content = response.choices[0].message.content
            logger.info(f"OpenAI Vision response: {content}")
            
            # Extract JSON from response (handle markdown code blocks)
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Parse JSON
            locations_data = json.loads(content)
            
            # Convert to CandidateLocation objects
            candidates = []
            for loc in locations_data:
                try:
                    candidate = CandidateLocation(
                        name=loc.get("name", "Unknown"),
                        description=loc.get("description"),
                        confidence=float(loc.get("confidence", 0.7))
                    )
                    candidates.append(candidate)
                except Exception as e:
                    logger.warning(f"Failed to parse location: {loc}, error: {e}")
                    continue
            
            return candidates
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from OpenAI response: {e}")
            return []
        except Exception as e:
            logger.error(f"Error analyzing image: {e}")
            return []
    
    def analyze_images_batch(self, images: List[bytes]) -> List[CandidateLocation]:
        """
        Analyze multiple images and return all unique candidates.
        
        Args:
            images: List of image bytes
            
        Returns:
            Combined list of unique candidate locations
        """
        all_candidates = []
        seen_names = set()
        
        for image_bytes in images:
            candidates = self.analyze_image(image_bytes)
            
            # Add unique candidates
            for candidate in candidates:
                # Normalize name for comparison
                normalized_name = candidate.name.lower().strip()
                if normalized_name not in seen_names:
                    seen_names.add(normalized_name)
                    all_candidates.append(candidate)
        
        return all_candidates


# Singleton instance
vision_service = VisionService()
