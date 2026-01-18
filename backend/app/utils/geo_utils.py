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


def calculate_centroid(coords: list) -> Tuple[float, float]:
    """
    Calculate the geographic centroid of a list of coordinates.
    
    Args:
        coords: List of (lat, lng) tuples
        
    Returns:
        Tuple of (latitude, longitude) for centroid, or (None, None) if empty
    """
    if not coords:
        return None, None
    
    valid_coords = [(lat, lng) for lat, lng in coords if lat is not None and lng is not None]
    
    if not valid_coords:
        return None, None
    
    avg_lat = sum(lat for lat, _ in valid_coords) / len(valid_coords)
    avg_lng = sum(lng for _, lng in valid_coords) / len(valid_coords)
    
    return avg_lat, avg_lng


def calculate_bounding_radius(coords: list, centroid: Tuple[float, float]) -> float:
    """
    Calculate the radius that encompasses all coordinates from a centroid.
    
    Args:
        coords: List of (lat, lng) tuples
        centroid: Tuple of (lat, lng) for the center point
        
    Returns:
        Radius in meters that contains all points, minimum 10km, maximum 100km
    """
    if not coords or centroid[0] is None:
        return 50000.0  # Default 50km when no data
    
    max_distance = 0.0
    for lat, lng in coords:
        if lat is not None and lng is not None:
            distance = haversine_distance(centroid[0], centroid[1], lat, lng)
            max_distance = max(max_distance, distance)
    
    # Add 20% buffer, with minimum 10km and maximum 100km
    radius = max_distance * 1.2
    return max(10000.0, min(100000.0, radius))


def score_by_proximity(
    candidate_lat: float,
    candidate_lng: float,
    centroid: Tuple[float, float],
    max_reasonable_distance: float = 100000.0  # 100km
) -> float:
    """
    Score a candidate location based on proximity to the cluster centroid.
    
    Args:
        candidate_lat: Latitude of candidate
        candidate_lng: Longitude of candidate
        centroid: Tuple of (lat, lng) for the center point
        max_reasonable_distance: Maximum distance in meters to consider (default 100km)
        
    Returns:
        Score between 0.0 (far away) and 1.0 (at centroid)
    """
    if centroid[0] is None or candidate_lat is None:
        return 0.5  # Neutral score when no data
    
    distance = haversine_distance(centroid[0], centroid[1], candidate_lat, candidate_lng)
    
    # Linear decay: score of 1.0 at centroid, 0.0 at max_reasonable_distance
    score = max(0.0, 1.0 - (distance / max_reasonable_distance))
    
    return score

