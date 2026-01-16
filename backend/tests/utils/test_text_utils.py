"""Tests for text utility functions."""
import pytest
from app.utils.text_utils import (
    normalize_text,
    calculate_similarity,
    are_similar,
    extract_location_mentions,
    remove_emojis
)


class TestNormalizeText:
    """Test text normalization."""
    
    def test_lowercase_conversion(self):
        assert normalize_text("Eiffel Tower") == "eiffel tower"
    
    def test_whitespace_removal(self):
        assert normalize_text("  Paris   France  ") == "paris france"
    
    def test_multiple_spaces(self):
        assert normalize_text("New    York") == "new york"
    
    def test_empty_string(self):
        assert normalize_text("") == ""


class TestCalculateSimilarity:
    """Test similarity calculation."""
    
    def test_identical_strings(self):
        similarity = calculate_similarity("Eiffel Tower", "Eiffel Tower")
        assert similarity == 1.0
    
    def test_case_insensitive(self):
        similarity = calculate_similarity("eiffel tower", "EIFFEL TOWER")
        assert similarity == 1.0
    
    def test_similar_strings(self):
        similarity = calculate_similarity("Eiffel Tower", "Tour Eiffel")
        assert 0.3 < similarity < 0.7  # Partial match
    
    def test_completely_different(self):
        similarity = calculate_similarity("Paris", "Tokyo")
        assert similarity < 0.3
    
    def test_empty_strings(self):
        similarity = calculate_similarity("", "Paris")
        assert similarity == 0.0
    
    def test_typo_tolerance(self):
        similarity = calculate_similarity("Restaurant", "Resturant")
        assert similarity > 0.8  # Should be high despite typo


class TestAreSimilar:
    """Test similarity comparison."""
    
    def test_similar_above_threshold(self):
        assert are_similar("Eiffel Tower", "eiffel tower", threshold=0.85)
    
    def test_not_similar_below_threshold(self):
        assert not are_similar("Eiffel Tower", "Louvre Museum", threshold=0.85)
    
    def test_custom_threshold(self):
        assert are_similar("Paris", "Pari", threshold=0.75)
        assert not are_similar("Paris", "Pari", threshold=0.95)


class TestExtractLocationMentions:
    """Test location extraction from text."""
    
    def test_extract_pin_locations(self):
        text = "📍 Eiffel Tower, Paris"
        locations = extract_location_mentions(text)
        assert "Eiffel Tower, Paris" in locations or any("Eiffel" in loc for loc in locations)
    
    def test_extract_at_mentions(self):
        text = "Having lunch at Cafe de Flore"
        locations = extract_location_mentions(text)
        assert any("Cafe" in loc for loc in locations)
    
    def test_extract_hashtags(self):
        text = "Love this place #Paris #EiffelTower"
        locations = extract_location_mentions(text)
        assert len(locations) > 0
    
    def test_empty_text(self):
        locations = extract_location_mentions("")
        assert locations == []
    
    def test_multiple_locations(self):
        text = "📍 Louvre Museum and @ Notre Dame #Paris"
        locations = extract_location_mentions(text)
        assert len(locations) >= 2


class TestRemoveEmojis:
    """Test emoji removal."""
    
    def test_remove_single_emoji(self):
        text = "Paris 🗼 France"
        result = remove_emojis(text)
        assert "🗼" not in result
        assert "Paris" in result
    
    def test_remove_multiple_emojis(self):
        text = "Love it! 😍❤️🎉"
        result = remove_emojis(text)
        assert "😍" not in result
        assert "Love it!" in result
    
    def test_no_emojis(self):
        text = "Simple text"
        result = remove_emojis(text)
        assert result == text
    
    def test_only_emojis(self):
        text = "😀😃😄"
        result = remove_emojis(text)
        assert result == ""
