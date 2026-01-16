import logging
import hashlib
import json
from typing import Optional, List
import googlemaps
from googlemaps.exceptions import ApiError

from ..core.config import settings
from ..core.redis_client import get_redis
from ..models.schemas import CandidateLocation

logger = logging.getLogger(__name__)


class GeocodingService:
    """Service for geocoding location names using Google Places API."""
    
    def __init__(self):
        self.client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
        self.redis = get_redis()
    
    def _get_cache_key(self, query: str) -> str:
        """Generate cache key for a geocoding query."""
        query_hash = hashlib.md5(query.lower().strip().encode()).hexdigest()
        return f"geocode:{query_hash}"
    
    def geocode_location(self, location: CandidateLocation) -> Optional[CandidateLocation]:
        """
        Geocode a location and enrich it with Google Places data.
        
        Args:
            location: Candidate location with at least a name
            
        Returns:
            Enriched location with lat/lng, place_id, and details, or None if not found
        """
        query = f"{location.name} {location.description or ''}".strip()
        
        # Check cache first
        cache_key = self._get_cache_key(query)
        try:
            cached = self.redis.get(cache_key)
            if cached:
                logger.info(f"Cache hit for query: {query}")
                data = json.loads(cached)
                location.google_place_id = data["place_id"]
                location.lat = data["lat"]
                location.lng = data["lng"]
                location.address = data.get("address")
                location.opening_hours = data.get("opening_hours")
                return location
        except Exception as e:
            logger.warning(f"Redis cache read error: {e}")
        
        # Call Google Places Text Search
        try:
            logger.info(f"Geocoding query: {query}")
            results = self.client.places(query=query)
            
            if not results.get("results"):
                logger.warning(f"No results found for: {query}")
                return None
            
            # Get first result
            place = results["results"][0]
            place_id = place["place_id"]
            
            # Get place details for opening hours
            details = self.client.place(place_id=place_id, fields=["opening_hours"])
            opening_hours = None
            if "result" in details and "opening_hours" in details["result"]:
                opening_hours = details["result"]["opening_hours"]
            
            # Enrich location
            location.google_place_id = place_id
            location.lat = place["geometry"]["location"]["lat"]
            location.lng = place["geometry"]["location"]["lng"]
            location.address = place.get("formatted_address")
            location.opening_hours = opening_hours
            
            # Cache result
            try:
                cache_data = {
                    "place_id": place_id,
                    "lat": location.lat,
                    "lng": location.lng,
                    "address": location.address,
                    "opening_hours": opening_hours
                }
                self.redis.setex(
                    cache_key,
                    settings.DISTANCE_MATRIX_CACHE_TTL,
                    json.dumps(cache_data)
                )
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")
            
            return location
            
        except ApiError as e:
            logger.error(f"Google Places API error: {e}")
            return None
        except Exception as e:
            logger.error(f"Error geocoding location: {e}")
            return None
    
    def geocode_batch(self, locations: List[CandidateLocation]) -> List[CandidateLocation]:
        """
        Geocode multiple locations.
        
        Args:
            locations: List of candidate locations
            
        Returns:
            List of successfully geocoded locations
        """
        geocoded = []
        for location in locations:
            enriched = self.geocode_location(location)
            if enriched:
                geocoded.append(enriched)
        
        return geocoded


# Singleton instance
geocoding_service = GeocodingService()
