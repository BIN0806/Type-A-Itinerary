import logging
import hashlib
import json
from typing import List, Optional, Dict, Any
import googlemaps
from googlemaps.exceptions import ApiError

from ..core.config import settings
from ..core.redis_client import get_redis
from ..db.models import Waypoint
from ..models.schemas import LatLng

logger = logging.getLogger(__name__)


class DistanceMatrixService:
    """Service for calculating distances between waypoints with walking or transit."""
    
    def __init__(self):
        self.client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
        self.redis = get_redis()
    
    def _get_cache_key(self, origin: str, destination: str, mode: str = "walking") -> str:
        """Generate cache key for distance between two points."""
        key_str = f"{origin}:{destination}:{mode}"
        return f"distance:{hashlib.md5(key_str.encode()).hexdigest()}"
    
    def _get_distance(
        self, 
        origin: LatLng, 
        destination: LatLng,
        mode: str = "walking"
    ) -> Dict[str, Any]:
        """
        Get distance/duration between two points with optional transit info.
        
        Args:
            origin: Starting point
            destination: Ending point
            mode: "walking" or "transit"
            
        Returns:
            Dict with duration_seconds, distance_meters, and transit_details (if transit)
        """
        origin_str = f"{origin.lat},{origin.lng}"
        dest_str = f"{destination.lat},{destination.lng}"
        
        # Check cache
        cache_key = self._get_cache_key(origin_str, dest_str, mode)
        try:
            cached = self.redis.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for distance ({mode}): {origin_str} -> {dest_str}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read error: {e}")
        
        # Call Google Distance Matrix API
        try:
            result = self.client.distance_matrix(
                origins=[origin_str],
                destinations=[dest_str],
                mode=mode
            )
            
            if result["status"] == "OK":
                element = result["rows"][0]["elements"][0]
                if element["status"] == "OK":
                    distance_info = {
                        "duration_seconds": element["duration"]["value"],
                        "distance_meters": element.get("distance", {}).get("value", 0),
                        "mode": mode,
                        "transit_details": None
                    }
                    
                    # For transit, try to get route details
                    if mode == "transit":
                        transit_details = self._get_transit_details(origin, destination)
                        if transit_details:
                            distance_info["transit_details"] = transit_details
                    
                    # Cache result
                    try:
                        self.redis.setex(
                            cache_key,
                            settings.DISTANCE_MATRIX_CACHE_TTL,
                            json.dumps(distance_info)
                        )
                    except Exception as e:
                        logger.warning(f"Redis cache write error: {e}")
                    
                    return distance_info
            
            # If API call fails, estimate using straight-line distance
            from math import radians, cos, sin, asin, sqrt
            
            lat1, lon1 = radians(origin.lat), radians(origin.lng)
            lat2, lon2 = radians(destination.lat), radians(destination.lng)
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * asin(sqrt(a))
            distance_meters = 6371000 * c  # Earth radius in meters
            
            # Estimate time based on mode
            if mode == "transit":
                # Assume average transit speed of 30 km/h including wait times
                estimated_seconds = int((distance_meters * 1.2) / 8.3)  # ~30 km/h
            else:
                # Walking: 1.4 m/s with street network factor
                estimated_seconds = int((distance_meters * 1.3) / 1.4)
            
            logger.warning(f"Using estimated distance ({mode}): {estimated_seconds}s")
            return {
                "duration_seconds": estimated_seconds,
                "distance_meters": int(distance_meters),
                "mode": mode,
                "transit_details": None
            }
            
        except ApiError as e:
            logger.error(f"Google Distance Matrix API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Error calculating distance: {e}")
            raise
    
    def _get_transit_details(
        self, 
        origin: LatLng, 
        destination: LatLng
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get detailed transit directions including line names and colors.
        
        Returns list of transit steps with line info.
        """
        try:
            directions = self.client.directions(
                origin=f"{origin.lat},{origin.lng}",
                destination=f"{destination.lat},{destination.lng}",
                mode="transit"
            )
            
            if not directions:
                return None
            
            # Extract transit steps
            transit_steps = []
            route = directions[0]
            legs = route.get("legs", [])
            
            for leg in legs:
                for step in leg.get("steps", []):
                    if step.get("travel_mode") == "TRANSIT":
                        transit_info = step.get("transit_details", {})
                        line = transit_info.get("line", {})
                        
                        transit_steps.append({
                            "type": line.get("vehicle", {}).get("type", "UNKNOWN"),
                            "line_name": line.get("short_name") or line.get("name", ""),
                            "line_color": line.get("color", "#4F46E5"),
                            "text_color": line.get("text_color", "#FFFFFF"),
                            "departure_stop": transit_info.get("departure_stop", {}).get("name", ""),
                            "arrival_stop": transit_info.get("arrival_stop", {}).get("name", ""),
                            "num_stops": transit_info.get("num_stops", 0),
                            "duration_seconds": step.get("duration", {}).get("value", 0),
                            "headsign": transit_info.get("headsign", ""),
                        })
                    elif step.get("travel_mode") == "WALKING":
                        walk_duration = step.get("duration", {}).get("value", 0)
                        if walk_duration > 60:  # Only include walks > 1 minute
                            transit_steps.append({
                                "type": "WALKING",
                                "line_name": "Walk",
                                "line_color": "#9CA3AF",
                                "text_color": "#FFFFFF",
                                "departure_stop": "",
                                "arrival_stop": "",
                                "num_stops": 0,
                                "duration_seconds": walk_duration,
                                "headsign": f"{walk_duration // 60} min walk",
                            })
            
            return transit_steps if transit_steps else None
            
        except Exception as e:
            logger.warning(f"Could not get transit details: {e}")
            return None
    
    def get_distance_matrix(
        self,
        waypoints: List[Waypoint],
        start_location: LatLng,
        mode: str = "walking"
    ) -> Dict[str, Any]:
        """
        Get distance matrix for all waypoints plus start location.
        
        Args:
            waypoints: List of waypoints
            start_location: Starting point
            mode: "walking" or "transit"
            
        Returns:
            Dict with:
            - matrix: N×N matrix where N = len(waypoints) + 1
            - transit_details: Dict of (i,j) -> transit steps (if mode=transit)
        """
        # Build list of all points (start + waypoints)
        points = [start_location]
        for wp in waypoints:
            points.append(LatLng(lat=wp.lat, lng=wp.lng))
        
        n = len(points)
        matrix = [[0] * n for _ in range(n)]
        transit_details = {}
        
        # Calculate distances
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i][j] = 0
                else:
                    try:
                        distance_info = self._get_distance(points[i], points[j], mode)
                        matrix[i][j] = distance_info["duration_seconds"]
                        
                        # Store transit details for route visualization
                        if mode == "transit" and distance_info.get("transit_details"):
                            transit_details[f"{i}-{j}"] = distance_info["transit_details"]
                            
                    except Exception as e:
                        logger.error(f"Failed to get distance {i}->{j}: {e}")
                        # Use fallback: 10 minutes
                        matrix[i][j] = 600
        
        logger.info(f"Distance matrix calculated: {n}×{n} ({mode} mode)")
        
        return {
            "matrix": matrix,
            "transit_details": transit_details,
            "mode": mode
        }
    
    def compare_modes(
        self,
        origin: LatLng,
        destination: LatLng
    ) -> Dict[str, Any]:
        """
        Compare walking vs transit for a single route.
        Returns the faster option with details.
        """
        walking = self._get_distance(origin, destination, "walking")
        transit = self._get_distance(origin, destination, "transit")
        
        walking_time = walking["duration_seconds"]
        transit_time = transit["duration_seconds"]
        
        # Transit is better if it saves at least 2 minutes
        transit_is_better = transit_time < (walking_time - 120)
        
        return {
            "walking_seconds": walking_time,
            "transit_seconds": transit_time,
            "recommended": "transit" if transit_is_better else "walking",
            "time_saved_seconds": walking_time - transit_time if transit_is_better else 0,
            "transit_details": transit.get("transit_details") if transit_is_better else None
        }


# Singleton instance
distance_matrix_service = DistanceMatrixService()
