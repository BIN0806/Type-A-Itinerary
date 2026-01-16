"""Entity extraction service for identifying locations from text."""
import logging
import re
from typing import List, Dict, Optional
from ..models.schemas import CandidateLocation
from ..utils.text_utils import extract_location_mentions, remove_emojis

logger = logging.getLogger(__name__)


class EntityExtractor:
    """Service for extracting location entities from text with confidence scoring."""

    # Social captions commonly use either of these to denote a tagged location.
    PIN_EMOJIS = ("📍", "📌")
    
    # Common non-location keywords to filter out
    NON_LOCATION_KEYWORDS = {
        # Social media terms
        'like', 'love', 'follow', 'subscribe', 'comment', 'share', 'click',
        'link', 'bio', 'dm', 'tag', 'check', 'out', 'new', 'video', 'photo',
        'today', 'yesterday', 'tomorrow', 'weekend', 'day', 'night', 'morning',
        'repost', 'story', 'reel', 'post', 'feed', 'trending', 'viral',
        # Time words
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december', 'week', 'month', 'year',
        # Common adjectives/words
        'best', 'favorite', 'amazing', 'delicious', 'beautiful', 'perfect', 'great',
        'home', 'rare', 'fresh', 'hot', 'cold', 'sweet', 'spicy', 'yummy', 'tasty',
        # Food items (not locations)
        'coffee', 'latte', 'bagel', 'pizza', 'burger', 'sandwich', 'cake', 'cookie',
        'mojito', 'drink', 'cocktail', 'wine', 'beer', 'dessert', 'ice', 'cream',
        'raspberry', 'rasberry', 'chocolate', 'vanilla', 'caramel', 'mint', 'fruit',
        # Common fragments that aren't locations
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'here', 'there', 'where',
        'what', 'when', 'how', 'why', 'who', 'which', 'more', 'most', 'some', 'many',
        'far', 'near', 'close', 'spent', 'views', 'rooftop', 'basically',
    }
    
    # Minimum length for proper noun extraction
    MIN_LOCATION_LENGTH = 4

    # Common short location abbreviations that appear in social captions / OCR.
    # Keep this list tight to avoid false positives from random OCR fragments.
    COMMON_LOCATION_ABBREVIATIONS = {
        "NYC", "LA", "SF", "DC", "NY",
    }
    
    # Words that indicate a location when present
    LOCATION_INDICATOR_WORDS = {
        'cafe', 'café', 'restaurant', 'bar', 'pub', 'grill', 'kitchen', 'diner',
        'bakery', 'pizzeria', 'bistro', 'eatery', 'tavern', 'lounge',
        'tower', 'museum', 'park', 'square', 'plaza', 'garden', 'market',
        'street', 'avenue', 'road', 'boulevard', 'lane', 'drive', 'way',
        'bridge', 'station', 'terminal', 'airport', 'hotel', 'inn', 'resort',
        'beach', 'harbor', 'port', 'pier', 'island', 'mountain', 'hill', 'valley',
        'building', 'center', 'centre', 'mall', 'shop', 'store', 'theater', 'theatre',
        'library', 'church', 'temple', 'mosque', 'cathedral', 'palace', 'castle',
        'dumpling', 'noodle', 'taco', 'sushi', 'ramen', 'espresso', 'rooftop',
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
        """Extract locations marked with pin emoji (📍/📌).

        Social captions often use patterns like:
        - "📍 Paris, France"
        - "Some text…\n📍 Liberty Bagels | follow for more"
        - "📍Paris, France • 8pm"

        We treat the pin as a strong signal and extract the chunk that follows it,
        trimming common caption separators and hashtags.
        """
        if not text:
            return []

        results: List[str] = []

        # Line-based parsing is more robust than a single regex for social captions.
        for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
            if not line:
                continue

            for pin in self.PIN_EMOJIS:
                if pin not in line:
                    continue

                # Allow multiple pins on one line: "📍 A ... 📍 B ..."
                parts = line.split(pin)
                for raw in parts[1:]:
                    chunk = raw.strip()
                    # Drop leading punctuation that often follows the pin.
                    chunk = re.sub(r"^[\s:;,\-–—•|>]+", "", chunk).strip()

                    # Strip hashtags and common caption separators/trailers.
                    chunk = chunk.split("#", 1)[0].strip()
                    chunk = re.split(r"\s[|•]\s", chunk, maxsplit=1)[0].strip()
                    chunk = re.split(r"\s-\s|\s–\s|\s—\s", chunk, maxsplit=1)[0].strip()

                    # Final cleanup.
                    chunk = re.sub(r"\s+", " ", chunk).strip(" \t:;,.")

                    if len(chunk) <= 2:
                        continue
                    if not re.search(r"[A-Za-z0-9]", chunk):
                        continue

                    results.append(chunk)

        # Deduplicate case-insensitively while preserving order.
        seen = set()
        deduped: List[str] = []
        for loc in results:
            key = loc.lower().strip()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(loc)

        return deduped
    
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
        # Pattern: Words starting with capital letter (minimum 2 words or location indicator)
        pattern = r'\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)+)\b'
        multi_word_matches = re.findall(pattern, text)
        
        # Also look for single words that contain location indicators
        single_pattern = r'\b([A-Z][a-z]{3,})\b'
        single_matches = re.findall(single_pattern, text)
        
        # Filter and clean
        filtered = []
        
        # Multi-word proper nouns are more likely to be locations
        for match in multi_word_matches:
            if self._is_likely_location(match, is_multi_word=True):
                filtered.append(match)
        
        # Single words only if they contain location indicators
        for match in single_matches:
            if self._is_likely_location(match, is_multi_word=False):
                # Only add if not already in filtered (from multi-word)
                if match not in filtered and not any(match in m for m in filtered):
                    filtered.append(match)
        
        return filtered
    
    def _is_likely_location(self, text: str, is_multi_word: bool = False) -> bool:
        """Heuristic check if text is likely a location name."""
        text_lower = text.lower().strip()
        words = text_lower.split()
        
        # Allow a few common short abbreviations (e.g., "NYC") that otherwise fail heuristics.
        if text.strip().upper() in self.COMMON_LOCATION_ABBREVIATIONS:
            return True

        # Must be at least MIN_LOCATION_LENGTH characters
        if len(text) < self.MIN_LOCATION_LENGTH:
            logger.debug(f"Rejected '{text}': too short")
            return False
        
        # Filter out common non-location words (check each word)
        for word in words:
            if word in self.NON_LOCATION_KEYWORDS:
                logger.debug(f"Rejected '{text}': contains non-location word '{word}'")
                return False
        
        # Filter out if it starts with common verbs/adjectives
        if words[0] in {'my', 'this', 'that', 'the', 'a', 'an', 'i', 'we', 'you', 'they'}:
            logger.debug(f"Rejected '{text}': starts with common word")
            return False
        
        # Check for location indicator words (high confidence)
        has_location_indicator = any(
            indicator in text_lower 
            for indicator in self.LOCATION_INDICATOR_WORDS
        )
        
        if has_location_indicator:
            logger.debug(f"Accepted '{text}': has location indicator")
            return True
        
        # For multi-word phrases, accept if no blocking keywords
        if is_multi_word and len(words) >= 2:
            # Accept multi-word proper nouns (e.g., "Jin Mei Dumpling", "Liberty Bagels")
            logger.debug(f"Accepted '{text}': multi-word proper noun")
            return True
        
        # Single words without location indicators are rejected
        # This prevents "Ihe", "Wer", "Rare" etc. from being extracted
        if not is_multi_word:
            logger.debug(f"Rejected '{text}': single word without location indicator")
            return False
        
        return False
    
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
