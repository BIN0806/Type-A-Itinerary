"""Tests for entity extraction service."""
import pytest
from app.services.entity_extractor import entity_extractor
from app.models.schemas import CandidateLocation


class TestExtractFromOCRResult:
    """Test entity extraction from OCR results."""
    
    def test_extract_location_pin(self):
        ocr_result = {
            "text": "📍 Eiffel Tower, Paris",
            "confidence": 0.9
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        assert len(candidates) > 0
        assert any("Eiffel" in c.name for c in candidates)
        # Location pin should have high confidence
        assert any(c.confidence >= 0.90 for c in candidates)
    
    def test_extract_at_mention(self):
        ocr_result = {
            "text": "Having coffee at Cafe de Flore in Paris",
            "confidence": 0.85
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        assert len(candidates) > 0
        assert any("Cafe" in c.name or "Flore" in c.name for c in candidates)
    
    def test_extract_hashtag_locations(self):
        ocr_result = {
            "text": "Amazing view! #Paris #EiffelTower #France",
            "confidence": 0.88
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        assert len(candidates) >= 2
        # Hashtag locations should have medium confidence
        assert all(0.5 <= c.confidence <= 0.8 for c in candidates)
    
    def test_empty_text(self):
        ocr_result = {
            "text": "",
            "confidence": 0.0
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        assert len(candidates) == 0
    
    def test_filter_non_locations(self):
        ocr_result = {
            "text": "like and subscribe at my channel",
            "confidence": 0.9
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        # Should not extract 'like', 'subscribe', 'my channel'
        assert not any(c.name.lower() in ['like', 'subscribe'] for c in candidates)
    
    def test_multiple_location_types(self):
        ocr_result = {
            "text": "📍 Louvre Museum\nHad lunch at Cafe Marly\n#Paris #ParisFrance",
            "confidence": 0.92
        }
        candidates = entity_extractor.extract_from_ocr_result(ocr_result)
        
        assert len(candidates) >= 3
        # Should have varying confidence levels
        confidences = [c.confidence for c in candidates]
        assert max(confidences) > 0.8  # Pin location
        assert min(confidences) >= 0.5  # Hashtag


class TestExtractFromVisionResult:
    """Test combining vision and OCR results."""
    
    def test_combine_unique_candidates(self):
        vision_candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.85),
            CandidateLocation(name="Louvre Museum", confidence=0.80)
        ]
        ocr_candidates = [
            CandidateLocation(name="Notre Dame", confidence=0.90)
        ]
        
        combined = entity_extractor.extract_from_vision_result(
            vision_candidates,
            ocr_candidates
        )
        
        assert len(combined) == 3
    
    def test_boost_duplicate_confidence(self):
        vision_candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.80)
        ]
        ocr_candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.85)
        ]
        
        combined = entity_extractor.extract_from_vision_result(
            vision_candidates,
            ocr_candidates
        )
        
        assert len(combined) == 1
        # Confidence should be boosted for matching candidates
        assert combined[0].confidence > 0.85
    
    def test_prioritize_ocr_candidates(self):
        vision_candidates = [
            CandidateLocation(name="Unknown Landmark", confidence=0.60)
        ]
        ocr_candidates = [
            CandidateLocation(name="Cafe de Flore", confidence=0.90)
        ]
        
        combined = entity_extractor.extract_from_vision_result(
            vision_candidates,
            ocr_candidates
        )
        
        # OCR candidates should appear first (higher confidence in text)
        assert combined[0].name == "Cafe de Flore"
    
    def test_sort_by_confidence(self):
        vision_candidates = [
            CandidateLocation(name="Location A", confidence=0.60),
            CandidateLocation(name="Location B", confidence=0.90)
        ]
        ocr_candidates = [
            CandidateLocation(name="Location C", confidence=0.75)
        ]
        
        combined = entity_extractor.extract_from_vision_result(
            vision_candidates,
            ocr_candidates
        )
        
        # Should be sorted by confidence descending
        confidences = [c.confidence for c in combined]
        assert confidences == sorted(confidences, reverse=True)


class TestHelperMethods:
    """Test helper methods."""
    
    def test_is_likely_location_with_keyword(self):
        assert entity_extractor._is_likely_location("Central Park")
        assert entity_extractor._is_likely_location("Tower Bridge")
        assert entity_extractor._is_likely_location("Museum of Art")
    
    def test_filter_non_location_keywords(self):
        assert not entity_extractor._is_likely_location("like")
        assert not entity_extractor._is_likely_location("subscribe")
        assert not entity_extractor._is_likely_location("my")
    
    def test_minimum_length(self):
        assert not entity_extractor._is_likely_location("ab")
        assert entity_extractor._is_likely_location("NYC")
