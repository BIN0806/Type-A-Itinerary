"""Entity extraction service for identifying locations from text."""
import logging
import re
from typing import List, Dict, Optional
from ..models.schemas import CandidateLocation
from ..utils.text_utils import extract_location_mentions, remove_emojis

logger = logging.getLogger(__name__)


class EntityExtractor:
    """Service for extracting location entities from text with confidence scoring."""
    
    # Common non-location keywords to filter out
    NON_LOCATION_KEYWORDS = {
        'like', 'love', 'follow', 'subscribe', 'comment', 'share', 'click',
        'link', 'bio', 'dm', 'tag', 'check', 'out', 'new', 'video', 'photo',
        'today', 'yesterday', 'tomorrow', 'weekend', 'day', 'night', 'morning'
    }
    
    def extract_from_ocr_result(
        self,
        ocr_result: Dict[str, any],
        source_image_id: Optional[str] = None
    ) -> List[CandidateLocation]:
        """
        Extract location entities from OCR result.
        
        Args:
            ocr_result: OCR result from ocr_service.extract_text()
            source_image_id: Optional identifier for tracking
            
        Returns:
            List of candidate locations with confidence scores
        """
        text = ocr_result.get("text", "")
        if not text:
            return []
        
        candidates = []
        
        # Extract location pins (highest confidence)
        pin_locations = self._extract_location_pins(text)
        for loc in pin_locations:
            candidates.append(CandidateLocation(
                name=loc,
                description=f"Location pin from image",
                confidence=0.95  # Very high confidence
            ))
        
        # Extract "at [Location]" patterns (high confidence)
        at_locations = self._extract_at_mentions(text)
        for loc in at_locations:
            if not self._is_already_extracted(loc, candidates):
                candidates.append(CandidateLocation(
                    name=loc,
                    description=f"Location mention from image",
                    confidence=0.80
                ))
        
        # Extract hashtag locations (medium confidence)
        hashtag_locations = self._extract_hashtag_locations(text)
        for loc in hashtag_locations:
            if not self._is_already_extracted(loc, candidates):
                candidates.append(CandidateLocation(
                    name=loc,
                    description=f"Hashtag location from image",
                    confidence=0.65
                ))
        
        # Extract capitalized place names (lower confidence)
        proper_nouns = self._extract_proper_nouns(text)
        for loc in proper_nouns:
            if not self._is_already_extracted(loc, candidates) and self._is_likely_location(loc):
                candidates.append(CandidateLocation(
                    name=loc,
                    description=f"Potential location name",
                    confidence=0.50
                ))
        
        logger.info(f"Extracted {len(candidates)} location candidates from OCR text")
        return candidates
    
    def _extract_location_pins(self, text: str) -> List[str]:
        """Extract locations marked with pin emoji (📍)."""
        pattern = r'📍\s*([^📍\n,]+?)(?:\s|,|\n|$)'
        matches = re.findall(pattern, text)
        return [m.strip() for m in matches if len(m.strip()) > 2]
    
    def _extract_at_mentions(self, text: str) -> List[str]:
        """Extract locations from 'at [Location]' or '@ [Location]' patterns."""
        # Remove emojis first for cleaner matching
        clean_text = remove_emojis(text)
        
        # Pattern: "at" or "@" followed by proper noun
        pattern = r'(?:^|\s)(?:at|@)\s+([A-Z][A-Za-z\s\-\']+?)(?:\s*(?:\n|,|!|\.|$))'
        matches = re.findall(pattern, clean_text)
        
        cleaned = []
        for match in matches:
            match = match.strip()
            # Filter out if it's too short or looks like a username
            if len(match) > 3 and not match.startswith('@'):
                cleaned.append(match)
        
        return cleaned
    
    def _extract_hashtag_locations(self, text: str) -> List[str]:
        """Extract location names from hashtags."""
        # Pattern: #[ProperNoun] or #[location_name]
        pattern = r'#([A-Z][A-Za-z]+)'
        matches = re.findall(pattern, text)
        
        # Filter out common non-location hashtags
        filtered = []
        for match in matches:
            lower_match = match.lower()
            if lower_match not in self.NON_LOCATION_KEYWORDS and len(match) > 2:
                # Split camelCase hashtags
                words = re.findall(r'[A-Z][a-z]*', match)
                if words:
                    filtered.append(' '.join(words))
        
        return filtered
    
    def _extract_proper_nouns(self, text: str) -> List[str]:
        """Extract capitalized words that might be locations."""
        # Pattern: Words starting with capital letter
        pattern = r'\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*)\b'
        matches = re.findall(pattern, text)
        
        # Filter and clean
        filtered = []
        for match in matches:
            if self._is_likely_location(match):
                filtered.append(match)
        
        return filtered
    
    def _is_likely_location(self, text: str) -> bool:
        """Heuristic check if text is likely a location name."""
        text_lower = text.lower()
        
        # Filter out common non-location words
        if text_lower in self.NON_LOCATION_KEYWORDS:
            return False
        
        # Filter out if it starts with common verbs/adjectives
        if text_lower.split()[0] in {'my', 'this', 'that', 'the', 'a', 'an'}:
            return False
        
        # Must be at least 3 characters
        if len(text) < 3:
            return False
        
        # Location keywords boost confidence
        location_keywords = ['cafe', 'restaurant', 'tower', 'museum', 'park', 'street', 'square', 'plaza']
        if any(keyword in text_lower for keyword in location_keywords):
            return True
        
        return True
    
    def _is_already_extracted(self, name: str, candidates: List[CandidateLocation]) -> bool:
        """Check if location name is already in candidates list."""
        name_lower = name.lower().strip()
        for candidate in candidates:
            if candidate.name.lower().strip() == name_lower:
                return True
        return False
    
    def extract_from_vision_result(
        self,
        vision_candidates: List[CandidateLocation],
        ocr_candidates: List[CandidateLocation]
    ) -> List[CandidateLocation]:
        """
        Combine vision API results with OCR results, boosting confidence for duplicates.
        
        Args:
            vision_candidates: Candidates from Vision API
            ocr_candidates: Candidates from OCR
            
        Returns:
            Combined and deduplicated list with adjusted confidence
        """
        combined = []
        seen_names = set()
        
        # Add OCR candidates first (they're more explicit)
        for candidate in ocr_candidates:
            name_lower = candidate.name.lower().strip()
            if name_lower not in seen_names:
                combined.append(candidate)
                seen_names.add(name_lower)
        
        # Add vision candidates, boosting if they match OCR
        for candidate in vision_candidates:
            name_lower = candidate.name.lower().strip()
            if name_lower in seen_names:
                # Find and boost confidence
                for c in combined:
                    if c.name.lower().strip() == name_lower:
                        # Average the confidences with slight boost
                        c.confidence = min(0.98, (c.confidence + candidate.confidence) / 1.5)
                        logger.info(f"Boosted confidence for '{c.name}' to {c.confidence:.2f}")
                        break
            else:
                combined.append(candidate)
                seen_names.add(name_lower)
        
        # Sort by confidence descending
        combined.sort(key=lambda x: x.confidence, reverse=True)
        
        return combined


# Singleton instance
entity_extractor = EntityExtractor()
