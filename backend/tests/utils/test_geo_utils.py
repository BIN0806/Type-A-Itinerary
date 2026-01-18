"""Tests for geographic utility functions."""
import pytest
from app.utils.geo_utils import (
    haversine_distance,
    are_locations_nearby,
    validate_coordinates,
    get_midpoint,
    calculate_centroid,
    calculate_bounding_radius,
    score_by_proximity
)


class TestHaversineDistance:
    """Test distance calculation."""
    
    def test_same_location(self):
        distance = haversine_distance(48.8584, 2.2945, 48.8584, 2.2945)
        assert distance == 0.0
    
    def test_known_distance_paris_london(self):
        # Eiffel Tower to Big Ben (approx 344 km)
        distance = haversine_distance(48.8584, 2.2945, 51.5007, -0.1246)
        assert 340000 < distance < 350000  # meters
    
    def test_short_distance(self):
        # 100m apart approximately
        distance = haversine_distance(48.8584, 2.2945, 48.8594, 2.2945)
        assert 100 < distance < 120
    
    def test_negative_coordinates(self):
        # Southern and Western hemispheres
        distance = haversine_distance(-33.8688, 151.2093, -34.6037, -58.3816)
        assert distance > 0


class TestAreLocationsNearby:
    """Test proximity checking."""
    
    def test_within_radius(self):
        # 30m apart
        assert are_locations_nearby(
            48.8584, 2.2945,
            48.8587, 2.2945,
            radius_meters=50.0
        )
    
    def test_outside_radius(self):
        # ~1km apart
        assert not are_locations_nearby(
            48.8584, 2.2945,
            48.8684, 2.2945,
            radius_meters=50.0
        )
    
    def test_exact_radius(self):
        # Test boundary condition
        distance = haversine_distance(48.8584, 2.2945, 48.8589, 2.2945)
        assert are_locations_nearby(
            48.8584, 2.2945,
            48.8589, 2.2945,
            radius_meters=distance + 1
        )
    
    def test_custom_radius(self):
        assert are_locations_nearby(
            48.8584, 2.2945,
            48.8594, 2.2945,
            radius_meters=2000.0  # 2km
        )


class TestValidateCoordinates:
    """Test coordinate validation."""
    
    def test_valid_coordinates(self):
        assert validate_coordinates(48.8584, 2.2945)
    
    def test_invalid_latitude_high(self):
        assert not validate_coordinates(91.0, 2.2945)
    
    def test_invalid_latitude_low(self):
        assert not validate_coordinates(-91.0, 2.2945)
    
    def test_invalid_longitude_high(self):
        assert not validate_coordinates(48.8584, 181.0)
    
    def test_invalid_longitude_low(self):
        assert not validate_coordinates(48.8584, -181.0)
    
    def test_boundary_values(self):
        assert validate_coordinates(90.0, 180.0)
        assert validate_coordinates(-90.0, -180.0)
        assert validate_coordinates(0.0, 0.0)


class TestGetMidpoint:
    """Test midpoint calculation."""
    
    def test_simple_midpoint(self):
        lat, lng = get_midpoint(0.0, 0.0, 10.0, 10.0)
        assert lat == 5.0
        assert lng == 5.0
    
    def test_paris_london_midpoint(self):
        # Midpoint between Paris and London
        lat, lng = get_midpoint(48.8584, 2.2945, 51.5007, -0.1246)
        # Should be roughly in English Channel
        assert 49.0 < lat < 51.0
        assert -1.0 < lng < 2.0
    
    def test_same_point(self):
        lat, lng = get_midpoint(48.8584, 2.2945, 48.8584, 2.2945)
        assert lat == 48.8584
        assert lng == 2.2945


class TestCalculateCentroid:
    """Test centroid calculation for location clusters."""
    
    def test_empty_list(self):
        lat, lng = calculate_centroid([])
        assert lat is None
        assert lng is None
    
    def test_single_point(self):
        lat, lng = calculate_centroid([(40.7128, -74.0060)])
        assert lat == pytest.approx(40.7128)
        assert lng == pytest.approx(-74.0060)
    
    def test_two_points(self):
        # NYC and Boston
        lat, lng = calculate_centroid([
            (40.7128, -74.0060),  # NYC
            (42.3601, -71.0589)   # Boston
        ])
        assert lat == pytest.approx(41.5365, abs=0.001)
        assert lng == pytest.approx(-72.5325, abs=0.001)
    
    def test_multiple_nyc_locations(self):
        # Multiple Manhattan locations should have centroid in Manhattan
        coords = [
            (40.7580, -73.9855),  # Times Square
            (40.7484, -73.9857),  # Empire State Building
            (40.7614, -73.9776),  # MoMA
            (40.7527, -73.9772),  # Grand Central
        ]
        lat, lng = calculate_centroid(coords)
        # Centroid should be in midtown Manhattan
        assert 40.74 < lat < 40.77
        assert -73.99 < lng < -73.97
    
    def test_with_none_values(self):
        # Should filter out None values
        lat, lng = calculate_centroid([
            (40.7128, -74.0060),
            (None, None),
            (42.3601, -71.0589)
        ])
        assert lat == pytest.approx(41.5365, abs=0.001)


class TestCalculateBoundingRadius:
    """Test bounding radius calculation."""
    
    def test_empty_coords(self):
        radius = calculate_bounding_radius([], (None, None))
        assert radius == 50000.0  # Default
    
    def test_single_point(self):
        coords = [(40.7128, -74.0060)]
        centroid = (40.7128, -74.0060)
        radius = calculate_bounding_radius(coords, centroid)
        # Minimum radius should be 10km
        assert radius == 10000.0
    
    def test_spread_points(self):
        # NYC and Boston (~300km apart)
        coords = [
            (40.7128, -74.0060),  # NYC
            (42.3601, -71.0589)   # Boston
        ]
        centroid = calculate_centroid(coords)
        radius = calculate_bounding_radius(coords, centroid)
        # Should be about half the distance * 1.2 buffer, but capped at 100km
        assert radius == 100000.0  # Should hit max
    
    def test_close_points(self):
        # All in Manhattan (within ~3km)
        coords = [
            (40.7580, -73.9855),  # Times Square
            (40.7484, -73.9857),  # Empire State Building
            (40.7614, -73.9776),  # MoMA
        ]
        centroid = calculate_centroid(coords)
        radius = calculate_bounding_radius(coords, centroid)
        # Should be minimum 10km even though points are close
        assert radius >= 10000.0


class TestScoreByProximity:
    """Test proximity scoring for location ranking."""
    
    def test_at_centroid(self):
        centroid = (40.7580, -73.9855)
        score = score_by_proximity(40.7580, -73.9855, centroid)
        assert score == pytest.approx(1.0)
    
    def test_far_away(self):
        centroid = (40.7580, -73.9855)  # NYC
        score = score_by_proximity(34.0522, -118.2437, centroid)  # LA
        assert score == 0.0  # Should be 0 (beyond max_distance)
    
    def test_medium_distance(self):
        centroid = (40.7580, -73.9855)  # Times Square
        # ~30km away in NJ
        score = score_by_proximity(40.7357, -74.1724, centroid)
        # Should be between 0 and 1
        assert 0.5 < score < 0.9
    
    def test_null_centroid(self):
        score = score_by_proximity(40.7580, -73.9855, (None, None))
        assert score == 0.5  # Neutral score
    
    def test_null_candidate(self):
        centroid = (40.7580, -73.9855)
        score = score_by_proximity(None, None, centroid)
        assert score == 0.5  # Neutral score
    
    def test_custom_max_distance(self):
        centroid = (40.7580, -73.9855)
        # ~15km away
        score_short = score_by_proximity(40.7357, -73.7924, centroid, max_reasonable_distance=20000)
        score_long = score_by_proximity(40.7357, -73.7924, centroid, max_reasonable_distance=50000)
        # Score should be higher with longer max distance
        assert score_long > score_short

