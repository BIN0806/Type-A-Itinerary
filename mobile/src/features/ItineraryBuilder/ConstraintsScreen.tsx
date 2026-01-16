import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type ConstraintsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Constraints'>;
  route: RouteProp<RootStackParamList, 'Constraints'>;
};

interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const SNAP_TO_WAYPOINT_DISTANCE_METERS = 100;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

// Haversine distance between two points in meters.
const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

const findNearestWaypoint = (point: { lat: number; lng: number }, wps: Waypoint[]) => {
  let best: { wp: Waypoint; d: number } | null = null;
  for (const wp of wps) {
    if (!Number.isFinite(wp.lat) || !Number.isFinite(wp.lng)) continue;
    const d = distanceMeters(point, { lat: wp.lat, lng: wp.lng });
    if (!best || d < best.d) best = { wp, d };
  }
  return best;
};

const computeRegionFromWaypoints = (wps: Waypoint[]): { center: { lat: number; lng: number }; region: MapRegion } | null => {
  const valid = wps.filter(wp => Number.isFinite(wp.lat) && Number.isFinite(wp.lng));
  if (valid.length === 0) return null;

  const avgLat = valid.reduce((sum, wp) => sum + wp.lat, 0) / valid.length;
  const avgLng = valid.reduce((sum, wp) => sum + wp.lng, 0) / valid.length;

  const lats = valid.map(wp => wp.lat);
  const lngs = valid.map(wp => wp.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latitudeDelta = Math.max((maxLat - minLat) * 1.5, 0.05);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.5, 0.05);

  return {
    center: { lat: avgLat, lng: avgLng },
    region: { latitude: avgLat, longitude: avgLng, latitudeDelta, longitudeDelta },
  };
};

export const ConstraintsScreen: React.FC<ConstraintsScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const mapRef = useRef<MapView>(null);
  
  // Start location (pin on map)
  const [startLocation, setStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapInitialRegion, setMapInitialRegion] = useState<MapRegion | null>(null);
  const [isLoadingWaypoints, setIsLoadingWaypoints] = useState(true);
  
  // Waypoints for end selection
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedStartWaypoint, setSelectedStartWaypoint] = useState<string | null>(null); // To track if user selected a waypoint as start
  const [selectedEndWaypoint, setSelectedEndWaypoint] = useState<string | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false); // For selecting start from waypoints
  
  // Time settings
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [walkingSpeed, setWalkingSpeed] = useState<'slow' | 'moderate' | 'fast'>('moderate');
  const [travelMode, setTravelMode] = useState<'walking' | 'transit'>('walking'); // New: transit option
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Load waypoints for the trip
  useEffect(() => {
    loadWaypoints();
  }, []);

  const loadWaypoints = async () => {
    try {
      const trip = await apiService.getTrip(tripId);
      if (trip.waypoints && trip.waypoints.length > 0) {
        const wps: Waypoint[] = trip.waypoints.map((wp: any) => ({
          id: wp.id,
          name: wp.name,
          lat: wp.lat,
          lng: wp.lng,
        }));
        setWaypoints(wps);
        
        // Map center: average of all locations. Start: nearest waypoint to that center (exactly one green waypoint pin).
        const computed = computeRegionFromWaypoints(wps);
        if (computed) {
          setMapInitialRegion(computed.region);

          const nearest = findNearestWaypoint(computed.center, wps);
          if (nearest) {
            setStartLocation({ lat: nearest.wp.lat, lng: nearest.wp.lng });
            setSelectedStartWaypoint(nearest.wp.id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading waypoints:', error);
    } finally {
      setIsLoadingWaypoints(false);
    }
  };

  const handleMapPress = (event: any) => {
    // Some map providers emit this action when a marker is pressed; ignore so we don't clear selection.
    if (event?.nativeEvent?.action === 'marker-press') return;

    const { coordinate } = event.nativeEvent;
    const tapped = { lat: coordinate.latitude, lng: coordinate.longitude };

    // Only allow selecting a start by choosing a waypoint pin. If the user taps close enough,
    // snap/select the nearest waypoint to match intent. Otherwise ignore the tap.
    const nearest = waypoints.length > 0 ? findNearestWaypoint(tapped, waypoints) : null;
    if (nearest && nearest.d <= SNAP_TO_WAYPOINT_DISTANCE_METERS) {
      handleSelectWaypointAsStart(nearest.wp);
    }
  };

  // Handle selecting a waypoint as the start location
  const handleSelectWaypointAsStart = (wp: Waypoint) => {
    setStartLocation({ lat: wp.lat, lng: wp.lng });
    setSelectedStartWaypoint(wp.id);
    
    // If the same waypoint was selected as end, clear it
    if (selectedEndWaypoint === wp.id) {
      setSelectedEndWaypoint(null);
    }
  };

  const handleOptimize = async () => {
    if (!startLocation) {
      Alert.alert('Missing Start', 'Please tap on the map to set your starting point');
      return;
    }

    // Validate that start and end are not the same
    if (selectedStartWaypoint && selectedStartWaypoint === selectedEndWaypoint) {
      Alert.alert('Invalid Selection', 'Start and end points cannot be the same location');
      return;
    }

    setIsOptimizing(true);

    try {
      // Create date objects for start and end times
      const today = new Date();
      const startDateTime = new Date(today);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(today);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      const constraints: any = {
        start_location: startLocation,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        walking_speed: walkingSpeed,
        travel_mode: travelMode, // Include transit option
      };

      // Add end waypoint if selected
      if (selectedEndWaypoint) {
        constraints.end_waypoint_id = selectedEndWaypoint;
      }

      console.log('📍 Optimizing trip with constraints:', constraints);
      const response = await apiService.optimizeTrip(tripId, constraints);
      console.log('✅ Optimization response:', response);

      const endWaypointName = selectedEndWaypoint 
        ? waypoints.find(w => w.id === selectedEndWaypoint)?.name 
        : 'best optimal point';

      Alert.alert(
        'Optimization Complete',
        `Your itinerary has been optimized!\nTotal time: ${response.total_time_minutes} minutes\nMode: ${travelMode === 'transit' ? 'Public Transit' : 'Walking'}\nEnding at: ${endWaypointName}`,
        [
          {
            text: 'View Timeline',
            onPress: () => navigation.navigate('Timeline', { tripId })
          }
        ]
      );
    } catch (error: any) {
      console.error('❌ Optimization failed:', error);
      console.error('Error details:', error.response?.data);
      
      const errorMessage = error.response?.data?.detail 
        || error.message 
        || 'Could not optimize route. Please try again.';
      
      Alert.alert(
        'Optimization Failed',
        errorMessage,
        [
          { text: 'Try Again', onPress: handleOptimize },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  const getSelectedEndName = () => {
    if (!selectedEndWaypoint) return 'None (optimize freely)';
    const wp = waypoints.find(w => w.id === selectedEndWaypoint);
    return wp ? wp.name : 'None';
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Plan Your Route</Text>
        <Text style={styles.subtitle}>
          Set your start point and preferences
        </Text>

        {/* Start Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Starting Point</Text>
          <Text style={styles.sectionSubtitle}>
            Tap a pin to select it as your starting point (green)
          </Text>
          
          <View style={styles.mapContainer}>
            {mapInitialRegion ? (
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={mapInitialRegion}
                onPress={handleMapPress}
              >
                {/* Waypoint markers - exactly one is green (start), tap any to select as start */}
                {waypoints.map((wp, index) => {
                  const isStart = wp.id === selectedStartWaypoint;
                  const isEnd = wp.id === selectedEndWaypoint && !isStart;
                  const pinColor = isStart ? 'green' : isEnd ? 'red' : '#4F46E5';
                  
                  return (
                    <Marker
                      key={wp.id}
                      coordinate={{
                        latitude: wp.lat,
                        longitude: wp.lng,
                      }}
                      pinColor={pinColor}
                      title={wp.name}
                      description={
                        isStart ? 'START POINT - Tap another to change' :
                        isEnd ? 'End Point' : 
                        `Stop ${index + 1} - Tap to start here`
                      }
                      onPress={() => handleSelectWaypointAsStart(wp)}
                    />
                  );
                })}
              </MapView>
            ) : (
              <View style={[styles.map, styles.mapLoading]}>
                {isLoadingWaypoints ? (
                  <ActivityIndicator size="large" color="#4F46E5" />
                ) : (
                  <Text style={styles.mapLoadingText}>Could not determine map center</Text>
                )}
              </View>
            )}
            
            {startLocation && (
              <View style={styles.coordinatesDisplay}>
                <Text style={styles.coordinatesText}>
                  {startLocation.lat.toFixed(4)}, {startLocation.lng.toFixed(4)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* End Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>End Point (Optional)</Text>
          <Text style={styles.sectionSubtitle}>
            Choose where you want to finish your tour
          </Text>
          
          <TouchableOpacity
            style={styles.endSelector}
            onPress={() => setShowEndPicker(true)}
          >
            <Text style={styles.endSelectorText}>{getSelectedEndName()}</Text>
            <Text style={styles.endSelectorArrow}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Time Window Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time Window</Text>
          
          <View style={styles.timeRow}>
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>Start Time</Text>
              <TextInput
                style={styles.input}
                placeholder="09:00"
                value={startTime}
                onChangeText={setStartTime}
              />
            </View>
            
            <View style={styles.timeInput}>
              <Text style={styles.timeLabel}>End Time</Text>
              <TextInput
                style={styles.input}
                placeholder="18:00"
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          </View>
        </View>

        {/* Travel Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travel Mode</Text>
          <Text style={styles.sectionSubtitle}>
            Choose how you'll get around
          </Text>
          
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                travelMode === 'walking' && styles.modeButtonActive
              ]}
              onPress={() => setTravelMode('walking')}
            >
              <Text style={styles.modeEmoji}>🚶</Text>
              <Text style={[
                styles.modeButtonText,
                travelMode === 'walking' && styles.modeButtonTextActive
              ]}>
                Walking
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modeButton,
                travelMode === 'transit' && styles.modeButtonActive
              ]}
              onPress={() => setTravelMode('transit')}
            >
              <Text style={styles.modeEmoji}>🚇</Text>
              <Text style={[
                styles.modeButtonText,
                travelMode === 'transit' && styles.modeButtonTextActive
              ]}>
                Transit
              </Text>
              <Text style={styles.modeSubtext}>Uses trains/buses</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Walking Speed Section - only show for walking mode */}
        {travelMode === 'walking' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Walking Speed</Text>
            
            <View style={styles.speedButtons}>
              {(['slow', 'moderate', 'fast'] as const).map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedButton,
                    walkingSpeed === speed && styles.speedButtonActive
                  ]}
                  onPress={() => setWalkingSpeed(speed)}
                >
                  <Text style={[
                    styles.speedButtonText,
                    walkingSpeed === speed && styles.speedButtonTextActive
                  ]}>
                    {speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </Text>
                  <Text style={styles.speedButtonSubtext}>
                    {speed === 'slow' ? '1.2 m/s' : speed === 'moderate' ? '1.4 m/s' : '1.6 m/s'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Optimize Button */}
        <TouchableOpacity
          style={[
            styles.optimizeButton,
            (!startLocation || isOptimizing) && styles.optimizeButtonDisabled
          ]}
          onPress={handleOptimize}
          disabled={!startLocation || isOptimizing}
        >
          <Text style={styles.optimizeButtonText}>
            {isOptimizing ? 'Optimizing Route...' : 'Optimize Route'}
          </Text>
        </TouchableOpacity>

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {waypoints.length} stops • {startTime} - {endTime} • {walkingSpeed} pace
          </Text>
          {selectedEndWaypoint && (
            <Text style={styles.summaryHighlight}>
              Ending at: {getSelectedEndName()}
            </Text>
          )}
        </View>
      </View>

      {/* End Point Picker Modal */}
      <Modal
        visible={showEndPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEndPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select End Point</Text>
            <Text style={styles.modalSubtitle}>
              Choose where you want to end your tour
            </Text>
            
            <ScrollView style={styles.waypointList}>
              {/* No end point option */}
              <TouchableOpacity
                style={[
                  styles.waypointItem,
                  !selectedEndWaypoint && styles.waypointItemSelected
                ]}
                onPress={() => {
                  setSelectedEndWaypoint(null);
                  setShowEndPicker(false);
                }}
              >
                <Text style={styles.waypointName}>No preference</Text>
                <Text style={styles.waypointDescription}>
                  Let the algorithm find the optimal end point
                </Text>
              </TouchableOpacity>
              
              {/* Waypoint options - gray out if same as start */}
              {waypoints.map((wp, index) => {
                const isStartLocation = selectedStartWaypoint === wp.id;
                
                return (
                  <TouchableOpacity
                    key={wp.id}
                    style={[
                      styles.waypointItem,
                      selectedEndWaypoint === wp.id && styles.waypointItemSelected,
                      isStartLocation && styles.waypointItemDisabled
                    ]}
                    onPress={() => {
                      if (!isStartLocation) {
                        setSelectedEndWaypoint(wp.id);
                        setShowEndPicker(false);
                      }
                    }}
                    disabled={isStartLocation}
                  >
                    <View style={styles.waypointItemRow}>
                      <Text style={[
                        styles.waypointName,
                        isStartLocation && styles.waypointNameDisabled
                      ]}>
                        {index + 1}. {wp.name}
                      </Text>
                      {isStartLocation && (
                        <View style={styles.startBadge}>
                          <Text style={styles.startBadgeText}>START</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[
                      styles.waypointDescription,
                      isStartLocation && styles.waypointDescriptionDisabled
                    ]}>
                      {isStartLocation 
                        ? 'Already selected as starting point'
                        : `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`
                      }
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowEndPicker(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  map: {
    width: '100%',
    height: 250,
  },
  mapLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  mapLoadingText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  coordinatesDisplay: {
    backgroundColor: '#fff',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  coordinatesText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
    textAlign: 'center',
  },
  endSelector: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  endSelectorText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  endSelectorArrow: {
    fontSize: 12,
    color: '#6B7280',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  speedButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  speedButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  speedButtonActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  speedButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  speedButtonTextActive: {
    color: '#4F46E5',
  },
  speedButtonSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  optimizeButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  optimizeButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  optimizeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  summary: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryHighlight: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  waypointList: {
    maxHeight: 400,
  },
  waypointItem: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  waypointItemSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  waypointName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  waypointDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  modalCloseButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  // Travel mode styles
  modeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  modeEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  modeButtonTextActive: {
    color: '#4F46E5',
  },
  modeSubtext: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  // Disabled waypoint styles
  waypointItemDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  waypointItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waypointNameDisabled: {
    color: '#9CA3AF',
  },
  waypointDescriptionDisabled: {
    color: '#D1D5DB',
  },
  startBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  startBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
});
