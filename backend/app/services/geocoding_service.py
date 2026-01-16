"""Geocoding service for resolving location names to coordinates."""
import asyncio
import logging
import hashlib
import json
from typing import Optional, List, Dict, Any
import googlemaps
from googlemaps.exceptions import ApiError
import concurrent.futures

from ..core.config import settings
from ..core.redis_client import get_redis
from ..models.schemas import CandidateLocation

logger = logging.getLogger(__name__)

# Thread pool for sync Google Maps API calls
_geocode_executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)


class GeocodingService:
    """Service for geocoding location names using Google Places API."""
    
    def __init__(self):
        self.client = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)
        self.redis = get_redis()
        # Number of alternatives to return
        self.max_alternatives = 5
    
    def _get_cache_key(self, query: str) -> str:
        """Generate cache key for a geocoding query."""
        query_hash = hashlib.md5(query.lower().strip().encode()).hexdigest()
        return f"geocode:{query_hash}"
    
    def _get_alternatives_cache_key(self, query: str) -> str:
        """Generate cache key for alternatives query."""
        query_hash = hashlib.md5(query.lower().strip().encode()).hexdigest()
        return f"geocode_alt:{query_hash}"
    
    def geocode_location(self, location: CandidateLocation) -> Optional[CandidateLocation]:
        """
        Geocode a location and enrich it with Google Places data.
        Returns the first/best match only.
        
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
            
            # Get place details for opening hours (skip for speed if needed)
            opening_hours = None
            try:
                details = self.client.place(place_id=place_id, fields=["opening_hours"])
                if "result" in details and "opening_hours" in details["result"]:
                    opening_hours = details["result"]["opening_hours"]
            except Exception as e:
                logger.warning(f"Failed to get opening hours: {e}")
            
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
    
    def geocode_with_alternatives(
        self, 
        location: CandidateLocation
    ) -> Dict[str, Any]:
        """
        Geocode a location and return top 5 alternatives for user selection.
        
        Args:
            location: Candidate location with at least a name
            
        Returns:
            Dict with 'primary' (best match) and 'alternatives' (list of up to 4 more)
        """
        query = f"{location.name} {location.description or ''}".strip()
        
        # Check alternatives cache first
        cache_key = self._get_alternatives_cache_key(query)
        try:
            cached = self.redis.get(cache_key)
            if cached:
                logger.info(f"Cache hit for alternatives: {query}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read error: {e}")
        
        # Call Google Places Text Search
        try:
            logger.info(f"Geocoding with alternatives: {query}")
            results = self.client.places(query=query)
            
            if not results.get("results"):
                logger.warning(f"No results found for: {query}")
                return {"primary": None, "alternatives": []}
            
            # Build alternatives list (up to max_alternatives)
            alternatives = []
            primary = None
            
            for i, place in enumerate(results["results"][:self.max_alternatives]):
                # Get photo URL if available
                photo_url = None
                photos = place.get("photos", [])
                if photos:
                    photo_ref = photos[0].get("photo_reference")
                    if photo_ref:
                        photo_url = self._get_photo_url(photo_ref)
                
                place_data = {
                    "name": place.get("name", location.name),
                    "description": location.description,
                    "confidence": location.confidence,
                    "google_place_id": place["place_id"],
                    "lat": place["geometry"]["location"]["lat"],
                    "lng": place["geometry"]["location"]["lng"],
                    "address": place.get("formatted_address"),
                    "rating": place.get("rating"),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "types": place.get("types", []),
                    "opening_hours": None,  # Skip for speed
                    "photo_url": photo_url
                }
                
                if i == 0:
                    primary = place_data
                else:
                    alternatives.append(place_data)
            
            result = {
                "primary": primary,
                "alternatives": alternatives,
                "original_query": location.name
            }
            
            # Cache result
            try:
                self.redis.setex(
                    cache_key,
                    settings.DISTANCE_MATRIX_CACHE_TTL,
                    json.dumps(result)
                )
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")
            
            return result
            
        except ApiError as e:
            logger.error(f"Google Places API error: {e}")
            return {"primary": None, "alternatives": []}
        except Exception as e:
            logger.error(f"Error geocoding location: {e}")
            return {"primary": None, "alternatives": []}
    
    async def geocode_batch_async(
        self, 
        locations: List[CandidateLocation],
        with_alternatives: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Geocode multiple locations in parallel with alternatives.
        
        Args:
            locations: List of candidate locations
            with_alternatives: Whether to include alternatives for each
            
        Returns:
            List of geocoding results with alternatives
        """
        logger.info(f"Starting parallel geocoding of {len(locations)} locations")
        
        loop = asyncio.get_event_loop()
        
        # Run geocoding in thread pool (Google Maps client is sync)
        if with_alternatives:
            futures = [
                loop.run_in_executor(
                    _geocode_executor,
                    self.geocode_with_alternatives,
                    loc
                )
                for loc in locations
            ]
        else:
            futures = [
                loop.run_in_executor(
                    _geocode_executor,
                    self.geocode_location,
                    loc
                )
                for loc in locations
            ]
        
        results = await asyncio.gather(*futures, return_exceptions=True)
        
        # Filter out errors
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Geocoding failed for {locations[i].name}: {result}")
                continue
            if with_alternatives:
                if result.get("primary"):
                    valid_results.append(result)
            else:
                if result:
                    valid_results.append(result)
        
        logger.info(f"Parallel geocoding complete: {len(valid_results)} successful")
        return valid_results
    
    def _get_photo_url(self, photo_reference: str, max_width: int = 400) -> str:
        """
        Generate a Google Places Photo URL.
        
        Args:
            photo_reference: The photo reference from Places API
            max_width: Maximum width of the photo
            
        Returns:
            URL string for the photo
        """
        return (
            f"https://maps.googleapis.com/maps/api/place/photo"
            f"?maxwidth={max_width}"
            f"&photo_reference={photo_reference}"
            f"&key={settings.GOOGLE_MAPS_API_KEY}"
        )
    
    def geocode_batch(self, locations: List[CandidateLocation]) -> List[CandidateLocation]:
        """
        Geocode multiple locations (sync, backwards compatible).
        
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
