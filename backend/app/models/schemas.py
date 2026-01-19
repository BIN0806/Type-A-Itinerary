from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Literal
from datetime import datetime
from uuid import UUID


# Authentication Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: str
    preferences: dict = {}
    ticket_balance: int = 1
    created_at: datetime
    
    class Config:
        from_attributes = True


# Location Schemas
class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class CandidateLocation(BaseModel):
    name: str
    description: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    opening_hours: Optional[dict] = None


# Trip Constraints
class TripConstraints(BaseModel):
    start_location: LatLng  # User drops a pin on map
    start_time: datetime
    end_time: datetime
    walking_speed: Literal["slow", "moderate", "fast"] = "moderate"
    travel_mode: Literal["walking", "transit"] = "walking"  # New: transit support
    end_waypoint_id: Optional[UUID] = None  # Optional: which waypoint to end at
    
    @validator("end_time")
    def end_after_start(cls, v, values):
        if "start_time" in values and v <= values["start_time"]:
            raise ValueError("end_time must be after start_time")
        return v
    
    @property
    def walking_speed_mps(self) -> float:
        """Convert walking speed to meters per second."""
        speeds = {"slow": 1.2, "moderate": 1.4, "fast": 1.6}
        return speeds[self.walking_speed]


# Waypoint Schemas
class WaypointBase(BaseModel):
    name: str
    google_place_id: Optional[str] = None
    lat: float
    lng: float
    address: Optional[str] = None
    estimated_stay_duration: int = Field(default=60, ge=0)  # Minutes


class WaypointCreate(WaypointBase):
    media_url: Optional[str] = None
    confidence_score: Optional[float] = None


class WaypointConfirmation(BaseModel):
    google_place_id: Optional[str] = None
    name: str
    lat: float
    lng: float
    estimated_stay_duration: int = 60


class WaypointResponse(WaypointBase):
    id: UUID
    trip_id: UUID
    order: Optional[int] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    
    class Config:
        from_attributes = True


# Trip Schemas
class TripCreate(BaseModel):
    name: str
    date: Optional[datetime] = None


class TripResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    date: Optional[datetime] = None
    status: str
    total_time_minutes: Optional[int] = None
    waypoints: List[WaypointResponse] = []
    created_at: datetime
    
    class Config:
        from_attributes = True


# Analysis Job Schemas
class AnalysisJobResponse(BaseModel):
    job_id: UUID
    status: str
    progress: float
    total_images: int
    processed_images: int
    error_message: Optional[str] = None


class FailedImageInfo(BaseModel):
    index: int
    reason: str


class ProcessingStats(BaseModel):
    total_images: int
    successful_images: int
    failed_count: int
    locations_found: int
    duplicates_count: int = 0
    processing_time_seconds: float


class DuplicateMergeInfo(BaseModel):
    original: str
    merged_into: str


class AnalysisJobComplete(BaseModel):
    job_id: UUID
    status: str
    candidates: List[dict]  # Location candidates with alternatives
    failed_images: List[FailedImageInfo] = []
    duplicates_merged: List[DuplicateMergeInfo] = []  # Track merged duplicates
    stats: Optional[ProcessingStats] = None


# Optimization Schemas
class OptimizationRequest(BaseModel):
    trip_id: UUID
    constraints: TripConstraints


class TransitStep(BaseModel):
    type: str  # "SUBWAY", "BUS", "WALKING", etc.
    line_name: str
    line_color: str
    text_color: str
    departure_stop: str
    arrival_stop: str
    num_stops: int
    duration_seconds: int
    headsign: str


class RouteSegment(BaseModel):
    from_order: int
    to_order: int
    travel_mode: str
    duration_seconds: int
    transit_steps: Optional[List[TransitStep]] = None


class OptimizedWaypoint(BaseModel):
    order: int
    name: str
    arrival_time: str
    departure_time: str
    lat: float
    lng: float
    google_place_id: Optional[str] = None
    address: Optional[str] = None


class OptimizationResponse(BaseModel):
    trip_id: UUID
    total_time_minutes: int
    travel_mode: str = "walking"
    waypoints: List[OptimizedWaypoint]
    route_segments: Optional[List[RouteSegment]] = None  # Transit details between stops
    google_maps_url: Optional[str] = None  # Direct link to open in Google Maps


# Maps Link Schema
class MapsLinkResponse(BaseModel):
    url: str
    waypoint_count: int
    is_split: bool = False
    part_number: Optional[int] = None
    total_parts: Optional[int] = None


# Ticket/Credits Schemas
class TicketBalanceResponse(BaseModel):
    balance: int


class TicketPurchaseRequest(BaseModel):
    package: Literal["single", "bundle"]  # single = 1 ticket/$2, bundle = 3 tickets/$5


class TicketPurchaseResponse(BaseModel):
    success: bool
    tickets_added: int
    new_balance: int
    message: str

