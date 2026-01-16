import logging
from typing import List
from urllib.parse import urlencode

from ..core.config import settings
from ..db.models import Waypoint

logger = logging.getLogger(__name__)


class MapsLinkService:
    """Service for generating Google Maps navigation links."""
    
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
            params = {
                "api": 1,
                "query": f"{wp.lat},{wp.lng}",
                "query_place_id": wp.google_place_id or ""
            }
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
        
        # Build waypoints string
        waypoint_coords = [f"{wp.lat},{wp.lng}" for wp in middle_waypoints]
        waypoints_str = "|".join(waypoint_coords)
        
        # Build URL
        params = {
            "api": 1,
            "origin": f"{origin.lat},{origin.lng}",
            "destination": f"{destination.lat},{destination.lng}",
            "travelmode": "walking"
        }
        
        if waypoints_str:
            params["waypoints"] = waypoints_str
        
        url = f"https://www.google.com/maps/dir/?{urlencode(params)}"
        logger.info(f"Generated Maps URL with {len(waypoints)} waypoints")
        
        return url


# Singleton instance
maps_link_service = MapsLinkService()
