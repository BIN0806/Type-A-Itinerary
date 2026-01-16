"""Tests for geographic utility functions."""
import pytest
from app.utils.geo_utils import (
    haversine_distance,
    are_locations_nearby,
    validate_coordinates,
    get_midpoint
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
