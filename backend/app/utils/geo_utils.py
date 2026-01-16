"""Geographic utilities for location processing."""
import math
from typing import Tuple


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance between two points using Haversine formula.
    
    Args:
        lat1: Latitude of point 1
        lng1: Longitude of point 1
        lat2: Latitude of point 2
        lng2: Longitude of point 2
        
    Returns:
        Distance in meters
    """
    # Earth's radius in meters
    R = 6371000
    
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    # Haversine formula
    a = (
        math.sin(delta_lat / 2) ** 2 +
        math.cos(lat1_rad) * math.cos(lat2_rad) *
        math.sin(delta_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def are_locations_nearby(
    lat1: float, lng1: float,
    lat2: float, lng2: float,
    radius_meters: float = 50.0
) -> bool:
    """
    Check if two locations are within a radius.
    
    Args:
        lat1: Latitude of point 1
        lng1: Longitude of point 1
        lat2: Latitude of point 2
        lng2: Longitude of point 2
        radius_meters: Maximum distance in meters (default 50m)
        
    Returns:
        True if locations are within radius
    """
    distance = haversine_distance(lat1, lng1, lat2, lng2)
    return distance <= radius_meters


def validate_coordinates(lat: float, lng: float) -> bool:
    """
    Validate latitude and longitude values.
    
    Args:
        lat: Latitude
        lng: Longitude
        
    Returns:
        True if coordinates are valid
    """
    return -90 <= lat <= 90 and -180 <= lng <= 180


def get_midpoint(lat1: float, lng1: float, lat2: float, lng2: float) -> Tuple[float, float]:
    """
    Calculate midpoint between two coordinates.
    
    Args:
        lat1: Latitude of point 1
        lng1: Longitude of point 1
        lat2: Latitude of point 2
        lng2: Longitude of point 2
        
    Returns:
        Tuple of (latitude, longitude) for midpoint
    """
    # Simple average (works for nearby points)
    mid_lat = (lat1 + lat2) / 2
    mid_lng = (lng1 + lng2) / 2
    
    return mid_lat, mid_lng
