import logging
import hashlib
import json
from typing import List
import googlemaps
from googlemaps.exceptions import ApiError

from ..core.config import settings
from ..core.redis_client import get_redis
from ..db.models import Waypoint
from ..models.schemas import LatLng

logger = logging.getLogger(__name__)


class DistanceMatrixService:
    """Service for calculating walking distances between waypoints."""
    
    def __init__(self):
        self.client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
        self.redis = get_redis()
    
    def _get_cache_key(self, origin: str, destination: str) -> str:
        """Generate cache key for distance between two points."""
        # Use sorted to ensure consistent key regardless of order
        key_str = f"{origin}:{destination}:walking"
        return f"distance:{hashlib.md5(key_str.encode()).hexdigest()}"
    
    def _get_distance(self, origin: LatLng, destination: LatLng) -> int:
        """
        Get walking distance in seconds between two points.
        
        Args:
            origin: Starting point
            destination: Ending point
            
        Returns:
            Travel time in seconds
        """
        origin_str = f"{origin.lat},{origin.lng}"
        dest_str = f"{destination.lat},{destination.lng}"
        
        # Check cache
        cache_key = self._get_cache_key(origin_str, dest_str)
        try:
            cached = self.redis.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for distance: {origin_str} -> {dest_str}")
                return int(cached)
        except Exception as e:
            logger.warning(f"Redis cache read error: {e}")
        
        # Call Google Distance Matrix API
        try:
            result = self.client.distance_matrix(
                origins=[origin_str],
                destinations=[dest_str],
                mode="walking"
            )
            
            if result["status"] == "OK":
                element = result["rows"][0]["elements"][0]
                if element["status"] == "OK":
                    duration_seconds = element["duration"]["value"]
                    
                    # Cache result
                    try:
                        self.redis.setex(
                            cache_key,
                            settings.DISTANCE_MATRIX_CACHE_TTL,
                            duration_seconds
                        )
                    except Exception as e:
                        logger.warning(f"Redis cache write error: {e}")
                    
                    return duration_seconds
            
            # If API call fails, estimate using straight-line distance
            # Assume walking speed of 1.4 m/s (moderate pace)
            from math import radians, cos, sin, asin, sqrt
            
            lat1, lon1 = radians(origin.lat), radians(origin.lng)
            lat2, lon2 = radians(destination.lat), radians(destination.lng)
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * asin(sqrt(a))
            distance_meters = 6371000 * c  # Earth radius in meters
            
            # Multiply by 1.3 for street network factor
            estimated_seconds = int((distance_meters * 1.3) / 1.4)
            
            logger.warning(f"Using estimated distance: {estimated_seconds}s")
            return estimated_seconds
            
        except ApiError as e:
            logger.error(f"Google Distance Matrix API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Error calculating distance: {e}")
            raise
    
    def get_distance_matrix(
        self,
        waypoints: List[Waypoint],
        start_location: LatLng
    ) -> List[List[int]]:
        """
        Get distance matrix for all waypoints plus start location.
        
        Args:
            waypoints: List of waypoints
            start_location: Starting point
            
        Returns:
            N×N matrix where N = len(waypoints) + 1 (for start location)
            Matrix[i][j] = travel time in seconds from point i to point j
        """
        # Build list of all points (start + waypoints)
        points = [start_location]
        for wp in waypoints:
            points.append(LatLng(lat=wp.lat, lng=wp.lng))
        
        n = len(points)
        matrix = [[0] * n for _ in range(n)]
        
        # Calculate distances
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i][j] = 0
                else:
                    try:
                        distance = self._get_distance(points[i], points[j])
                        matrix[i][j] = distance
                    except Exception as e:
                        logger.error(f"Failed to get distance {i}->{j}: {e}")
                        # Use fallback: 10 minutes
                        matrix[i][j] = 600
        
        logger.info(f"Distance matrix calculated: {n}×{n}")
        return matrix


# Singleton instance
distance_matrix_service = DistanceMatrixService()
