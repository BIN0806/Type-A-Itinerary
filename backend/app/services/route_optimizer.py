import logging
from typing import List, Optional
from datetime import timedelta
from uuid import UUID
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

from ..db.models import Waypoint
from ..models.schemas import TripConstraints

logger = logging.getLogger(__name__)


class RouteOptimizer:
    """Service for optimizing trip routes using OR-Tools TSP solver."""
    
    def solve_tsp(
        self,
        waypoints: List[Waypoint],
        distance_matrix: List[List[int]],
        constraints: TripConstraints,
        end_waypoint_id: Optional[UUID] = None
    ) -> List[Waypoint]:
        """
        Solve TSP with time windows to find optimal route.
        
        The route starts from a user-defined pin location (index 0 in matrix)
        and optionally ends at a specific waypoint.
        
        Args:
            waypoints: List of waypoints to visit
            distance_matrix: N×N matrix of travel times (seconds)
                             Index 0 = start location (user's pin)
                             Index 1..N = waypoints
            constraints: Trip constraints including start/end times
            end_waypoint_id: Optional UUID of waypoint to end at
            
        Returns:
            Ordered list of waypoints with arrival/departure times
        """
        if len(waypoints) == 0:
            return []
        
        if len(waypoints) == 1:
            # Single waypoint - just set times
            wp = waypoints[0]
            wp.order = 1
            wp.arrival_time = constraints.start_time
            wp.departure_time = constraints.start_time + timedelta(
                minutes=wp.estimated_stay_duration or 60
            )
            return [wp]
        
        # Find end waypoint index if specified
        end_node_index = None
        if end_waypoint_id:
            for i, wp in enumerate(waypoints):
                if wp.id == end_waypoint_id:
                    end_node_index = i + 1  # +1 because 0 is start location
                    logger.info(f"End waypoint found at index {end_node_index}: {wp.name}")
                    break
        
        # Create routing model with fixed start (and optionally fixed end)
        num_locations = len(distance_matrix)
        
        if end_node_index is not None:
            # Fixed start AND fixed end
            # Use dummy depot at index 0, route from 0 -> ... -> end_node
            manager = pywrapcp.RoutingIndexManager(
                num_locations,
                1,  # One vehicle (tourist)
                [0],  # Start at index 0 (user's pin location)
                [end_node_index]  # End at specified waypoint
            )
            logger.info(f"TSP with fixed start (0) and fixed end ({end_node_index})")
        else:
            # Fixed start, free end (original behavior)
            manager = pywrapcp.RoutingIndexManager(
                num_locations,
                1,  # One vehicle (tourist)
                0   # Start at index 0 (user's pin location)
            )
            logger.info("TSP with fixed start (0), free end")
        
        routing = pywrapcp.RoutingModel(manager)
        
        # Create distance callback
        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return distance_matrix[from_node][to_node]
        
        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        
        # Add time dimension
        time_dimension_name = "Time"
        total_available_seconds = int(
            (constraints.end_time - constraints.start_time).total_seconds()
        )
        
        routing.AddDimension(
            transit_callback_index,
            total_available_seconds,  # Allow waiting time
            total_available_seconds,  # Maximum time per vehicle
            False,  # Don't force start cumul to zero
            time_dimension_name
        )
        
        time_dimension = routing.GetDimensionOrDie(time_dimension_name)
        
        # Add time windows for waypoints
        for i, wp in enumerate(waypoints):
            index = manager.NodeToIndex(i + 1)  # +1 because 0 is start location
            
            # For simplicity, allow visiting anytime during the day
            # In production, this would check opening_hours
            time_dimension.CumulVar(index).SetRange(0, total_available_seconds)
            
            # Add stay duration
            stay_minutes = wp.estimated_stay_duration or 60
            stay_seconds = stay_minutes * 60
            time_dimension.SlackVar(index).SetRange(stay_seconds, stay_seconds)
        
        # Set search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = 5
        
        # Solve
        logger.info(f"Solving TSP for {len(waypoints)} waypoints")
        solution = routing.SolveWithParameters(search_parameters)
        
        if not solution:
            logger.warning("No solution found, using greedy fallback")
            return self._greedy_fallback(waypoints, distance_matrix, constraints, end_waypoint_id)
        
        # Extract solution
        ordered_waypoints = []
        index = routing.Start(0)
        route_order = 1
        current_time = constraints.start_time
        
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            
            # Skip start location (node 0)
            if node > 0:
                wp = waypoints[node - 1]
                wp.order = route_order
                wp.arrival_time = current_time
                wp.departure_time = current_time + timedelta(
                    minutes=wp.estimated_stay_duration or 60
                )
                ordered_waypoints.append(wp)
                
                current_time = wp.departure_time
                route_order += 1
            
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            
            # Add travel time
            if not routing.IsEnd(index):
                from_node = manager.IndexToNode(previous_index)
                to_node = manager.IndexToNode(index)
                travel_seconds = distance_matrix[from_node][to_node]
                current_time += timedelta(seconds=travel_seconds)
        
        # Handle the end node (it's not included in the loop if we have fixed end)
        if end_node_index is not None:
            end_wp = waypoints[end_node_index - 1]
            if end_wp not in ordered_waypoints:
                # Add travel time from last waypoint to end
                if ordered_waypoints:
                    last_node = waypoints.index(ordered_waypoints[-1]) + 1
                    travel_seconds = distance_matrix[last_node][end_node_index]
                    current_time += timedelta(seconds=travel_seconds)
                
                end_wp.order = route_order
                end_wp.arrival_time = current_time
                end_wp.departure_time = current_time + timedelta(
                    minutes=end_wp.estimated_stay_duration or 60
                )
                ordered_waypoints.append(end_wp)
        
        logger.info(f"TSP solution found with {len(ordered_waypoints)} waypoints")
        return ordered_waypoints
    
    def _greedy_fallback(
        self,
        waypoints: List[Waypoint],
        distance_matrix: List[List[int]],
        constraints: TripConstraints,
        end_waypoint_id: Optional[UUID] = None
    ) -> List[Waypoint]:
        """
        Greedy nearest-neighbor fallback if OR-Tools fails.
        Handles optional fixed end waypoint.
        
        Args:
            waypoints: List of waypoints
            distance_matrix: Distance matrix
            constraints: Trip constraints
            end_waypoint_id: Optional UUID of waypoint to end at
            
        Returns:
            Ordered waypoints
        """
        logger.info("Using greedy nearest-neighbor algorithm")
        
        # Find end waypoint index if specified
        end_idx = None
        if end_waypoint_id:
            for i, wp in enumerate(waypoints):
                if wp.id == end_waypoint_id:
                    end_idx = i
                    break
        
        visited = [False] * len(waypoints)
        ordered = []
        current_node = 0  # Start location
        current_time = constraints.start_time
        
        # Reserve the end waypoint for last
        if end_idx is not None:
            visited[end_idx] = True  # Mark as visited so we skip it until the end
        
        num_to_visit = len(waypoints) - (1 if end_idx is not None else 0)
        
        for order in range(1, num_to_visit + 1):
            # Find nearest unvisited waypoint
            best_idx = -1
            best_distance = float('inf')
            
            for i, wp in enumerate(waypoints):
                if not visited[i]:
                    distance = distance_matrix[current_node][i + 1]
                    if distance < best_distance:
                        best_distance = distance
                        best_idx = i
            
            if best_idx == -1:
                break
            
            # Visit waypoint
            visited[best_idx] = True
            wp = waypoints[best_idx]
            
            # Add travel time
            current_time += timedelta(seconds=best_distance)
            
            # Set waypoint times
            wp.order = order
            wp.arrival_time = current_time
            wp.departure_time = current_time + timedelta(
                minutes=wp.estimated_stay_duration or 60
            )
            ordered.append(wp)
            
            current_time = wp.departure_time
            current_node = best_idx + 1
        
        # Add end waypoint last if specified
        if end_idx is not None:
            end_wp = waypoints[end_idx]
            travel_seconds = distance_matrix[current_node][end_idx + 1]
            current_time += timedelta(seconds=travel_seconds)
            
            end_wp.order = len(ordered) + 1
            end_wp.arrival_time = current_time
            end_wp.departure_time = current_time + timedelta(
                minutes=end_wp.estimated_stay_duration or 60
            )
            ordered.append(end_wp)
        
        return ordered


# Singleton instance
route_optimizer = RouteOptimizer()
