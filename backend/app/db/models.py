from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Enum as SQLEnum, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from ..core.database import Base


class TripStatus(str, enum.Enum):
    """Trip status enumeration."""
    DRAFT = "draft"
    OPTIMIZED = "optimized"
    ARCHIVED = "archived"


class User(Base):
    """User model for authentication and preferences."""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    preferences = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    trips = relationship("Trip", back_populates="user", cascade="all, delete-orphan")


class Trip(Base):
    """Trip model representing a complete itinerary."""
    __tablename__ = "trips"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    date = Column(DateTime(timezone=True))
    status = Column(SQLEnum(TripStatus), default=TripStatus.DRAFT, nullable=False)
    
    # Constraints and metadata
    start_location_lat = Column(Float)
    start_location_lng = Column(Float)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    walking_speed = Column(String(20))  # slow, moderate, fast
    
    # Optimization results
    total_time_minutes = Column(Integer)
    optimized_at = Column(DateTime(timezone=True))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="trips")
    waypoints = relationship("Waypoint", back_populates="trip", cascade="all, delete-orphan", order_by="Waypoint.order")


class Waypoint(Base):
    """Waypoint model representing a location in a trip."""
    __tablename__ = "waypoints"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("trips.id"), nullable=False)
    
    # Location data
    google_place_id = Column(String(255), index=True)
    name = Column(String(255), nullable=False)
    address = Column(Text)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    
    # Media
    media_url = Column(Text)  # URL to user's uploaded image (temporary)
    thumbnail_url = Column(Text)
    
    # Visit details
    estimated_stay_duration = Column(Integer)  # Minutes
    order = Column(Integer)  # Sequence in optimized route
    arrival_time = Column(DateTime(timezone=True))
    departure_time = Column(DateTime(timezone=True))
    
    # Place details
    opening_hours = Column(JSONB)  # Store as JSON
    confidence_score = Column(Float)  # AI detection confidence
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    trip = relationship("Trip", back_populates="waypoints")


class AnalysisJob(Base):
    """Job tracking for async image analysis."""
    __tablename__ = "analysis_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(50), default="processing")  # processing, completed, failed
    progress = Column(Float, default=0.0)
    error_message = Column(Text)
    
    # Results
    total_images = Column(Integer, default=0)
    processed_images = Column(Integer, default=0)
    candidates = Column(JSONB, default=[])  # Store candidate locations
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
