from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import logging

from ..core.database import get_db
from ..core.auth import get_current_user
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


async def process_images_background(job_id: UUID, image_bytes_list: List[bytes], db: Session):
    """Background task to process uploaded images."""
    try:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return
        
        # Update job status
        job.total_images = len(image_bytes_list)
        job.processed_images = 0
        db.commit()
        
        # Analyze images
        all_candidates = []
        for i, image_bytes in enumerate(image_bytes_list):
            try:
                # Vision analysis
                candidates = vision_service.analyze_image(image_bytes)
                
                # Geocode each candidate
                for candidate in candidates:
                    enriched = geocoding_service.geocode_location(candidate)
                    if enriched:
                        all_candidates.append({
                            "name": enriched.name,
                            "description": enriched.description,
                            "confidence": enriched.confidence,
                            "google_place_id": enriched.google_place_id,
                            "lat": enriched.lat,
                            "lng": enriched.lng,
                            "address": enriched.address,
                            "opening_hours": enriched.opening_hours
                        })
                
                # Update progress
                job.processed_images = i + 1
                job.progress = (i + 1) / len(image_bytes_list)
                db.commit()
                
            except Exception as e:
                logger.error(f"Error processing image {i}: {e}")
                continue
        
        # Mark as completed
        job.status = "completed"
        job.progress = 1.0
        job.candidates = all_candidates
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
    
    return AnalysisJobComplete(
        job_id=job.id,
        status=job.status,
        candidates=job.candidates
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
    """Optimize trip route using TSP solver."""
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
    
    # Get distance matrix
    distance_matrix = distance_matrix_service.get_distance_matrix(
        waypoints,
        request.constraints.start_location
    )
    
    # Optimize route (with optional fixed end waypoint)
    optimized_waypoints = route_optimizer.solve_tsp(
        waypoints,
        distance_matrix,
        request.constraints,
        end_waypoint_id=request.constraints.end_waypoint_id
    )
    
    # Update trip
    trip.status = TripStatus.OPTIMIZED
    trip.start_location_lat = request.constraints.start_location.lat
    trip.start_location_lng = request.constraints.start_location.lng
    trip.start_time = request.constraints.start_time
    trip.end_time = request.constraints.end_time
    trip.walking_speed = request.constraints.walking_speed
    
    # Calculate total time
    total_minutes = 0
    for wp in optimized_waypoints:
        if wp.arrival_time and wp.departure_time:
            duration = (wp.departure_time - wp.arrival_time).total_seconds() / 60
            total_minutes += duration
    
    trip.total_time_minutes = int(total_minutes)
    db.commit()
    
    # Build response
    optimized_data = []
    for wp in optimized_waypoints:
        optimized_data.append({
            "order": wp.order,
            "name": wp.name,
            "arrival_time": wp.arrival_time.strftime("%H:%M") if wp.arrival_time else "",
            "departure_time": wp.departure_time.strftime("%H:%M") if wp.departure_time else "",
            "lat": wp.lat,
            "lng": wp.lng,
            "google_place_id": wp.google_place_id
        })
    
    return OptimizationResponse(
        trip_id=trip.id,
        total_time_minutes=trip.total_time_minutes,
        waypoints=optimized_data
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
