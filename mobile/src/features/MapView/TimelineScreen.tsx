import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type TimelineScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Timeline'>;
  route: RouteProp<RootStackParamList, 'Timeline'>;
};

interface TransitStep {
  type: string;
  line_name: string;
  line_color: string;
  text_color: string;
  departure_stop: string;
  arrival_stop: string;
  num_stops: number;
  duration_seconds: number;
  headsign: string;
}

interface RouteSegment {
  from_order: number;
  to_order: number;
  travel_mode: string;
  duration_seconds: number;
  transit_steps?: TransitStep[];
}

export const TimelineScreen: React.FC<TimelineScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<any>(null);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<string>('walking');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTransitStep, setSelectedTransitStep] = useState<TransitStep | null>(null);

  useEffect(() => {
    loadTrip();
  }, []);

  const loadTrip = async () => {
    try {
      const response = await apiService.getTrip(tripId);
      setTrip(response);
      
      // Try to get maps link
      try {
        const mapsData = await apiService.getMapsLink(tripId);
        setGoogleMapsUrl(mapsData.url);
      } catch (e) {
        console.log('Could not get maps link');
      }
      
      // If there's optimization data stored, load route segments
      if (response.route_segments) {
        setRouteSegments(response.route_segments);
      }
      if (response.travel_mode) {
        setTravelMode(response.travel_mode);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Could not load trip details');
    } finally {
      setIsLoading(false);
    }
  };

  // Get best location string for a waypoint (name with address preferred)
  const getLocationString = (wp: any): string => {
    if (wp.name && wp.address) {
      return `${wp.name}, ${wp.address}`;
    } else if (wp.name) {
      return wp.name;
    } else if (wp.address) {
      return wp.address;
    }
    return `${wp.lat},${wp.lng}`;
  };

  const openInGoogleMaps = async () => {
    if (googleMapsUrl) {
      const supported = await Linking.canOpenURL(googleMapsUrl);
      if (supported) {
        await Linking.openURL(googleMapsUrl);
      } else {
        Alert.alert('Error', 'Cannot open Google Maps');
      }
    } else {
      // Build URL from waypoints using location names
      if (trip?.waypoints?.length > 0) {
        const waypoints = trip.waypoints;
        const origin = encodeURIComponent(getLocationString(waypoints[0]));
        const destination = encodeURIComponent(getLocationString(waypoints[waypoints.length - 1]));
        
        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;
        
        if (waypoints.length > 2) {
          const middleWaypoints = waypoints.slice(1, -1).map((wp: any) => getLocationString(wp)).join('|');
          url += `&waypoints=${encodeURIComponent(middleWaypoints)}`;
        }
        
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        }
      }
    }
  };

  const getTransitIcon = (type: string): string => {
    switch (type.toUpperCase()) {
      case 'SUBWAY':
      case 'METRO_RAIL':
        return '🚇';
      case 'BUS':
        return '🚌';
      case 'TRAIN':
      case 'HEAVY_RAIL':
      case 'COMMUTER_TRAIN':
        return '🚆';
      case 'TRAM':
      case 'LIGHT_RAIL':
        return '🚊';
      case 'FERRY':
        return '⛴️';
      case 'WALKING':
        return '🚶';
      default:
        return '🚌';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const calculateTravelTime = (fromTime: string, toTime: string) => {
    const from = new Date(fromTime);
    const to = new Date(toTime);
    const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
    return minutes;
  };

  const getRouteSegmentForWaypoint = (waypointOrder: number): RouteSegment | undefined => {
    return routeSegments.find(seg => seg.from_order === waypointOrder);
  };

  const renderTransitSteps = (segment: RouteSegment) => {
    if (!segment.transit_steps || segment.transit_steps.length === 0) {
      return null;
    }

    return (
      <View style={styles.transitStepsContainer}>
        {segment.transit_steps.map((step, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.transitStep}
            onPress={() => setSelectedTransitStep(step)}
          >
            <View 
              style={[
                styles.transitLineIndicator, 
                { backgroundColor: step.line_color || '#4F46E5' }
              ]}
            />
            <Text style={styles.transitIcon}>{getTransitIcon(step.type)}</Text>
            <View style={styles.transitStepInfo}>
              <Text style={[
                styles.transitLineName,
                { color: step.line_color || '#4F46E5' }
              ]}>
                {step.line_name || step.type}
              </Text>
              <Text style={styles.transitStepDetail}>
                {step.type === 'WALKING' 
                  ? step.headsign 
                  : `${step.num_stops} stops • ${step.headsign}`
                }
              </Text>
            </View>
            <Text style={styles.transitDuration}>
              {Math.round(step.duration_seconds / 60)} min
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!trip || !trip.waypoints || trip.waypoints.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No itinerary available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tripName}>{trip.name}</Text>
        <View style={styles.tripInfoRow}>
          <Text style={styles.tripInfo}>
            {trip.total_time_minutes} min • {trip.waypoints.length} stops
          </Text>
          {travelMode === 'transit' && (
            <View style={styles.transitBadge}>
              <Text style={styles.transitBadgeText}>🚇 Transit</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.timeline}>
        {trip.waypoints.map((waypoint: any, index: number) => {
          const segment = getRouteSegmentForWaypoint(waypoint.order);
          const hasTransit = segment?.transit_steps && segment.transit_steps.length > 0;
          
          return (
            <View key={waypoint.id}>
              <View style={styles.timelineItem}>
                <View style={styles.timelineMarker}>
                  <View style={styles.timelineDot} />
                  {index < trip.waypoints.length - 1 && (
                    <View style={styles.timelineLine} />
                  )}
                </View>

                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTime}>
                    {formatTime(waypoint.arrival_time)} - {formatTime(waypoint.departure_time)}
                  </Text>
                  
                  <View style={styles.activityCard}>
                    <Text style={styles.activityName}>{waypoint.name}</Text>
                    {waypoint.address && (
                      <Text style={styles.activityAddress}>{waypoint.address}</Text>
                    )}
                    <Text style={styles.activityDuration}>
                      Stay: {waypoint.estimated_stay_duration || 60} minutes
                    </Text>
                  </View>
                </View>
              </View>

              {index < trip.waypoints.length - 1 && (
                <View style={styles.travelSegment}>
                  {hasTransit ? (
                    // Transit route with colored lines
                    <View style={styles.transitRouteContainer}>
                      <View style={styles.transitHeader}>
                        <Text style={styles.transitHeaderText}>
                          🚇 Transit Route • {calculateTravelTime(
                            waypoint.departure_time,
                            trip.waypoints[index + 1].arrival_time
                          )} min total
                        </Text>
                      </View>
                      {segment && renderTransitSteps(segment)}
                    </View>
                  ) : (
                    // Walking route
                    <View style={styles.walkingSegment}>
                      <View style={styles.walkingDots}>
                        <View style={styles.walkingDot} />
                        <View style={styles.walkingDot} />
                        <View style={styles.walkingDot} />
                      </View>
                      <Text style={styles.walkingText}>
                        🚶 Walking • {calculateTravelTime(
                          waypoint.departure_time,
                          trip.waypoints[index + 1].arrival_time
                        )} min
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Transit Step Detail Modal */}
      {selectedTransitStep && (
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedTransitStep(null)}
        >
          <View style={styles.transitDetailModal}>
            <View style={[
              styles.transitDetailHeader,
              { backgroundColor: selectedTransitStep.line_color || '#4F46E5' }
            ]}>
              <Text style={[
                styles.transitDetailTitle,
                { color: selectedTransitStep.text_color || '#FFF' }
              ]}>
                {getTransitIcon(selectedTransitStep.type)} {selectedTransitStep.line_name}
              </Text>
            </View>
            <View style={styles.transitDetailContent}>
              <Text style={styles.transitDetailLabel}>Direction</Text>
              <Text style={styles.transitDetailValue}>{selectedTransitStep.headsign}</Text>
              
              <Text style={styles.transitDetailLabel}>From</Text>
              <Text style={styles.transitDetailValue}>{selectedTransitStep.departure_stop}</Text>
              
              <Text style={styles.transitDetailLabel}>To</Text>
              <Text style={styles.transitDetailValue}>{selectedTransitStep.arrival_stop}</Text>
              
              <Text style={styles.transitDetailLabel}>Stops</Text>
              <Text style={styles.transitDetailValue}>{selectedTransitStep.num_stops} stops</Text>
              
              <Text style={styles.transitDetailLabel}>Duration</Text>
              <Text style={styles.transitDetailValue}>
                {Math.round(selectedTransitStep.duration_seconds / 60)} minutes
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.closeDetailButton}
              onPress={() => setSelectedTransitStep(null)}
            >
              <Text style={styles.closeDetailText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('MapView', { tripId })}
        >
          <Text style={styles.buttonText}>View Map</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonGoogleMaps]}
          onPress={openInGoogleMaps}
        >
          <Text style={styles.buttonGoogleMapsText}>Open in Maps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('Navigation', { tripId })}
        >
          <Text style={[styles.buttonText, styles.buttonPrimaryText]}>
            Start
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tripName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  tripInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripInfo: {
    fontSize: 14,
    color: '#6B7280',
  },
  transitBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  transitBadgeText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
  },
  timeline: {
    flex: 1,
  },
  timelineItem: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  timelineMarker: {
    alignItems: 'center',
    marginRight: 16,
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#D1D5DB',
    marginTop: 8,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  activityName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  activityAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  activityDuration: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  travelSegment: {
    paddingLeft: 56,
    paddingVertical: 8,
  },
  walkingSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  walkingDots: {
    flexDirection: 'column',
    marginRight: 12,
  },
  walkingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
    marginVertical: 2,
  },
  walkingText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  // Transit route styles
  transitRouteContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginRight: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transitHeader: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  transitHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  transitStepsContainer: {
    padding: 8,
  },
  transitStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  transitLineIndicator: {
    width: 4,
    height: '100%',
    minHeight: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  transitIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  transitStepInfo: {
    flex: 1,
  },
  transitLineName: {
    fontSize: 15,
    fontWeight: '700',
  },
  transitStepDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  transitDuration: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Transit detail modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transitDetailModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '85%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  transitDetailHeader: {
    padding: 16,
  },
  transitDetailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  transitDetailContent: {
    padding: 16,
  },
  transitDetailLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  transitDetailValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  closeDetailButton: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  closeDetailText: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  button: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  buttonPrimary: {
    backgroundColor: '#4F46E5',
  },
  buttonGoogleMaps: {
    backgroundColor: '#10B981',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  buttonPrimaryText: {
    color: '#fff',
  },
  buttonGoogleMapsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
