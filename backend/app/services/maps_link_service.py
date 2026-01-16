import logging
from typing import List
from urllib.parse import urlencode, quote

from ..core.config import settings
from ..db.models import Waypoint

logger = logging.getLogger(__name__)


class MapsLinkService:
    """Service for generating Google Maps navigation links."""
    
    def _get_location_string(self, waypoint: Waypoint) -> str:
        """
        Get the best location string for a waypoint.
        Prefers name with address for clarity, falls back to coordinates.
        """
        if waypoint.name and waypoint.address:
            return f"{waypoint.name}, {waypoint.address}"
        elif waypoint.name:
            return waypoint.name
        elif waypoint.address:
            return waypoint.address
        else:
            return f"{waypoint.lat},{waypoint.lng}"
    
    def generate_link(self, waypoints: List[Waypoint]) -> str:
        """
        Generate Google Maps URL for navigation.
        
        Args:
            waypoints: Ordered list of waypoints
            
        Returns:
            Google Maps URL string
        """
        if not waypoints:
            return ""
        
        if len(waypoints) == 1:
            # Single waypoint - just show location
            wp = waypoints[0]
            location_str = self._get_location_string(wp)
            params = {
                "api": 1,
                "query": location_str,
            }
            if wp.google_place_id:
                params["query_place_id"] = wp.google_place_id
            return f"https://www.google.com/maps/search/?{urlencode(params)}"
        
        # Multiple waypoints - create navigation route
        origin = waypoints[0]
        destination = waypoints[-1]
        
        # Handle waypoint limit (max 9 in URL)
        middle_waypoints = waypoints[1:-1]
        if len(middle_waypoints) > settings.MAX_WAYPOINTS_IN_URL:
            logger.warning(
                f"Too many waypoints ({len(middle_waypoints)}), "
                f"truncating to {settings.MAX_WAYPOINTS_IN_URL}"
            )
            # Keep evenly spaced waypoints
            step = len(middle_waypoints) / settings.MAX_WAYPOINTS_IN_URL
            indices = [int(i * step) for i in range(settings.MAX_WAYPOINTS_IN_URL)]
            middle_waypoints = [middle_waypoints[i] for i in indices]
        
        # Build waypoints string using location names
        waypoint_names = [self._get_location_string(wp) for wp in middle_waypoints]
        waypoints_str = "|".join(waypoint_names)
        
        # Build URL using location names instead of coordinates
        params = {
            "api": 1,
            "origin": self._get_location_string(origin),
            "destination": self._get_location_string(destination),
            "travelmode": "walking"
        }
        
        if waypoints_str:
            params["waypoints"] = waypoints_str
        
        url = f"https://www.google.com/maps/dir/?{urlencode(params)}"
        logger.info(f"Generated Maps URL with {len(waypoints)} waypoints")
        
        return url


# Singleton instance
maps_link_service = MapsLinkService()
