from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import logging
import asyncio
import time

from ..core.database import get_db
from ..core.auth import get_current_user
from ..core.config import settings
from ..db.models import User, Trip, Waypoint, AnalysisJob, TripStatus
from ..models.schemas import (
    TripCreate, TripResponse, WaypointResponse, WaypointConfirmation,
    AnalysisJobResponse, AnalysisJobComplete, OptimizationRequest,
    OptimizationResponse, MapsLinkResponse, TripConstraints
)
from ..services.vision_service import vision_service
from ..services.geocoding_service import geocoding_service
from ..services.distance_matrix_service import distance_matrix_service
from ..services.route_optimizer import route_optimizer
from ..services.maps_link_service import maps_link_service
from ..services.entity_resolver import entity_resolver

router = APIRouter()
logger = logging.getLogger(__name__)

# Total processing timeout (seconds) - must stay under 45s client timeout
PROCESSING_TIMEOUT = 40.0


async def process_images_background(job_id: UUID, image_bytes_list: List[bytes], db: Session):
    """
    Background task to process uploaded images with optimized parallel processing.
    
    Optimization strategy:
    - Parallel image analysis (OCR + Vision run concurrently per image)
    - Parallel geocoding with alternatives
    - Strict timeout to stay under 45s total
    """
    start_time = time.time()
    
    try:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return
        
        # Update job status
        job.total_images = len(image_bytes_list)
        job.processed_images = 0
        db.commit()
        
        logger.info(f"Starting optimized processing of {len(image_bytes_list)} images")
        
        # === PHASE 1: Parallel Image Analysis (60% of progress) ===
        # All images processed concurrently with rate limiting
        failed_images = []
        raw_candidates = []
        
        try:
            analysis_result = await asyncio.wait_for(
                vision_service.analyze_images_batch_async(
                    image_bytes_list,
                    max_concurrent=3  # Limit to avoid rate limits
                ),
                timeout=25.0  # 25s budget for image analysis
            )
            raw_candidates = analysis_result.get("candidates", [])
            failed_images = analysis_result.get("failed_images", [])
        except asyncio.TimeoutError:
            logger.warning("Image analysis phase timed out, proceeding with partial results")
            raw_candidates = []
            failed_images = [{"index": i+1, "reason": "Processing timed out"} for i in range(len(image_bytes_list))]
        
        job.processed_images = len(image_bytes_list)
        job.progress = 0.6
        db.commit()
        
        elapsed = time.time() - start_time
        logger.info(f"Phase 1 complete: {len(raw_candidates)} raw candidates, {len(failed_images)} failed in {elapsed:.1f}s")
        
        # === PHASE 2: Entity Resolution (10% of progress) ===
        logger.info(f"Resolving {len(raw_candidates)} raw candidates...")
        resolution_result = entity_resolver.resolve_duplicates(raw_candidates, track_duplicates=True)
        resolved_candidates = resolution_result["candidates"]
        duplicates_merged = resolution_result.get("duplicates_merged", [])
        
        # Filter by confidence threshold
        filtered_candidates = entity_resolver.filter_by_confidence(
            resolved_candidates,
            min_confidence=0.50
        )
        
        logger.info(f"After resolution: {len(filtered_candidates)} candidates")
        job.progress = 0.7
        db.commit()
        
        # === PHASE 3: Parallel Geocoding with Proximity Re-ranking (30% of progress) ===
        # Two-pass approach:
        # 1. Geocode all candidates (without bias for first pass)
        # 2. Compute centroid from results and re-rank alternatives by proximity
        
        from ..utils.geo_utils import calculate_centroid, calculate_bounding_radius, score_by_proximity
        
        remaining_time = PROCESSING_TIMEOUT - (time.time() - start_time)
        if remaining_time < 5:
            logger.warning("Low time budget for geocoding, limiting candidates")
            filtered_candidates = filtered_candidates[:3]  # Limit to top 3
        
        all_candidates = []
        geocode_results = []
        
        if filtered_candidates:
            try:
                # First pass: geocode without location bias
                geocode_results = await asyncio.wait_for(
                    geocoding_service.geocode_batch_async(
                        filtered_candidates,
                        with_alternatives=True
                    ),
                    timeout=min(remaining_time - 2, 12.0)  # Leave 2s buffer
                )
                
                # Collect coordinates from primary results for centroid calculation
                primary_coords = []
                for result in geocode_results:
                    primary = result.get("primary")
                    if primary and primary.get("lat") is not None:
                        primary_coords.append((primary["lat"], primary["lng"]))
                
                # Compute centroid of geocoded locations
                centroid = calculate_centroid(primary_coords)
                bounding_radius = calculate_bounding_radius(primary_coords, centroid)
                
                logger.info(f"Computed cluster centroid: {centroid}, radius: {bounding_radius/1000:.1f}km from {len(primary_coords)} locations")
                
                # Second pass: re-rank alternatives by proximity to centroid
                for result in geocode_results:
                    primary = result.get("primary")
                    alternatives = result.get("alternatives", [])
                    
                    if primary:
                        # If we have a valid centroid and alternatives, re-rank
                        if centroid[0] is not None and alternatives:
                            all_options = [primary] + alternatives
                            
                            # Score each option by proximity
                            scored_options = []
                            for i, opt in enumerate(all_options):
                                opt_lat = opt.get("lat")
                                opt_lng = opt.get("lng")
                                
                                if opt_lat is not None and opt_lng is not None:
                                    prox_score = score_by_proximity(opt_lat, opt_lng, centroid, bounding_radius * 2)
                                else:
                                    prox_score = 0.5
                                
                                # Combine with API rank (first result gets bonus)
                                api_bonus = max(0.0, 0.15 - (i * 0.03))
                                combined = prox_score + api_bonus
                                scored_options.append((combined, opt))
                            
                            # Sort by combined score
                            scored_options.sort(key=lambda x: x[0], reverse=True)
                            
                            # Use highest-scored as primary
                            best_primary = scored_options[0][1]
                            new_alternatives = [opt for _, opt in scored_options[1:]]
                            
                            # Log if we swapped the primary
                            if best_primary.get("name") != primary.get("name"):
                                logger.info(f"Proximity re-rank: swapped '{primary.get('name')}' → '{best_primary.get('name')}' (closer to cluster)")
                            
                            primary = best_primary
                            alternatives = new_alternatives
                        
                        all_candidates.append({
                            "name": primary["name"],
                            "description": primary.get("description"),
                            "confidence": primary.get("confidence", 0.8),
                            "google_place_id": primary["google_place_id"],
                            "lat": primary["lat"],
                            "lng": primary["lng"],
                            "address": primary.get("address"),
                            "rating": primary.get("rating"),
                            "opening_hours": primary.get("opening_hours"),
                            "photo_url": primary.get("photo_url"),
                            # Include alternatives for disambiguation
                            "alternatives": alternatives,
                            "original_query": result.get("original_query")
                        })
                
            except asyncio.TimeoutError:
                logger.warning("Geocoding phase timed out, proceeding with partial results")
        
        # Mark as completed - include failed image feedback
        total_time = time.time() - start_time
        logger.info(f"Processing complete: {len(all_candidates)} candidates, {len(failed_images)} failed, {len(duplicates_merged)} duplicates in {total_time:.1f}s")
        
        job.status = "completed"
        job.progress = 1.0
        # Store candidates, failures, and duplicate info
        job.candidates = {
            "locations": all_candidates,
            "failed_images": failed_images,
            "duplicates_merged": duplicates_merged,  # Track duplicates for user notification
            "stats": {
                "total_images": len(image_bytes_list),
                "successful_images": len(image_bytes_list) - len(failed_images),
                "failed_count": len(failed_images),
                "locations_found": len(all_candidates),
                "duplicates_count": len(duplicates_merged),
                "processing_time_seconds": round(total_time, 1)
            }
        }
        db.commit()
        
    except Exception as e:
        logger.error(f"Background job {job_id} failed: {e}")
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = str(e)
            db.commit()


@router.post("/trip/upload", response_model=AnalysisJobResponse)
async def upload_images(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload images for analysis."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )
    
    if len(files) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50 images allowed"
        )
    
    # Create analysis job
    job = AnalysisJob(
        user_id=current_user.id,
        status="processing",
        total_images=len(files)
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Read all files into memory
    image_bytes_list = []
    for file in files:
        content = await file.read()
        image_bytes_list.append(content)
    
    # Start background processing
    background_tasks.add_task(process_images_background, job.id, image_bytes_list, db)
    
    return AnalysisJobResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        total_images=job.total_images,
        processed_images=job.processed_images
    )


@router.get("/trip/{job_id}/status", response_model=AnalysisJobResponse)
async def get_job_status(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get status of an analysis job."""
    job = db.query(AnalysisJob).filter(
        AnalysisJob.id == job_id,
        AnalysisJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    return AnalysisJobResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        total_images=job.total_images,
        processed_images=job.processed_images,
        error_message=job.error_message
    )


@router.get("/trip/{job_id}/candidates", response_model=AnalysisJobComplete)
async def get_candidates(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get candidate locations from completed analysis."""
    job = db.query(AnalysisJob).filter(
        AnalysisJob.id == job_id,
        AnalysisJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not completed yet. Current status: {job.status}"
        )
    
    # Handle both old format (list) and new format (dict with locations/failed_images)
    candidates_data = job.candidates
    if isinstance(candidates_data, list):
        # Old format - just a list of candidates
        return AnalysisJobComplete(
            job_id=job.id,
            status=job.status,
            candidates=candidates_data,
            failed_images=[],
            duplicates_merged=[],
            stats=None
        )
    else:
        # New format with locations, failed_images, duplicates, and stats
        return AnalysisJobComplete(
            job_id=job.id,
            status=job.status,
            candidates=candidates_data.get("locations", []),
            failed_images=candidates_data.get("failed_images", []),
            duplicates_merged=candidates_data.get("duplicates_merged", []),
            stats=candidates_data.get("stats")
        )


@router.post("/trip/{job_id}/confirm", response_model=TripResponse)
async def confirm_waypoints(
    job_id: UUID,
    waypoints: List[WaypointConfirmation],
    trip_name: str = "My Trip",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Confirm waypoints and create a trip."""
    # Verify job exists and belongs to user
    job = db.query(AnalysisJob).filter(
        AnalysisJob.id == job_id,
        AnalysisJob.user_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    
    # Create trip
    trip = Trip(
        user_id=current_user.id,
        name=trip_name,
        status=TripStatus.DRAFT
    )
    db.add(trip)
    db.flush()
    
    # Create waypoints
    for wp_data in waypoints:
        waypoint = Waypoint(
            trip_id=trip.id,
            name=wp_data.name,
            google_place_id=wp_data.google_place_id,
            lat=wp_data.lat,
            lng=wp_data.lng,
            estimated_stay_duration=wp_data.estimated_stay_duration
        )
        db.add(waypoint)
    
    db.commit()
    db.refresh(trip)
    
    return trip


@router.post("/trip/optimize", response_model=OptimizationResponse)
async def optimize_trip(
    request: OptimizationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Optimize trip route using TSP solver with walking or transit."""
    # Get trip
    trip = db.query(Trip).filter(
        Trip.id == request.trip_id,
        Trip.user_id == current_user.id
    ).first()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    # Get waypoints
    waypoints = db.query(Waypoint).filter(Waypoint.trip_id == trip.id).all()
    
    if len(waypoints) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 waypoints required for optimization"
        )
    
    travel_mode = request.constraints.travel_mode
    logger.info(f"Optimizing trip {trip.id} with {len(waypoints)} waypoints using {travel_mode} mode")
    logger.info(f"Start location: lat={request.constraints.start_location.lat}, lng={request.constraints.start_location.lng}")
    logger.info(f"Waypoints: {[f'{wp.name} ({wp.lat:.4f},{wp.lng:.4f})' for wp in waypoints]}")
    
    try:
        # Get distance matrix with transit details
        matrix_result = distance_matrix_service.get_distance_matrix(
            waypoints,
            request.constraints.start_location,
            mode=travel_mode
        )
        
        distance_matrix = matrix_result["matrix"]
        transit_details = matrix_result.get("transit_details", {})
        
        # Log distance matrix summary for debugging
        if distance_matrix:
            logger.info(f"Distance matrix: {len(distance_matrix)}×{len(distance_matrix[0])}")
            # Log distances from start to each waypoint
            for i, wp in enumerate(waypoints):
                logger.info(f"  Start → {wp.name}: {distance_matrix[0][i+1]}s")
        
        # Optimize route (with optional fixed end waypoint)
        optimized_waypoints = route_optimizer.solve_tsp(
            waypoints,
            distance_matrix,
            request.constraints,
            end_waypoint_id=request.constraints.end_waypoint_id
        )
        
        if not optimized_waypoints:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Route optimization failed - could not find valid route"
            )
        
        # Update trip
        trip.status = TripStatus.OPTIMIZED
        trip.start_location_lat = request.constraints.start_location.lat
        trip.start_location_lng = request.constraints.start_location.lng
        trip.start_time = request.constraints.start_time
        trip.end_time = request.constraints.end_time
        trip.walking_speed = request.constraints.walking_speed
        
        # Calculate total time (stay + travel)
        total_minutes = 0
        for wp in optimized_waypoints:
            if wp.arrival_time and wp.departure_time:
                duration = (wp.departure_time - wp.arrival_time).total_seconds() / 60
                total_minutes += duration
        
        trip.total_time_minutes = int(total_minutes)
        db.commit()
        
        # Build response with transit info
        optimized_data = []
        route_segments = []
        
        for i, wp in enumerate(optimized_waypoints):
            optimized_data.append({
                "order": wp.order,
                "name": wp.name,
                "arrival_time": wp.arrival_time.strftime("%H:%M") if wp.arrival_time else "",
                "departure_time": wp.departure_time.strftime("%H:%M") if wp.departure_time else "",
                "lat": wp.lat,
                "lng": wp.lng,
                "google_place_id": wp.google_place_id,
                "address": getattr(wp, 'address', None)
            })
            
            # Add route segment between waypoints
            if i < len(optimized_waypoints) - 1:
                # Find matrix indices for this segment
                from_idx = waypoints.index(wp) + 1  # +1 for start location
                to_idx = waypoints.index(optimized_waypoints[i + 1]) + 1
                
                segment = {
                    "from_order": wp.order,
                    "to_order": optimized_waypoints[i + 1].order,
                    "travel_mode": travel_mode,
                    "duration_seconds": distance_matrix[from_idx][to_idx],
                    "transit_steps": transit_details.get(f"{from_idx}-{to_idx}")
                }
                route_segments.append(segment)
        
        # Generate Google Maps URL
        google_maps_url = maps_link_service.generate_link(optimized_waypoints)
        
        logger.info(f"Optimization complete: {len(optimized_waypoints)} waypoints, {total_minutes} min total")
        
        return OptimizationResponse(
            trip_id=trip.id,
            total_time_minutes=trip.total_time_minutes,
            travel_mode=travel_mode,
            waypoints=optimized_data,
            route_segments=route_segments if transit_details else None,
            google_maps_url=google_maps_url
        )
        
    except Exception as e:
        logger.error(f"Optimization failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Route optimization failed: {str(e)}"
        )


@router.get("/maps/link/{trip_id}", response_model=MapsLinkResponse)
async def get_maps_link(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate Google Maps navigation link."""
    # Get trip with waypoints
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    waypoints = db.query(Waypoint).filter(
        Waypoint.trip_id == trip_id
    ).order_by(Waypoint.order).all()
    
    if not waypoints:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No waypoints in trip"
        )
    
    # Generate link
    url = maps_link_service.generate_link(waypoints)
    
    return MapsLinkResponse(
        url=url,
        waypoint_count=len(waypoints),
        is_split=len(waypoints) > settings.MAX_WAYPOINTS_IN_URL
    )


@router.get("/trips", response_model=List[TripResponse])
async def list_trips(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all trips for current user."""
    trips = db.query(Trip).filter(Trip.user_id == current_user.id).all()
    return trips


@router.get("/trip/{trip_id}", response_model=TripResponse)
async def get_trip(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get trip details."""
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    return trip


@router.delete("/trip/{trip_id}")
async def delete_trip(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a trip and its associated waypoints."""
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    db.delete(trip)  # Cascade deletes waypoints
    db.commit()
    
    return {"message": "Trip deleted successfully"}


@router.get("/trip/{trip_id}/route")
async def get_trip_route(
    trip_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get walking route polylines for map display."""
    from ..models.schemas import LatLng
    
    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.user_id == current_user.id
    ).first()
    
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found"
        )
    
    waypoints = db.query(Waypoint).filter(
        Waypoint.trip_id == trip_id
    ).order_by(Waypoint.order).all()
    
    if len(waypoints) < 2:
        logger.warning(f"Trip {trip_id} has less than 2 waypoints, cannot generate route")
        return {
            "segments": [],
            "total_duration_seconds": 0,
            "total_distance_meters": 0
        }
    
    logger.info(f"Generating walking route for trip {trip_id} with {len(waypoints)} waypoints")
    
    # Convert waypoints to LatLng
    waypoint_coords = [LatLng(lat=wp.lat, lng=wp.lng) for wp in waypoints]
    
    # Get walking route with polylines
    try:
        route_data = distance_matrix_service.get_walking_route_polyline(waypoint_coords)
        logger.info(f"Route generated: {len(route_data['segments'])} segments, {route_data['total_duration_seconds']}s total")
        
        # Add waypoint names to segments
        for seg in route_data["segments"]:
            seg["from_name"] = waypoints[seg["from_index"]].name
            seg["to_name"] = waypoints[seg["to_index"]].name
        
        return route_data
    except Exception as e:
        logger.error(f"Failed to generate route for trip {trip_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate route: {str(e)}"
        )
