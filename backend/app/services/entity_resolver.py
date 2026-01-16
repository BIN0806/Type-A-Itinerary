"""Entity resolution service for deduplicating and merging location candidates."""
import logging
from typing import List, Optional
from ..models.schemas import CandidateLocation
from ..utils.text_utils import calculate_similarity, normalize_text
from ..utils.geo_utils import are_locations_nearby, get_midpoint

logger = logging.getLogger(__name__)


class EntityResolver:
    """Service for resolving duplicate entities and merging location candidates."""
    
    def __init__(self, similarity_threshold: float = 0.85, geo_radius_meters: float = 50.0):
        """
        Initialize entity resolver.
        
        Args:
            similarity_threshold: Minimum text similarity for merging (default 0.85)
            geo_radius_meters: Maximum distance for geo-clustering (default 50m)
        """
        self.similarity_threshold = similarity_threshold
        self.geo_radius_meters = geo_radius_meters
    
    def resolve_duplicates(
        self,
        candidates: List[CandidateLocation],
        track_duplicates: bool = True
    ) -> dict:
        """
        Resolve duplicate entities through text similarity and geocoding.
        
        Args:
            candidates: List of candidate locations
            track_duplicates: Whether to return duplicate info
            
        Returns:
            Dict with 'candidates' (deduplicated list) and 'duplicates_merged' (list of merged names)
        """
        if not candidates:
            return {"candidates": [], "duplicates_merged": []}
        
        original_count = len(candidates)
        original_names = [c.name for c in candidates]
        
        # Step 1: Text-based deduplication
        text_merged = self._merge_by_text_similarity(candidates)
        logger.info(f"Text merging: {len(candidates)} → {len(text_merged)} candidates")
        
        # Step 2: Geo-based clustering (if coordinates available)
        geo_merged = self._merge_by_proximity(text_merged)
        logger.info(f"Geo merging: {len(text_merged)} → {len(geo_merged)} candidates")
        
        # Step 3: Sort by confidence
        geo_merged.sort(key=lambda x: x.confidence, reverse=True)
        
        # Track which names were merged as duplicates
        duplicates_merged = []
        if track_duplicates and len(geo_merged) < original_count:
            final_names = set(c.name.lower() for c in geo_merged)
            for name in original_names:
                if name.lower() not in final_names:
                    # Check if it was merged into another name
                    for final_name in final_names:
                        if calculate_similarity(name.lower(), final_name) > self.similarity_threshold:
                            duplicates_merged.append({
                                "original": name,
                                "merged_into": next(c.name for c in geo_merged if c.name.lower() == final_name)
                            })
                            break
            
            if duplicates_merged:
                logger.info(f"Duplicates merged: {duplicates_merged}")
        
        return {
            "candidates": geo_merged,
            "duplicates_merged": duplicates_merged
        }
    
    def _merge_by_text_similarity(
        self,
        candidates: List[CandidateLocation]
    ) -> List[CandidateLocation]:
        """
        Merge candidates with similar names.
        
        Args:
            candidates: List of candidates
            
        Returns:
            List with text-based duplicates merged
        """
        merged = []
        used_indices = set()
        
        for i, candidate_i in enumerate(candidates):
            if i in used_indices:
                continue
            
            # Start with this candidate
            merged_candidate = CandidateLocation(
                name=candidate_i.name,
                description=candidate_i.description,
                confidence=candidate_i.confidence,
                google_place_id=candidate_i.google_place_id,
                lat=candidate_i.lat,
                lng=candidate_i.lng,
                address=candidate_i.address,
                opening_hours=candidate_i.opening_hours
            )
            
            similar_candidates = [candidate_i]
            used_indices.add(i)
            
            # Find similar candidates
            for j, candidate_j in enumerate(candidates):
                if j in used_indices:
                    continue
                
                similarity = calculate_similarity(candidate_i.name, candidate_j.name)
                
                if similarity >= self.similarity_threshold:
                    similar_candidates.append(candidate_j)
                    used_indices.add(j)
                    logger.info(
                        f"Merging '{candidate_i.name}' and '{candidate_j.name}' "
                        f"(similarity: {similarity:.2f})"
                    )
            
            # Merge similar candidates
            if len(similar_candidates) > 1:
                merged_candidate = self._merge_candidates(similar_candidates)
            
            merged.append(merged_candidate)
        
        return merged
    
    def _merge_by_proximity(
        self,
        candidates: List[CandidateLocation]
    ) -> List[CandidateLocation]:
        """
        Merge candidates that are geographically close.
        
        Args:
            candidates: List of candidates with coordinates
            
        Returns:
            List with geo-based duplicates merged
        """
        # Filter candidates with coordinates
        with_coords = [c for c in candidates if c.lat is not None and c.lng is not None]
        without_coords = [c for c in candidates if c.lat is None or c.lng is None]
        
        if not with_coords:
            return candidates
        
        merged = []
        used_indices = set()
        
        for i, candidate_i in enumerate(with_coords):
            if i in used_indices:
                continue
            
            nearby_candidates = [candidate_i]
            used_indices.add(i)
            
            # Find nearby candidates
            for j, candidate_j in enumerate(with_coords):
                if j in used_indices:
                    continue
                
                if are_locations_nearby(
                    candidate_i.lat, candidate_i.lng,
                    candidate_j.lat, candidate_j.lng,
                    self.geo_radius_meters
                ):
                    nearby_candidates.append(candidate_j)
                    used_indices.add(j)
                    logger.info(
                        f"Geo-clustering '{candidate_i.name}' and '{candidate_j.name}' "
                        f"(within {self.geo_radius_meters}m)"
                    )
            
            # Merge nearby candidates
            if len(nearby_candidates) > 1:
                merged_candidate = self._merge_candidates(nearby_candidates)
            else:
                merged_candidate = candidate_i
            
            merged.append(merged_candidate)
        
        # Add candidates without coordinates
        merged.extend(without_coords)
        
        return merged
    
    def _merge_candidates(
        self,
        candidates: List[CandidateLocation]
    ) -> CandidateLocation:
        """
        Merge multiple candidates into a single entity.
        
        Args:
            candidates: List of candidates to merge
            
        Returns:
            Single merged candidate
        """
        # Use the name with highest confidence
        best_candidate = max(candidates, key=lambda x: x.confidence)
        
        # Aggregate confidence (boost for multiple sources)
        # Formula: average confidence * sqrt(num_sources) / sqrt(num_sources - 1)
        # This gives a boost for multiple sources without going over 1.0
        avg_confidence = sum(c.confidence for c in candidates) / len(candidates)
        boost_factor = min(1.2, 1.0 + (len(candidates) - 1) * 0.1)  # Max 20% boost
        merged_confidence = min(0.98, avg_confidence * boost_factor)
        
        # Average coordinates if multiple available
        coords_list = [(c.lat, c.lng) for c in candidates if c.lat is not None and c.lng is not None]
        if coords_list:
            avg_lat = sum(lat for lat, _ in coords_list) / len(coords_list)
            avg_lng = sum(lng for _, lng in coords_list) / len(coords_list)
        else:
            avg_lat = None
            avg_lng = None
        
        # Combine descriptions
        descriptions = [c.description for c in candidates if c.description]
        combined_description = " | ".join(set(descriptions)) if descriptions else None
        
        # Prefer first place_id found
        place_id = next((c.google_place_id for c in candidates if c.google_place_id), None)
        address = next((c.address for c in candidates if c.address), None)
        opening_hours = next((c.opening_hours for c in candidates if c.opening_hours), None)
        
        return CandidateLocation(
            name=best_candidate.name,
            description=combined_description,
            confidence=merged_confidence,
            google_place_id=place_id,
            lat=avg_lat,
            lng=avg_lng,
            address=address,
            opening_hours=opening_hours
        )
    
    def filter_by_confidence(
        self,
        candidates: List[CandidateLocation],
        min_confidence: float = 0.50
    ) -> List[CandidateLocation]:
        """
        Filter candidates by minimum confidence threshold.
        
        Args:
            candidates: List of candidates
            min_confidence: Minimum confidence score (default 0.50)
            
        Returns:
            Filtered list above threshold
        """
        filtered = [c for c in candidates if c.confidence >= min_confidence]
        logger.info(
            f"Filtered candidates: {len(candidates)} → {len(filtered)} "
            f"(threshold: {min_confidence})"
        )
        return filtered


# Singleton instance
entity_resolver = EntityResolver(
    similarity_threshold=0.85,
    geo_radius_meters=50.0
)
