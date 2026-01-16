"""Vision service for analyzing images using OpenAI Vision API + OCR."""
import asyncio
import base64
import logging
from typing import List, Optional
from openai import AsyncOpenAI
import json
import concurrent.futures
from functools import partial

from ..core.config import settings
from ..models.schemas import CandidateLocation
from .ocr_service import ocr_service
from .entity_extractor import entity_extractor

logger = logging.getLogger(__name__)

# Thread pool for CPU-bound OCR operations
_ocr_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)


class VisionService:
    """Service for analyzing images using OpenAI Vision API combined with OCR."""
    
    def __init__(self, use_enhanced_pipeline: bool = True):
        self.async_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.use_enhanced_pipeline = use_enhanced_pipeline
        # Timeout per image (seconds) - keep tight for 45s total budget
        self.per_image_timeout = 8.0
    
    async def analyze_image_async(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Async image analysis with timeout protection.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            List of candidate locations found in the image
        """
        try:
            return await asyncio.wait_for(
                self._analyze_with_timeout(image_bytes),
                timeout=self.per_image_timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"Image analysis timed out after {self.per_image_timeout}s")
            return []
        except Exception as e:
            logger.error(f"Image analysis failed: {e}")
            return []
    
    async def _analyze_with_timeout(self, image_bytes: bytes) -> List[CandidateLocation]:
        """Internal analysis with enhanced pipeline."""
        if self.use_enhanced_pipeline:
            return await self._analyze_enhanced_async(image_bytes)
        else:
            return await self._analyze_vision_only_async(image_bytes)
    
    async def _analyze_enhanced_async(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Enhanced async analysis using OCR + Vision API in parallel.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Combined candidates from both sources
        """
        try:
            # Run OCR and Vision API in parallel for speed
            loop = asyncio.get_event_loop()
            
            # OCR runs in thread pool (CPU-bound)
            ocr_future = loop.run_in_executor(
                _ocr_executor,
                ocr_service.extract_text,
                image_bytes
            )
            
            # Vision API runs async (I/O-bound)
            vision_future = self._analyze_vision_only_async(image_bytes)
            
            # Wait for both to complete
            ocr_result, vision_candidates = await asyncio.gather(
                ocr_future,
                vision_future,
                return_exceptions=True
            )
            
            # Handle OCR result
            ocr_candidates = []
            if isinstance(ocr_result, dict) and ocr_result.get("text"):
                logger.info(f"OCR extracted: {ocr_result['text'][:50]}...")
                ocr_candidates = entity_extractor.extract_from_ocr_result(ocr_result)
                logger.info(f"OCR entities: {len(ocr_candidates)} candidates")
            elif isinstance(ocr_result, Exception):
                logger.warning(f"OCR failed: {ocr_result}")
            
            # Handle Vision result
            if isinstance(vision_candidates, Exception):
                logger.warning(f"Vision API failed: {vision_candidates}")
                vision_candidates = []
            
            logger.info(f"Vision API: {len(vision_candidates)} candidates")
            
            # Combine results
            combined = entity_extractor.extract_from_vision_result(
                vision_candidates,
                ocr_candidates
            )
            
            logger.info(f"Enhanced analysis complete: {len(combined)} total candidates")
            return combined
            
        except Exception as e:
            logger.error(f"Enhanced analysis failed: {e}")
            return await self._analyze_vision_only_async(image_bytes)
    
    async def _analyze_vision_only_async(self, image_bytes: bytes) -> List[CandidateLocation]:
        """
        Async vision-only analysis using OpenAI GPT-4o.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Candidates from Vision API only
        """
        try:
            # Encode image to base64
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            
            # Optimized prompt for faster response
            prompt = """Extract travel locations from this image. Look for:
- Location names in text/captions
- Recognizable landmarks
- Place names

Return JSON array only:
[{"name": "Place Name", "description": "Brief context", "confidence": 0.95}]

Return [] if no locations found. Be specific with names."""

            # Call OpenAI Vision API with async client
            response = await self.async_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "low"  # Use low detail for faster processing
                                }
                            }
                        ]
                    }
                ],
                max_tokens=300,  # Reduced for speed
                temperature=0.2  # Lower for more consistent responses
            )
            
            # Parse response
            content = response.choices[0].message.content
            logger.info(f"OpenAI Vision response: {content}")
            
            # Extract JSON from response
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
    
    async def analyze_images_batch_async(
        self, 
        images: List[bytes],
        max_concurrent: int = 3  # Limit concurrent API calls to avoid rate limits
    ) -> List[CandidateLocation]:
        """
        Analyze multiple images in parallel with rate limiting.
        
        Args:
            images: List of image bytes
            max_concurrent: Maximum concurrent API calls
            
        Returns:
            Combined list of unique candidate locations
        """
        logger.info(f"Starting parallel analysis of {len(images)} images (max {max_concurrent} concurrent)")
        
        # Use semaphore to limit concurrent API calls
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def analyze_with_semaphore(image_bytes: bytes, index: int):
            async with semaphore:
                logger.info(f"Processing image {index + 1}/{len(images)}")
                return await self.analyze_image_async(image_bytes)
        
        # Run all analyses in parallel (semaphore limits concurrency)
        tasks = [
            analyze_with_semaphore(img, i) 
            for i, img in enumerate(images)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Collect unique candidates
        all_candidates = []
        seen_names = set()
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Image analysis failed: {result}")
                continue
            
            for candidate in result:
                normalized_name = candidate.name.lower().strip()
                if normalized_name not in seen_names:
                    seen_names.add(normalized_name)
                    all_candidates.append(candidate)
        
        logger.info(f"Batch analysis complete: {len(all_candidates)} unique candidates")
        return all_candidates
    
    # Sync wrapper for backwards compatibility
    def analyze_image(self, image_bytes: bytes) -> List[CandidateLocation]:
        """Sync wrapper for analyze_image_async."""
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self.analyze_image_async(image_bytes))
        finally:
            loop.close()


# Singleton instance
vision_service = VisionService()
