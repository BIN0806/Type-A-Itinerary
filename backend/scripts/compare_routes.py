#!/usr/bin/env python3
"""
Script to compare two route options and calculate total walking time/distance.
This helps verify if the TSP solver is finding the optimal route.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.distance_matrix_service import distance_matrix_service
from app.models.schemas import LatLng

# Location coordinates from the optimization response
LOCATIONS = {
    "Jin Mei Dumpling": LatLng(lat=40.7129498, lng=-73.9965632),
    "230 Fifth Rooftop Bar": LatLng(lat=40.7441081, lng=-73.9888201),
    "Liberty Bagels Midtown": LatLng(lat=40.7524936, lng=-73.99252969999999),
    "Zibetto Espresso Bar": LatLng(lat=40.7638755, lng=-73.97776619999999),
    "Levain Bakery": LatLng(lat=40.7799173, lng=-73.980349),
}

# Current route (from optimization response)
CURRENT_ROUTE = [
    "Levain Bakery",
    "Zibetto Espresso Bar",
    "230 Fifth Rooftop Bar",
    "Liberty Bagels Midtown",
    "Jin Mei Dumpling",
]

# Suggested route (user's intuition)
SUGGESTED_ROUTE = [
    "Jin Mei Dumpling",
    "230 Fifth Rooftop Bar",
    "Liberty Bagels Midtown",
    "Zibetto Espresso Bar",
    "Levain Bakery",
]

def calculate_route_total(route_names):
    """Calculate total walking time and distance for a route."""
    total_time = 0
    total_distance = 0
    segments = []
    
    print(f"\n{'='*60}")
    print(f"Calculating route: {' → '.join(route_names)}")
    print(f"{'='*60}")
    
    for i in range(len(route_names) - 1):
        from_name = route_names[i]
        to_name = route_names[i + 1]
        
        from_loc = LOCATIONS[from_name]
        to_loc = LOCATIONS[to_name]
        
        try:
            distance_info = distance_matrix_service._get_distance(from_loc, to_loc, mode="walking")
            duration = distance_info["duration_seconds"]
            distance = distance_info["distance_meters"]
            
            total_time += duration
            total_distance += distance
            
            segments.append({
                "from": from_name,
                "to": to_name,
                "duration": duration,
                "distance": distance
            })
            
            print(f"  {from_name} → {to_name}")
            print(f"    Time: {duration // 60} min {duration % 60} sec ({duration} sec)")
            print(f"    Distance: {distance / 1000:.2f} km ({distance} m)")
            
        except Exception as e:
            print(f"  ERROR calculating {from_name} → {to_name}: {e}")
            return None
    
    return {
        "total_time_seconds": total_time,
        "total_distance_meters": total_distance,
        "segments": segments
    }

def main():
    print("Route Comparison Tool")
    print("=" * 60)
    
    # Calculate current route
    current_result = calculate_route_total(CURRENT_ROUTE)
    if not current_result:
        print("Failed to calculate current route")
        return
    
    # Calculate suggested route
    suggested_result = calculate_route_total(SUGGESTED_ROUTE)
    if not suggested_result:
        print("Failed to calculate suggested route")
        return
    
    # Compare
    print(f"\n{'='*60}")
    print("COMPARISON")
    print(f"{'='*60}")
    
    current_time = current_result["total_time_seconds"]
    suggested_time = suggested_result["total_time_seconds"]
    time_diff = suggested_time - current_time
    
    current_dist = current_result["total_distance_meters"]
    suggested_dist = suggested_result["total_distance_meters"]
    dist_diff = suggested_dist - current_dist
    
    print(f"\nCurrent Route (Optimizer's Choice):")
    print(f"  Total Time: {current_time // 60} min {current_time % 60} sec ({current_time} sec)")
    print(f"  Total Distance: {current_dist / 1000:.2f} km ({current_dist} m)")
    
    print(f"\nSuggested Route (User's Intuition):")
    print(f"  Total Time: {suggested_time // 60} min {suggested_time % 60} sec ({suggested_time} sec)")
    print(f"  Total Distance: {suggested_dist / 1000:.2f} km ({suggested_dist} m)")
    
    print(f"\nDifference:")
    if time_diff < 0:
        print(f"  ⚠️  Suggested route is {abs(time_diff) // 60} min {abs(time_diff) % 60} sec FASTER")
        print(f"  ⚠️  Suggested route is {abs(dist_diff) / 1000:.2f} km SHORTER")
        print(f"\n  ❌ TSP SOLVER CHOSE SUBOPTIMAL ROUTE!")
    elif time_diff > 0:
        print(f"  ✅ Current route is {time_diff // 60} min {time_diff % 60} sec FASTER")
        print(f"  ✅ Current route is {dist_diff / 1000:.2f} km SHORTER")
        print(f"\n  ✅ TSP SOLVER CHOSE OPTIMAL ROUTE!")
    else:
        print(f"  ⚖️  Routes are equivalent")
    
    print(f"\n{'='*60}")

if __name__ == "__main__":
    main()
