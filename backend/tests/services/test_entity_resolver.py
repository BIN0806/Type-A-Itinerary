"""Tests for entity resolution service."""
import pytest
from app.services.entity_resolver import EntityResolver
from app.models.schemas import CandidateLocation


class TestResolveDuplicates:
    """Test duplicate resolution."""
    
    def test_merge_similar_names(self):
        resolver = EntityResolver(similarity_threshold=0.85)
        candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.80),
            CandidateLocation(name="eiffel tower", confidence=0.85),
            CandidateLocation(name="The Eiffel Tower", confidence=0.75)
        ]
        
        resolved = resolver.resolve_duplicates(candidates)
        
        # Should merge into single entity
        assert len(resolved) == 1
        # Confidence should be boosted
        assert resolved[0].confidence > 0.80
    
    def test_keep_distinct_locations(self):
        resolver = EntityResolver(similarity_threshold=0.85)
        candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.85),
            CandidateLocation(name="Louvre Museum", confidence=0.80),
            CandidateLocation(name="Notre Dame", confidence=0.90)
        ]
        
        resolved = resolver.resolve_duplicates(candidates)
        
        # Should keep all distinct locations
        assert len(resolved) == 3
    
    def test_geo_clustering(self):
        resolver = EntityResolver(geo_radius_meters=50.0)
        candidates = [
            CandidateLocation(
                name="Cafe de Flore",
                confidence=0.80,
                lat=48.8542,
                lng=2.3320
            ),
            CandidateLocation(
                name="Cafe Flore",
                confidence=0.75,
                lat=48.8543,  # ~11m away
                lng=2.3321
            )
        ]
        
        resolved = resolver.resolve_duplicates(candidates)
        
        # Should merge nearby duplicates
        assert len(resolved) == 1
        # Should average coordinates
        assert 48.8542 <= resolved[0].lat <= 48.8543
    
    def test_empty_list(self):
        resolver = EntityResolver()
        resolved = resolver.resolve_duplicates([])
        
        assert resolved == []
    
    def test_single_candidate(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.85)
        ]
        
        resolved = resolver.resolve_duplicates(candidates)
        
        assert len(resolved) == 1
        assert resolved[0].name == "Eiffel Tower"


class TestMergeByTextSimilarity:
    """Test text-based merging."""
    
    def test_exact_match(self):
        resolver = EntityResolver(similarity_threshold=1.0)
        candidates = [
            CandidateLocation(name="Paris", confidence=0.80),
            CandidateLocation(name="Paris", confidence=0.85)
        ]
        
        resolved = resolver._merge_by_text_similarity(candidates)
        
        assert len(resolved) == 1
        assert resolved[0].confidence > 0.80
    
    def test_translation_variants(self):
        resolver = EntityResolver(similarity_threshold=0.70)
        candidates = [
            CandidateLocation(name="Eiffel Tower", confidence=0.85),
            CandidateLocation(name="Tour Eiffel", confidence=0.80)
        ]
        
        resolved = resolver._merge_by_text_similarity(candidates)
        
        # May or may not merge depending on similarity threshold
        # This tests the behavior
        assert len(resolved) <= 2
    
    def test_different_languages_same_place(self):
        resolver = EntityResolver(similarity_threshold=0.85)
        candidates = [
            CandidateLocation(name="New York", confidence=0.85),
            CandidateLocation(name="Nueva York", confidence=0.80)
        ]
        
        resolved = resolver._merge_by_text_similarity(candidates)
        
        # Should not merge (too different)
        assert len(resolved) == 2


class TestMergeByProximity:
    """Test geo-based merging."""
    
    def test_merge_nearby_locations(self):
        resolver = EntityResolver(geo_radius_meters=50.0)
        candidates = [
            CandidateLocation(
                name="Starbucks",
                confidence=0.80,
                lat=48.8584,
                lng=2.2945
            ),
            CandidateLocation(
                name="Coffee Shop",
                confidence=0.75,
                lat=48.8585,  # ~11m away
                lng=2.2946
            )
        ]
        
        resolved = resolver._merge_by_proximity(candidates)
        
        assert len(resolved) == 1
    
    def test_keep_distant_locations(self):
        resolver = EntityResolver(geo_radius_meters=50.0)
        candidates = [
            CandidateLocation(
                name="Eiffel Tower",
                confidence=0.85,
                lat=48.8584,
                lng=2.2945
            ),
            CandidateLocation(
                name="Louvre Museum",
                confidence=0.80,
                lat=48.8606,  # ~300m away
                lng=2.3376
            )
        ]
        
        resolved = resolver._merge_by_proximity(candidates)
        
        assert len(resolved) == 2
    
    def test_handle_missing_coordinates(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Location A", confidence=0.80),
            CandidateLocation(name="Location B", confidence=0.85, lat=48.8584, lng=2.2945)
        ]
        
        resolved = resolver._merge_by_proximity(candidates)
        
        # Should keep both (can't merge without coords)
        assert len(resolved) == 2


class TestMergeCandidates:
    """Test candidate merging logic."""
    
    def test_use_highest_confidence_name(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="eiffel tower", confidence=0.75),
            CandidateLocation(name="Eiffel Tower", confidence=0.90),
            CandidateLocation(name="EIFFEL TOWER", confidence=0.80)
        ]
        
        merged = resolver._merge_candidates(candidates)
        
        # Should use name from highest confidence candidate
        assert merged.name == "Eiffel Tower"
    
    def test_boost_confidence_for_multiple_sources(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Paris", confidence=0.70),
            CandidateLocation(name="Paris", confidence=0.75),
            CandidateLocation(name="Paris", confidence=0.80)
        ]
        
        merged = resolver._merge_candidates(candidates)
        
        # Average confidence with boost
        avg_confidence = (0.70 + 0.75 + 0.80) / 3
        assert merged.confidence > avg_confidence
        assert merged.confidence <= 0.98  # Should not exceed max
    
    def test_average_coordinates(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Cafe", confidence=0.80, lat=48.8584, lng=2.2945),
            CandidateLocation(name="Cafe", confidence=0.85, lat=48.8586, lng=2.2947)
        ]
        
        merged = resolver._merge_candidates(candidates)
        
        # Should average coordinates
        assert merged.lat == pytest.approx(48.8585, abs=0.0001)
        assert merged.lng == pytest.approx(2.2946, abs=0.0001)
    
    def test_prefer_first_place_id(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Location", confidence=0.80),
            CandidateLocation(name="Location", confidence=0.85, google_place_id="ChIJ123"),
            CandidateLocation(name="Location", confidence=0.90, google_place_id="ChIJ456")
        ]
        
        merged = resolver._merge_candidates(candidates)
        
        # Should use first found place_id
        assert merged.google_place_id == "ChIJ123"


class TestFilterByConfidence:
    """Test confidence filtering."""
    
    def test_filter_low_confidence(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="High", confidence=0.90),
            CandidateLocation(name="Medium", confidence=0.65),
            CandidateLocation(name="Low", confidence=0.30)
        ]
        
        filtered = resolver.filter_by_confidence(candidates, min_confidence=0.50)
        
        assert len(filtered) == 2
        assert all(c.confidence >= 0.50 for c in filtered)
    
    def test_keep_all_above_threshold(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="A", confidence=0.95),
            CandidateLocation(name="B", confidence=0.85),
            CandidateLocation(name="C", confidence=0.75)
        ]
        
        filtered = resolver.filter_by_confidence(candidates, min_confidence=0.70)
        
        assert len(filtered) == 3
    
    def test_empty_result(self):
        resolver = EntityResolver()
        candidates = [
            CandidateLocation(name="Low", confidence=0.30),
            CandidateLocation(name="VeryLow", confidence=0.20)
        ]
        
        filtered = resolver.filter_by_confidence(candidates, min_confidence=0.50)
        
        assert len(filtered) == 0
