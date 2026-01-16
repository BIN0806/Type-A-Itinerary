import pytest
from datetime import datetime, timedelta
from app.services.route_optimizer import route_optimizer
from app.db.models import Waypoint
from app.models.schemas import TripConstraints, LatLng


def test_tsp_single_waypoint():
    """Test TSP with a single waypoint."""
    waypoint = Waypoint(
        name="Test Location",
        lat=35.6762,
        lng=139.6503,
        estimated_stay_duration=60
    )
    
    distance_matrix = [
        [0, 600],
        [600, 0]
    ]
    
    constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="moderate"
    )
    
    result = route_optimizer.solve_tsp([waypoint], distance_matrix, constraints)
    
    assert len(result) == 1
    assert result[0].order == 1
    assert result[0].arrival_time is not None
    assert result[0].departure_time is not None


def test_tsp_multiple_waypoints():
    """Test TSP with multiple waypoints."""
    waypoints = [
        Waypoint(name="Location A", lat=35.6762, lng=139.6503, estimated_stay_duration=60),
        Waypoint(name="Location B", lat=35.6800, lng=139.6600, estimated_stay_duration=60),
        Waypoint(name="Location C", lat=35.6700, lng=139.6400, estimated_stay_duration=60),
    ]
    
    # Simple distance matrix (seconds)
    distance_matrix = [
        [0,    600,  900,  1200],
        [600,  0,    800,  500],
        [900,  800,  0,    700],
        [1200, 500,  700,  0]
    ]
    
    constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="moderate"
    )
    
    result = route_optimizer.solve_tsp(waypoints, distance_matrix, constraints)
    
    assert len(result) == 3
    assert all(wp.order is not None for wp in result)
    assert all(wp.arrival_time is not None for wp in result)
    assert all(wp.departure_time is not None for wp in result)
    
    # Check order is sequential
    orders = [wp.order for wp in result]
    assert orders == sorted(orders)


def test_tsp_empty_waypoints():
    """Test TSP with no waypoints."""
    distance_matrix = [[0]]
    
    constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="moderate"
    )
    
    result = route_optimizer.solve_tsp([], distance_matrix, constraints)
    
    assert len(result) == 0


def test_walking_speed_conversion():
    """Test walking speed conversion."""
    slow_constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="slow"
    )
    
    moderate_constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="moderate"
    )
    
    fast_constraints = TripConstraints(
        start_location=LatLng(lat=35.6700, lng=139.6500),
        start_time=datetime(2024, 1, 1, 9, 0),
        end_time=datetime(2024, 1, 1, 18, 0),
        walking_speed="fast"
    )
    
    assert slow_constraints.walking_speed_mps == 1.2
    assert moderate_constraints.walking_speed_mps == 1.4
    assert fast_constraints.walking_speed_mps == 1.6
