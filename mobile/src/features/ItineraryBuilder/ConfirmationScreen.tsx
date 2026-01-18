import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
  Image,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Swiper from 'react-native-deck-swiper';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_HEIGHT * 0.55;
// Photo takes ~50% of card, leaving guaranteed space for text below
const CARD_PHOTO_HEIGHT = Math.min(CARD_HEIGHT * 0.50, 260);

type ConfirmationScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Confirmation'>;
  route: RouteProp<RootStackParamList, 'Confirmation'>;
};

interface Alternative {
  name: string;
  address?: string;
  google_place_id: string;
  lat: number;
  lng: number;
  rating?: number;
  user_ratings_total?: number;
  photo_url?: string;
}

interface Candidate {
  name: string;
  description?: string;
  confidence: number;
  google_place_id: string;
  lat: number;
  lng: number;
  address?: string;
  rating?: number;
  opening_hours?: any;
  alternatives?: Alternative[];
  original_query?: string;
  photo_url?: string;
}

interface ConfirmedLocation {
  name: string;
  google_place_id: string;
  lat: number;
  lng: number;
  address?: string;
  rating?: number;
  photo_url?: string;
  estimated_stay_duration: number;
}

interface SearchSuggestion {
  name: string;
  place_id: string;
  address: string;
  lat?: number;
  lng?: number;
  rating?: number;
  photo_url?: string;
}

interface FailedImage {
  index: number;
  reason: string;
}

interface DuplicateMerge {
  original: string;
  merged_into: string;
}

interface ProcessingStats {
  total_images: number;
  successful_images: number;
  failed_count: number;
  locations_found: number;
  duplicates_count: number;
  processing_time_seconds: number;
}

// Screen states
type ScreenState = 'loading' | 'swiping' | 'summary';

export const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({
  navigation,
  route,
}) => {
  const { jobId, tripName } = route.params;

  // Core state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [currentIndex, setCurrentIndex] = useState(0);

  // Confirmed/Skipped tracking
  const [confirmed, setConfirmed] = useState<ConfirmedLocation[]>([]);
  const [skipped, setSkipped] = useState<number[]>([]);

  // Processing feedback
  const [failedImages, setFailedImages] = useState<FailedImage[]>([]);
  const [duplicatesMerged, setDuplicatesMerged] = useState<DuplicateMerge[]>([]);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);

  // Edit modal state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false); // For adding new locations manually
  const [searchQuery, setSearchQuery] = useState('');
  const [cityStateQuery, setCityStateQuery] = useState(''); // City/State filter
  const [stayDurationInput, setStayDurationInput] = useState('60'); // Stay duration in minutes
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Alternatives modal state
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [pendingAlternative, setPendingAlternative] = useState<Alternative | null>(null);

  // Refs for cleanup and state tracking
  const swiperRef = useRef<any>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingComplete = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Start polling on mount
  useEffect(() => {
    pollForCandidates();
  }, []);

  const pollForCandidates = () => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await apiService.getJobStatus(jobId);

        if (statusResponse.status === 'completed') {
          isPollingComplete.current = true;
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          const candidatesResponse = await apiService.getCandidates(jobId);
          setCandidates(candidatesResponse.candidates || []);

          // Capture failed images, duplicates, and stats for user feedback
          if (candidatesResponse.failed_images) {
            setFailedImages(candidatesResponse.failed_images);
          }
          if (candidatesResponse.duplicates_merged) {
            setDuplicatesMerged(candidatesResponse.duplicates_merged);
          }
          if (candidatesResponse.stats) {
            setProcessingStats(candidatesResponse.stats);
          }

          // Notify user about duplicates
          if (candidatesResponse.duplicates_merged?.length > 0) {
            const dupNames = candidatesResponse.duplicates_merged
              .map((d: DuplicateMerge) => `"${d.original}" → "${d.merged_into}"`)
              .join('\n');
            Alert.alert(
              'Duplicate Locations Merged',
              `Some images contained the same location:\n\n${dupNames}`,
              [{ text: 'OK' }]
            );
          }

          setScreenState('swiping');
        } else if (statusResponse.status === 'failed') {
          isPollingComplete.current = true;
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          Alert.alert('Error', 'Image analysis failed. Please try again.');
          navigation.goBack();
        }
      } catch (error) {
        isPollingComplete.current = true;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        Alert.alert('Error', 'Could not fetch analysis results');
        navigation.goBack();
      }
    }, 2000);

    // Timeout only during loading phase
    timeoutRef.current = setTimeout(() => {
      // Only trigger timeout if polling hasn't completed
      if (!isPollingComplete.current) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        Alert.alert('Timeout', 'Analysis is taking longer than expected');
        navigation.goBack();
      }
    }, 60000);
  };

  // Handle swipe right (confirm)
  const handleSwipeRight = useCallback((index: number) => {
    const candidate = candidates[index];
    const location: ConfirmedLocation = {
      name: candidate.name,
      google_place_id: candidate.google_place_id,
      lat: candidate.lat,
      lng: candidate.lng,
      address: candidate.address,
      rating: candidate.rating,
      photo_url: candidate.photo_url,
      estimated_stay_duration: 60,
    };
    setConfirmed(prev => [...prev, location]);
  }, [candidates]);

  // Handle swipe left (skip)
  const handleSwipeLeft = useCallback((index: number) => {
    setSkipped(prev => [...prev, index]);
  }, []);

  // Handle card swiped (any direction)
  const handleSwiped = useCallback((index: number) => {
    const newIndex = index + 1;
    setCurrentIndex(newIndex);

    // Check if all cards have been swiped
    if (newIndex >= candidates.length) {
      setScreenState('summary');
    }
  }, [candidates.length]);

  // Show alternatives modal
  const handleShowAlternatives = useCallback((index: number) => {
    const candidate = candidates[index];
    if (candidate.alternatives && candidate.alternatives.length > 0) {
      setSelectedCardIndex(index);
      setPendingAlternative(null);
      setShowAlternatives(true);
    } else {
      Alert.alert('No Alternatives', 'No similar locations found for this place.');
    }
  }, [candidates]);

  const closeAlternatives = useCallback(() => {
    setShowAlternatives(false);
    setSelectedCardIndex(null);
    setPendingAlternative(null);
  }, []);

  // Confirm chosen alternative (or keep current if none selected)
  const handleConfirmAlternative = useCallback(() => {
    if (selectedCardIndex === null) {
      closeAlternatives();
      return;
    }

    // User explicitly confirmed; apply only if they picked an alternative
    if (pendingAlternative) {
      const updatedCandidate: Candidate = {
        ...candidates[selectedCardIndex],
        name: pendingAlternative.name,
        google_place_id: pendingAlternative.google_place_id,
        lat: pendingAlternative.lat,
        lng: pendingAlternative.lng,
        address: pendingAlternative.address,
        rating: pendingAlternative.rating,
        photo_url: pendingAlternative.photo_url,
      };

      const newCandidates = [...candidates];
      newCandidates[selectedCardIndex] = updatedCandidate;
      setCandidates(newCandidates);
    }

    closeAlternatives();
  }, [candidates, closeAlternatives, pendingAlternative, selectedCardIndex]);

  // Calculate itinerary centroid for proximity-based search
  const getItineraryCentroid = useCallback((): { lat: number; lng: number } | null => {
    if (confirmed.length === 0) return null;

    const sumLat = confirmed.reduce((sum, loc) => sum + loc.lat, 0);
    const sumLng = confirmed.reduce((sum, loc) => sum + loc.lng, 0);

    return {
      lat: sumLat / confirmed.length,
      lng: sumLng / confirmed.length
    };
  }, [confirmed]);

  // Open edit modal for a confirmed location
  const handleEditLocation = useCallback((index: number) => {
    setEditingIndex(index);
    setIsAddingNew(false);
    setSearchQuery(confirmed[index].name);
    setCityStateQuery('');
    setStayDurationInput(String(confirmed[index].estimated_stay_duration || 60));
    setSearchSuggestions([]);
  }, [confirmed]);

  // Open modal for adding a new location manually
  const handleAddNewLocation = useCallback(() => {
    setEditingIndex(null);
    setIsAddingNew(true);
    setSearchQuery('');
    setCityStateQuery('');
    setStayDurationInput('60');
    setSearchSuggestions([]);
  }, []);

  // Search for places (with debounce) - uses itinerary centroid for proximity
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (text.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Use itinerary centroid for proximity search (not device location)
        const locationContext = getItineraryCentroid();

        // Build search query with city/state if provided
        const fullQuery = cityStateQuery.trim()
          ? `${text} ${cityStateQuery.trim()}`
          : text;

        const response = await apiService.searchPlaces(fullQuery, locationContext);
        setSearchSuggestions(response.results || []);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [getItineraryCentroid, cityStateQuery]);

  // Handle city/state change - re-trigger search
  const handleCityStateChange = useCallback((text: string) => {
    setCityStateQuery(text);
    // Re-trigger search with new city/state if we have a search query
    if (searchQuery.length >= 2) {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const locationContext = getItineraryCentroid();
          const fullQuery = text.trim()
            ? `${searchQuery} ${text.trim()}`
            : searchQuery;
          const response = await apiService.searchPlaces(fullQuery, locationContext);
          setSearchSuggestions(response.results || []);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    }
  }, [searchQuery, getItineraryCentroid]);

  // Select a search suggestion (for both edit and add new)
  const handleSelectSuggestion = useCallback((suggestion: SearchSuggestion) => {
    const parsedDuration = parseInt(stayDurationInput, 10) || 60;

    if (editingIndex !== null) {
      // Editing existing location
      const updatedConfirmed = [...confirmed];
      updatedConfirmed[editingIndex] = {
        ...updatedConfirmed[editingIndex],
        name: suggestion.name,
        google_place_id: suggestion.place_id,
        address: suggestion.address,
        lat: suggestion.lat || updatedConfirmed[editingIndex].lat,
        lng: suggestion.lng || updatedConfirmed[editingIndex].lng,
        rating: suggestion.rating,
        photo_url: suggestion.photo_url,
        estimated_stay_duration: parsedDuration,
      };
      setConfirmed(updatedConfirmed);
    } else if (isAddingNew) {
      // Adding new location manually
      const newLocation: ConfirmedLocation = {
        name: suggestion.name,
        google_place_id: suggestion.place_id,
        address: suggestion.address,
        lat: suggestion.lat || 0,
        lng: suggestion.lng || 0,
        rating: suggestion.rating,
        photo_url: suggestion.photo_url,
        estimated_stay_duration: parsedDuration,
      };
      setConfirmed(prev => [...prev, newLocation]);
    }
    setEditingIndex(null);
    setIsAddingNew(false);
    setSearchQuery('');
    setCityStateQuery('');
    setStayDurationInput('60');
    setSearchSuggestions([]);
  }, [editingIndex, isAddingNew, confirmed, stayDurationInput]);

  // Remove a confirmed location
  const handleRemoveLocation = useCallback((index: number) => {
    Alert.alert(
      'Remove Location',
      `Remove "${confirmed[index].name}" from your trip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setConfirmed(prev => prev.filter((_, i) => i !== index));
          },
        },
      ]
    );
  }, [confirmed]);

  // Finish and continue to next screen
  const handleContinue = async () => {
    if (confirmed.length === 0) {
      Alert.alert('No Locations', 'Please confirm at least one location');
      return;
    }

    try {
      const waypoints = confirmed.map(loc => ({
        name: loc.name,
        google_place_id: loc.google_place_id,
        lat: loc.lat,
        lng: loc.lng,
        estimated_stay_duration: loc.estimated_stay_duration,
      }));

      const response = await apiService.confirmWaypoints(jobId, waypoints, tripName || 'My Trip');
      navigation.navigate('Constraints', { tripId: response.id });
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Could not create trip'
      );
    }
  };

  // ============================================
  // RENDER: Loading State
  // ============================================
  if (screenState === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator testID="loading-indicator" size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Analyzing your photos...</Text>
        <Text style={styles.loadingSubtext}>Processing images</Text>
      </View>
    );
  }

  // ============================================
  // RENDER: Empty State (with feedback on why)
  // ============================================
  if (candidates.length === 0 && screenState !== 'summary') {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No locations found</Text>
        <Text style={styles.emptySubtext}>
          We couldn't identify any locations in your photos
        </Text>

        {/* Show why images failed */}
        {failedImages.length > 0 && (
          <View style={styles.failedImagesContainer}>
            <Text style={styles.failedImagesTitle}>Why it didn't work:</Text>
            {failedImages.slice(0, 3).map((failed, index) => (
              <Text key={index} style={styles.failedImageText}>
                • Image {failed.index}: {failed.reason}
              </Text>
            ))}
            {failedImages.length > 3 && (
              <Text style={styles.failedImageText}>
                • ...and {failedImages.length - 3} more
              </Text>
            )}
          </View>
        )}

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Tips for better results:</Text>
          <Text style={styles.tipText}>• Include photos with visible restaurant/place names</Text>
          <Text style={styles.tipText}>• Screenshots with location pins work best</Text>
          <Text style={styles.tipText}>• Avoid photos that only show food without context</Text>
        </View>

        {/* Manual entry option */}
        <View style={styles.manualEntryPrompt}>
          <Text style={styles.manualEntryText}>
            Know where you want to go? Add locations manually:
          </Text>
          <TouchableOpacity
            style={styles.manualEntryButton}
            onPress={() => {
              setScreenState('summary');
              handleAddNewLocation();
            }}
          >
            <Text style={styles.manualEntryButtonText}>Add Locations Manually</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Upload Different Photos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================
  // RENDER: Summary View (after all cards swiped)
  // ============================================
  if (screenState === 'summary') {
    return (
      <View style={styles.container} testID="summary-view">
        <View style={styles.summaryHeader}>
          <Text style={styles.title}>Review Your Trip</Text>
          <Text style={styles.subtitle}>
            {confirmed.length} location{confirmed.length !== 1 ? 's' : ''} confirmed
          </Text>
        </View>

        <ScrollView style={styles.summaryList} showsVerticalScrollIndicator={false}>
          {confirmed.map((location, index) => (
            <View
              key={`${location.google_place_id}-${index}`}
              style={styles.summaryCard}
              testID={`summary-location-${index}`}
            >
              {location.photo_url && (
                <Image
                  source={{ uri: location.photo_url }}
                  style={styles.summaryPhoto}
                  testID={`summary-photo-${index}`}
                />
              )}
              <View style={styles.summaryCardContent}>
                <Text style={styles.summaryCardName}>{location.name}</Text>
                {location.address && (
                  <Text style={styles.summaryCardAddress} numberOfLines={2}>
                    {location.address}
                  </Text>
                )}
                {location.rating && (
                  <Text style={styles.summaryCardRating}>★ {location.rating.toFixed(1)}</Text>
                )}
                <Text style={styles.summaryCardDuration} testID={`stay-duration-${index}`}>
                  {location.estimated_stay_duration || 60} min stay
                </Text>
                <View style={styles.summaryCardActions}>
                  <TouchableOpacity
                    style={styles.editLocationButton}
                    onPress={() => handleEditLocation(index)}
                    testID={`edit-location-${index}`}
                  >
                    <Text style={styles.editLocationButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeLocationButton}
                    onPress={() => handleRemoveLocation(index)}
                    testID={`remove-location-${index}`}
                  >
                    <Text style={styles.removeLocationButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {/* Add Location Button */}
          <TouchableOpacity
            style={styles.addLocationCard}
            onPress={handleAddNewLocation}
            testID="add-location-button"
          >
            <View style={styles.addLocationContent}>
              <Text style={styles.addLocationIcon}>+</Text>
              <View>
                <Text style={styles.addLocationTitle}>Add a Location</Text>
                <Text style={styles.addLocationSubtitle}>Search and add places manually</Text>
              </View>
            </View>
          </TouchableOpacity>

          {confirmed.length === 0 && (
            <View style={styles.noLocationsMessage}>
              <Text style={styles.noLocationsText}>No locations confirmed yet</Text>
              <Text style={styles.noLocationsSubtext}>
                Add locations using the button above
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.summaryFooter}>
          <TouchableOpacity
            style={[styles.continueButton, confirmed.length === 0 && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={confirmed.length === 0}
          >
            <Text style={styles.continueButtonText}>
              Continue to Trip Settings
            </Text>
          </TouchableOpacity>
        </View>

        {/* Location Edit/Add Modal */}
        {(editingIndex !== null || isAddingNew) && (
          <View style={styles.modal} testID="location-edit-modal">
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingModal}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            >
              <View style={styles.editModal}>
                {/* Header with X close button */}
                <View style={styles.editModalHeader}>
                  <TouchableOpacity
                    style={styles.editModalCloseX}
                    onPress={() => {
                      setEditingIndex(null);
                      setIsAddingNew(false);
                      setSearchQuery('');
                      setCityStateQuery('');
                      setStayDurationInput('60');
                      setSearchSuggestions([]);
                    }}
                    testID="edit-modal-close"
                  >
                    <Text style={styles.editModalCloseXText}>×</Text>
                  </TouchableOpacity>
                  <Text style={styles.editModalTitle}>
                    {isAddingNew ? 'Add Location' : 'Edit Location'}
                  </Text>
                  <View style={styles.editModalHeaderSpacer} />
                </View>
                <Text style={styles.editModalSubtitle}>
                  {isAddingNew
                    ? 'Search for a place to add to your trip'
                    : 'Update location or adjust stay duration'
                  }
                </Text>

                {/* Place name search */}
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder="Restaurant or place name..."
                  autoFocus
                  testID="location-search-input"
                  returnKeyType="search"
                />

                {/* City/State input for narrowing search */}
                <TextInput
                  style={styles.cityStateInput}
                  value={cityStateQuery}
                  onChangeText={handleCityStateChange}
                  placeholder="City, State (e.g., New York, NY)"
                  testID="city-state-input"
                  returnKeyType="search"
                />

                {/* Stay Duration input with inline Save */}
                <View style={styles.durationInputRow}>
                  <Text style={styles.durationInputLabel}>Stay Duration:</Text>
                  <TextInput
                    style={styles.durationInput}
                    value={stayDurationInput}
                    onChangeText={setStayDurationInput}
                    keyboardType="number-pad"
                    placeholder="60"
                    testID="stay-duration-input"
                    maxLength={3}
                  />
                  <Text style={styles.durationInputUnit}>min</Text>

                  {/* Inline Save button */}
                  {!isAddingNew && (
                    <TouchableOpacity
                      style={styles.saveEditButtonInline}
                      onPress={() => {
                        // Save duration changes without changing location
                        if (editingIndex !== null) {
                          const parsedDuration = parseInt(stayDurationInput, 10) || 60;
                          const updatedConfirmed = [...confirmed];
                          updatedConfirmed[editingIndex] = {
                            ...updatedConfirmed[editingIndex],
                            estimated_stay_duration: parsedDuration,
                          };
                          setConfirmed(updatedConfirmed);
                        }
                        setEditingIndex(null);
                        setIsAddingNew(false);
                        setSearchQuery('');
                        setCityStateQuery('');
                        setStayDurationInput('60');
                        setSearchSuggestions([]);
                      }}
                      testID="save-location-button"
                    >
                      <Text style={styles.saveEditButtonInlineText}>Save</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Proximity hint */}
                {confirmed.length > 0 && (
                  <Text style={styles.proximityHint}>
                    Results are prioritized near your other stops
                  </Text>
                )}

                {isSearching && (
                  <ActivityIndicator size="small" color="#4F46E5" style={styles.searchSpinner} />
                )}

                <FlatList
                  data={searchSuggestions}
                  keyExtractor={(item) => item.place_id}
                  style={styles.suggestionsList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      style={styles.suggestionItem}
                      onPress={() => handleSelectSuggestion(item)}
                      testID={`suggestion-${index}`}
                    >
                      <Text style={styles.suggestionName}>{item.name}</Text>
                      <Text style={styles.suggestionAddress}>{item.address}</Text>
                      {item.rating && (
                        <Text style={styles.suggestionRating}>★ {item.rating.toFixed(1)}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    searchQuery.length >= 2 && !isSearching ? (
                      <Text style={styles.noSuggestionsText}>
                        No results found. Try adding a city/state.
                      </Text>
                    ) : (
                      <Text style={styles.searchHintText}>
                        Start typing to search for places...
                      </Text>
                    )
                  }
                />
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    );
  }

  // ============================================
  // RENDER: Swiping View (main card interface)
  // ============================================
  const swipedCount = currentIndex;
  const totalCount = candidates.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Confirm Locations</Text>
        <Text style={styles.subtitle}>Swipe right to confirm, left to skip</Text>

        {/* Show processing stats if some images failed or duplicates found */}
        {(failedImages.length > 0 || duplicatesMerged.length > 0) && (
          <View style={styles.processingFeedback}>
            <Text style={styles.processingFeedbackText}>
              {processingStats?.locations_found || candidates.length} locations from {processingStats?.total_images || '?'} images
              {duplicatesMerged.length > 0 && ` (${duplicatesMerged.length} duplicates merged)`}
            </Text>
          </View>
        )}

        <View style={styles.counterRow}>
          <Text style={styles.counter} testID="swipe-counter">
            {`${swipedCount}/${totalCount}`}
          </Text>
          <Text style={styles.confirmedCounter} testID="confirmed-counter">
            {confirmed.length} confirmed
          </Text>
        </View>
      </View>

      {/* Card Swiper Container - bounded height */}
      {/* In tests we expose swipe callbacks on this wrapper so jest can invoke them directly. */}
      <View
        style={styles.swiperContainer}
        testID="swiper-container"
        {...(process.env.NODE_ENV === 'test'
          ? ({
            onSwiped: handleSwiped,
            onSwipedLeft: handleSwipeLeft,
            onSwipedRight: handleSwipeRight,
          } as any)
          : {})}
      >
        <Swiper
          ref={swiperRef}
          cards={candidates}
          renderCard={(card: Candidate, index: number) => (
            <View style={styles.card}>
              {/* Card Photo */}
              {card.photo_url && (
                <View style={styles.cardPhotoFrame}>
                  <Image
                    source={{ uri: card.photo_url }}
                    style={styles.cardPhoto}
                    resizeMode="cover"
                    testID={`card-photo-${index}`}
                  />
                </View>
              )}

              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{card.name}</Text>
                {card.address && (
                  <Text style={styles.cardAddress} numberOfLines={2}>{card.address}</Text>
                )}
                <View style={styles.cardMeta}>
                  <Text style={styles.cardConfidence}>
                    {Math.round(card.confidence * 100)}% match
                  </Text>
                  {card.rating && (
                    <Text style={styles.cardRating}>★ {card.rating.toFixed(1)}</Text>
                  )}
                </View>
                {card.description && (
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {card.description}
                  </Text>
                )}

                {/* Alternatives indicator */}
                {card.alternatives && card.alternatives.length > 0 && (
                  <TouchableOpacity
                    style={styles.alternativesButton}
                    onPress={() => handleShowAlternatives(index)}
                  >
                    <Text style={styles.alternativesButtonText}>
                      See {card.alternatives.length} similar places
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          onSwipedRight={handleSwipeRight}
          onSwipedLeft={handleSwipeLeft}
          onSwiped={handleSwiped}
          cardIndex={0}
          backgroundColor="transparent"
          stackSize={3}
          stackScale={8}
          stackSeparation={14}
          animateCardOpacity
          disableTopSwipe
          disableBottomSwipe
          overlayLabels={{
            left: {
              title: 'SKIP',
              style: {
                label: {
                  backgroundColor: '#EF4444',
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 'bold',
                  borderRadius: 8,
                  padding: 10,
                },
                wrapper: {
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-start',
                  marginTop: 30,
                  marginLeft: -30,
                },
              },
            },
            right: {
              title: 'CONFIRM',
              style: {
                label: {
                  backgroundColor: '#10B981',
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 'bold',
                  borderRadius: 8,
                  padding: 10,
                },
                wrapper: {
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  marginTop: 30,
                  marginLeft: 30,
                },
              },
            },
          }}
        />
      </View>

      {/* Continue Button - fixed at bottom */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[styles.finishButton, confirmed.length === 0 && styles.finishButtonDisabled]}
          onPress={() => {
            if (currentIndex < candidates.length) {
              // Still have cards to swipe
              Alert.alert(
                'Skip Remaining?',
                `You still have ${candidates.length - currentIndex} locations to review. Skip them and continue?`,
                [
                  { text: 'Keep Reviewing', style: 'cancel' },
                  { text: 'Skip & Continue', onPress: () => setScreenState('summary') },
                ]
              );
            } else {
              setScreenState('summary');
            }
          }}
        >
          <Text style={styles.finishButtonText}>
            Continue with {confirmed.length} location{confirmed.length !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Alternatives Modal */}
      {showAlternatives && selectedCardIndex !== null && (
        <View style={styles.modal}>
          <View style={styles.alternativesModal}>
            <View style={styles.alternativesHeader}>
              <View style={styles.alternativesHeaderRow}>
                <TouchableOpacity
                  style={styles.alternativesCloseX}
                  accessibilityRole="button"
                  accessibilityLabel="Close similar places"
                  onPress={closeAlternatives}
                >
                  <Text style={styles.alternativesCloseXText}>×</Text>
                </TouchableOpacity>
                <Text style={styles.alternativesTitle}>Similar Places</Text>
                <View style={styles.alternativesHeaderSpacer} />
              </View>
              <Text style={styles.alternativesSubtitle}>
                Pick one, then confirm to replace "{candidates[selectedCardIndex].original_query || candidates[selectedCardIndex].name}"
              </Text>
            </View>

            {/* Current Selection (Primary) */}
            <TouchableOpacity
              style={[
                styles.alternativeItem,
                styles.primaryItem,
                pendingAlternative === null && styles.alternativeItemSelected,
              ]}
              onPress={() => setPendingAlternative(null)}
            >
              <View style={styles.alternativeContent}>
                <View style={[styles.alternativeRank, styles.primaryRank]}>
                  <Text style={styles.alternativeRankText}>1</Text>
                </View>
                <View style={styles.alternativeDetails}>
                  <Text style={styles.alternativeName}>
                    {candidates[selectedCardIndex].name}
                  </Text>
                  {candidates[selectedCardIndex].address && (
                    <Text style={styles.alternativeAddress} numberOfLines={2}>
                      {candidates[selectedCardIndex].address}
                    </Text>
                  )}
                  <Text style={styles.primaryBadge}>Current selection</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Alternatives List */}
            <FlatList
              data={candidates[selectedCardIndex].alternatives}
              keyExtractor={(item) => item.google_place_id}
              style={styles.alternativesList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.alternativeItem,
                    pendingAlternative?.google_place_id === item.google_place_id &&
                    styles.alternativeItemSelected,
                  ]}
                  onPress={() => setPendingAlternative(item)}
                >
                  <View style={styles.alternativeContent}>
                    <View style={styles.alternativeRank}>
                      <Text style={styles.alternativeRankText}>{index + 2}</Text>
                    </View>
                    <View style={styles.alternativeDetails}>
                      <Text style={styles.alternativeName}>{item.name}</Text>
                      {item.address && (
                        <Text style={styles.alternativeAddress} numberOfLines={2}>
                          {item.address}
                        </Text>
                      )}
                      {item.rating && (
                        <View style={styles.ratingRow}>
                          <Text style={styles.ratingText}>★ {item.rating.toFixed(1)}</Text>
                          {item.user_ratings_total && (
                            <Text style={styles.ratingCount}>
                              ({item.user_ratings_total.toLocaleString()} reviews)
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmAlternative}
            >
              <Text style={styles.confirmButtonText}>
                {pendingAlternative ? 'Confirm & Replace' : 'Confirm (Keep Current)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  // Empty state styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  // Header styles
  header: {
    padding: 20,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  confirmedCounter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  // Swiper container - bounded height above button
  swiperContainer: {
    flex: 1,
    marginBottom: 80, // Space for the button
  },
  // Card styles
  card: {
    height: CARD_HEIGHT, // Fixed height
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    flexDirection: 'column', // Explicit column layout
  },
  cardPhotoFrame: {
    paddingHorizontal: 14,
    paddingTop: 14,
    backgroundColor: '#fff', // same as card: creates a "white frame" around the photo
    alignItems: 'center',
  },
  cardPhoto: {
    width: '100%',
    height: CARD_PHOTO_HEIGHT,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    borderRadius: 14,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16, // Clear gap below the photo
    paddingBottom: 20,
    justifyContent: 'flex-start', // Text flows from top of content area
  },
  cardName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  cardAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardConfidence: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
  cardRating: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
    marginLeft: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  alternativesButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    alignItems: 'center',
  },
  alternativesButtonText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  // Bottom button container
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  finishButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  finishButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Summary view styles
  summaryHeader: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryList: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryPhoto: {
    width: '100%',
    height: 120,
    backgroundColor: '#E5E7EB',
  },
  summaryCardContent: {
    padding: 16,
  },
  summaryCardName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  summaryCardAddress: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryCardRating: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editLocationButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    alignItems: 'center',
  },
  editLocationButtonText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  removeLocationButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
  },
  removeLocationButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  noLocationsMessage: {
    padding: 40,
    alignItems: 'center',
  },
  noLocationsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  noLocationsSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  summaryFooter: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  continueButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
  },
  // Edit modal
  editModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  // Edit modal header
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editModalCloseX: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalCloseXText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 24,
  },
  editModalHeaderSpacer: {
    width: 36,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  editModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  searchSpinner: {
    marginVertical: 8,
  },
  suggestionsList: {
    maxHeight: 250,
  },
  suggestionItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  suggestionAddress: {
    fontSize: 13,
    color: '#6B7280',
  },
  noSuggestionsText: {
    padding: 20,
    textAlign: 'center',
    color: '#9CA3AF',
  },
  cancelEditButton: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelEditButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  saveEditButton: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    alignItems: 'center',
  },
  saveEditButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  saveEditButtonInline: {
    marginLeft: 12,
    backgroundColor: '#4F46E5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveEditButtonInlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Alternatives modal


  alternativesModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  alternativesHeader: {
    marginBottom: 16,
  },
  alternativesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  alternativesHeaderSpacer: {
    width: 36,
  },
  alternativesCloseX: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alternativesCloseXText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  alternativesTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  alternativesSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  alternativesList: {
    maxHeight: 300,
  },
  alternativeItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alternativeItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  primaryItem: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
    marginBottom: 12,
  },
  alternativeContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alternativeRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  primaryRank: {
    backgroundColor: '#4F46E5',
  },
  alternativeRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  alternativeDetails: {
    flex: 1,
  },
  alternativeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  alternativeAddress: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  primaryBadge: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '500',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
  },
  ratingCount: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  confirmButton: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Failed images feedback styles
  failedImagesContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    width: '100%',
  },
  failedImagesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 8,
  },
  failedImageText: {
    fontSize: 13,
    color: '#7F1D1D',
    marginBottom: 4,
  },
  tipsContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#3730A3',
    marginBottom: 4,
  },
  processingFeedback: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  processingFeedbackText: {
    fontSize: 12,
    color: '#92400E',
    textAlign: 'center',
  },
  // Manual entry styles
  manualEntryPrompt: {
    marginTop: 24,
    padding: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    width: '100%',
    alignItems: 'center',
  },
  manualEntryText: {
    fontSize: 14,
    color: '#166534',
    textAlign: 'center',
    marginBottom: 12,
  },
  manualEntryButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  manualEntryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    padding: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Add location card styles
  addLocationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
  },
  addLocationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addLocationIcon: {
    fontSize: 28,
    color: '#4F46E5',
    fontWeight: '300',
    marginRight: 16,
    width: 40,
    textAlign: 'center',
  },
  addLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },
  addLocationSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  // City/State input
  cityStateInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  proximityHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 8,
    textAlign: 'center',
  },
  suggestionRating: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 2,
  },
  searchHintText: {
    padding: 20,
    textAlign: 'center',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  keyboardAvoidingModal: {
    width: '90%',
    maxHeight: '85%',
  },
  // Stay duration input styles
  durationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  durationInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginRight: 12,
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    width: 70,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  durationInputUnit: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  summaryCardDuration: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '500',
    marginTop: 4,
  },
});
