"""Text processing utilities for entity resolution."""
import re
from typing import List
import Levenshtein


def normalize_text(text: str) -> str:
    """
    Normalize text for comparison.
    
    Args:
        text: Raw text string
        
    Returns:
        Normalized lowercase text with extra whitespace removed
    """
    # Convert to lowercase
    text = text.lower()
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Strip leading/trailing whitespace
    text = text.strip()
    return text


def calculate_similarity(text1: str, text2: str) -> float:
    """
    Calculate similarity between two strings using Levenshtein distance.
    
    Args:
        text1: First string
        text2: Second string
        
    Returns:
        Similarity score between 0.0 (completely different) and 1.0 (identical)
    """
    if not text1 or not text2:
        return 0.0
    
    # Normalize texts
    text1 = normalize_text(text1)
    text2 = normalize_text(text2)
    
    if text1 == text2:
        return 1.0
    
    # Calculate Levenshtein ratio
    return Levenshtein.ratio(text1, text2)


def are_similar(text1: str, text2: str, threshold: float = 0.85) -> bool:
    """
    Check if two strings are similar above a threshold.
    
    Args:
        text1: First string
        text2: Second string
        threshold: Minimum similarity score (default 0.85)
        
    Returns:
        True if similarity >= threshold
    """
    return calculate_similarity(text1, text2) >= threshold


def extract_location_mentions(text: str) -> List[str]:
    """
    Extract potential location mentions from text using pattern matching.
    
    Args:
        text: Text to analyze
        
    Returns:
        List of potential location names
    """
    locations = []
    
    # Pattern 1: Location pins/emojis
    pin_pattern = r'📍\s*([^📍\n]+)'
    locations.extend(re.findall(pin_pattern, text))
    
    # Pattern 2: "at [Location]" or "@ [Location]"
    at_pattern = r'(?:at|@)\s+([A-Z][A-Za-z\s]+?)(?:\s|,|$)'
    locations.extend(re.findall(at_pattern, text))
    
    # Pattern 3: Hashtags with proper names
    hashtag_pattern = r'#([A-Z][A-Za-z]+)'
    locations.extend(re.findall(hashtag_pattern, text))
    
    # Clean and deduplicate
    cleaned = []
    for loc in locations:
        loc = loc.strip()
        if len(loc) > 2 and loc not in cleaned:
            cleaned.append(loc)
    
    return cleaned


def remove_emojis(text: str) -> str:
    """
    Remove emoji characters from text.
    
    Args:
        text: Text with potential emojis
        
    Returns:
        Text with emojis removed
    """
    # Pattern for emoji removal (basic Unicode ranges)
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE
    )
    return emoji_pattern.sub(r'', text)
