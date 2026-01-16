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

export const ConstraintsScreen: React.FC<ConstraintsScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const mapRef = useRef<MapView>(null);
  
  // Start location (pin on map)
  const [startLocation, setStartLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  // Waypoints for end selection
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedEndWaypoint, setSelectedEndWaypoint] = useState<string | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // Time settings
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [walkingSpeed, setWalkingSpeed] = useState<'slow' | 'moderate' | 'fast'>('moderate');
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Load waypoints for the trip
  useEffect(() => {
    loadWaypoints();
  }, []);

  const loadWaypoints = async () => {
    try {
      const trip = await apiService.getTrip(tripId);
      if (trip.waypoints && trip.waypoints.length > 0) {
        setWaypoints(trip.waypoints.map((wp: any) => ({
          id: wp.id,
          name: wp.name,
          lat: wp.lat,
          lng: wp.lng,
        })));
        
        // Auto-center map on waypoints
        if (trip.waypoints.length > 0) {
          const avgLat = trip.waypoints.reduce((sum: number, wp: any) => sum + wp.lat, 0) / trip.waypoints.length;
          const avgLng = trip.waypoints.reduce((sum: number, wp: any) => sum + wp.lng, 0) / trip.waypoints.length;
          setStartLocation({ lat: avgLat, lng: avgLng });
        }
      }
    } catch (error) {
      console.error('Error loading waypoints:', error);
    }
  };

  const handleMapPress = (event: any) => {
    const { coordinate } = event.nativeEvent;
    setStartLocation({
      lat: coordinate.latitude,
      lng: coordinate.longitude,
    });
  };

  const handleOptimize = async () => {
    if (!startLocation) {
      Alert.alert('Missing Start', 'Please tap on the map to set your starting point');
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
      };

      // Add end waypoint if selected
      if (selectedEndWaypoint) {
        constraints.end_waypoint_id = selectedEndWaypoint;
      }

      const response = await apiService.optimizeTrip(tripId, constraints);

      const endWaypointName = selectedEndWaypoint 
        ? waypoints.find(w => w.id === selectedEndWaypoint)?.name 
        : 'best optimal point';

      Alert.alert(
        'Optimization Complete',
        `Your itinerary has been optimized!\nTotal time: ${response.total_time_minutes} minutes\nEnding at: ${endWaypointName}`,
        [
          {
            text: 'View Timeline',
            onPress: () => navigation.navigate('Timeline', { tripId })
          }
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Optimization Failed',
        error.response?.data?.detail || 'Could not optimize route'
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
            Tap on the map to drop a pin where you'll start
          </Text>
          
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={{
                latitude: startLocation?.lat || 35.6762,
                longitude: startLocation?.lng || 139.6503,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              onPress={handleMapPress}
            >
              {/* Start location marker */}
              {startLocation && (
                <Marker
                  coordinate={{
                    latitude: startLocation.lat,
                    longitude: startLocation.lng,
                  }}
                  pinColor="green"
                  title="Start Here"
                />
              )}
              
              {/* Waypoint markers */}
              {waypoints.map((wp, index) => (
                <Marker
                  key={wp.id}
                  coordinate={{
                    latitude: wp.lat,
                    longitude: wp.lng,
                  }}
                  pinColor={wp.id === selectedEndWaypoint ? 'red' : '#4F46E5'}
                  title={wp.name}
                  description={wp.id === selectedEndWaypoint ? 'End Point' : `Stop ${index + 1}`}
                />
              ))}
            </MapView>
            
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

        {/* Walking Speed Section */}
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
              
              {/* Waypoint options */}
              {waypoints.map((wp, index) => (
                <TouchableOpacity
                  key={wp.id}
                  style={[
                    styles.waypointItem,
                    selectedEndWaypoint === wp.id && styles.waypointItemSelected
                  ]}
                  onPress={() => {
                    setSelectedEndWaypoint(wp.id);
                    setShowEndPicker(false);
                  }}
                >
                  <Text style={styles.waypointName}>
                    {index + 1}. {wp.name}
                  </Text>
                  <Text style={styles.waypointDescription}>
                    {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                  </Text>
                </TouchableOpacity>
              ))}
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
});
