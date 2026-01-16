"""Places API endpoints for search and photo retrieval."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import logging
import math
import googlemaps

from ..core.config import settings
from ..core.auth import get_current_user
from ..db.models import User

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize Google Maps client
gmaps = googlemaps.Client(key=settings.GOOGLE_MAPS_API_KEY)


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


@router.get("/places/search")
async def search_places(
    query: str = Query(..., min_length=2),
    lat: Optional[float] = Query(None, description="Latitude for proximity bias (itinerary centroid)"),
    lng: Optional[float] = Query(None, description="Longitude for proximity bias (itinerary centroid)"),
    current_user: User = Depends(get_current_user)
):
    """
    Search for places by name with proximity bias to itinerary.
    
    When lat/lng are provided (itinerary centroid), results are:
    1. Biased towards that location in the API call
    2. Sorted by distance to that location (closest first)
    
    This ensures that if user searches for "Chili's" while their itinerary is in NYC,
    they get Chili's locations in NYC, not California.
    
    Returns up to 5 results with photos, sorted by proximity.
    """
    try:
        # Build location bias if coordinates provided
        location = None
        if lat is not None and lng is not None:
            location = (lat, lng)
            logger.info(f"Searching '{query}' with proximity bias at ({lat}, {lng})")
        
        # Search using Google Places API with location bias
        results = gmaps.places(
            query=query,
            location=location,
            radius=50000 if location else None  # 50km radius if location provided
        )
        
        if not results.get("results"):
            return {"results": []}
        
        # Process results
        places = []
        for place in results["results"][:10]:  # Get more results for better sorting
            place_lat = place.get("geometry", {}).get("location", {}).get("lat")
            place_lng = place.get("geometry", {}).get("location", {}).get("lng")
            
            # Calculate distance from itinerary centroid
            distance = None
            if location and place_lat and place_lng:
                distance = haversine_distance(lat, lng, place_lat, place_lng)
            
            place_data = {
                "name": place.get("name"),
                "place_id": place.get("place_id"),
                "address": place.get("formatted_address"),
                "lat": place_lat,
                "lng": place_lng,
                "rating": place.get("rating"),
                "user_ratings_total": place.get("user_ratings_total"),
                "photo_url": None,
                "distance_meters": distance
            }
            
            # Get photo URL if available
            photos = place.get("photos", [])
            if photos:
                photo_ref = photos[0].get("photo_reference")
                if photo_ref:
                    place_data["photo_url"] = get_photo_url(photo_ref)
            
            places.append(place_data)
        
        # Sort by distance (closest first) if location was provided
        if location:
            places.sort(key=lambda x: x["distance_meters"] or float('inf'))
            logger.info(f"Sorted {len(places)} results by proximity")
        
        # Return top 5
        return {"results": places[:5]}
        
    except Exception as e:
        logger.error(f"Places search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not search places"
        )


@router.get("/places/{place_id}/photo")
async def get_place_photo(
    place_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get the primary photo URL for a place.
    """
    try:
        # Get place details
        result = gmaps.place(
            place_id=place_id,
            fields=["photos", "name"]
        )
        
        if not result.get("result"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Place not found"
            )
        
        place = result["result"]
        photos = place.get("photos", [])
        
        if not photos:
            return {"photo_url": None, "name": place.get("name")}
        
        # Get the first (primary) photo
        photo_ref = photos[0].get("photo_reference")
        photo_url = get_photo_url(photo_ref) if photo_ref else None
        
        return {
            "photo_url": photo_url,
            "name": place.get("name")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get place photo failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not get place photo"
        )


@router.get("/places/{place_id}/details")
async def get_place_details(
    place_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed information about a place including photos.
    """
    try:
        result = gmaps.place(
            place_id=place_id,
            fields=[
                "name", "formatted_address", "geometry", "rating",
                "user_ratings_total", "opening_hours", "photos", "types",
                "price_level", "website", "formatted_phone_number"
            ]
        )
        
        if not result.get("result"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Place not found"
            )
        
        place = result["result"]
        
        # Get photo URLs (up to 5)
        photo_urls = []
        for photo in place.get("photos", [])[:5]:
            photo_ref = photo.get("photo_reference")
            if photo_ref:
                photo_urls.append(get_photo_url(photo_ref))
        
        return {
            "name": place.get("name"),
            "address": place.get("formatted_address"),
            "lat": place.get("geometry", {}).get("location", {}).get("lat"),
            "lng": place.get("geometry", {}).get("location", {}).get("lng"),
            "rating": place.get("rating"),
            "user_ratings_total": place.get("user_ratings_total"),
            "opening_hours": place.get("opening_hours"),
            "types": place.get("types"),
            "price_level": place.get("price_level"),
            "website": place.get("website"),
            "phone": place.get("formatted_phone_number"),
            "photos": photo_urls
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get place details failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not get place details"
        )


def get_photo_url(photo_reference: str, max_width: int = 400) -> str:
    """
    Generate a Google Places Photo URL.
    
    Note: This URL requires an API key and will count against photo quota.
    For production, consider proxying through your own server.
    """
    return (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={max_width}"
        f"&photo_reference={photo_reference}"
        f"&key={settings.GOOGLE_MAPS_API_KEY}"
    )
