import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

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
  const [isSharing, setIsSharing] = useState(false);
  const [mapRouteData, setMapRouteData] = useState<any>(null);

  // Break time editing state
  const [showBreakTimeModal, setShowBreakTimeModal] = useState(false);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [breakTimeInput, setBreakTimeInput] = useState('');
  const [extraBreakTimes, setExtraBreakTimes] = useState<{ [key: number]: number }>({});

  // Ref for capturing combined screenshot (timeline + map)
  const combinedShareRef = useRef<View>(null);

  useEffect(() => {
    loadTrip();
  }, [tripId]);

  // Override back button to go to PastTrips
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.replace('PastTrips')}
          style={{ paddingHorizontal: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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

  // Load route polyline data for map capture
  useEffect(() => {
    const loadRouteData = async () => {
      if (!tripId) return;
      try {
        const routeResponse = await apiService.getTripRoute(tripId);
        if (routeResponse?.segments?.length > 0) {
          setMapRouteData(routeResponse);
        }
      } catch (e) {
        console.log('Could not load route data for sharing');
      }
    };
    loadRouteData();
  }, [tripId]);

  // Share handler - captures combined timeline + map image
  const handleShare = async () => {
    if (!trip?.waypoints?.length) {
      Alert.alert('Error', 'No itinerary to share');
      return;
    }

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }

    setIsSharing(true);

    try {
      // Longer delay to ensure MapView tiles and polylines are fully rendered
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Capture combined image (timeline + map in one view)
      if (combinedShareRef.current) {
        const uri = await captureRef(combinedShareRef, {
          format: 'png',
          quality: 1,
        });

        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your trip itinerary',
        });
      }
    } catch (error: any) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Could not share itinerary');
    } finally {
      setIsSharing(false);
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

  // Calculate map region for embedded map
  const coordinates = trip.waypoints.map((wp: any) => ({
    latitude: wp.lat,
    longitude: wp.lng,
  }));
  const latitudes = coordinates.map((c: any) => c.latitude);
  const longitudes = coordinates.map((c: any) => c.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const mapRegion = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: (maxLat - minLat) * 1.5 || 0.05,
    longitudeDelta: (maxLng - minLng) * 1.5 || 0.05,
  };
  // More zoomed-out region for share image to show all pins clearly with padding
  const latPadding = Math.max((maxLat - minLat) * 0.3, 0.01); // 30% padding
  const lngPadding = Math.max((maxLng - minLng) * 0.3, 0.01);
  const shareMapRegion = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) + latPadding * 2, 0.02) * 1.5,
    longitudeDelta: Math.max((maxLng - minLng) + lngPadding * 2, 0.02) * 1.5,
  };
  const segmentColors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

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
                        Walking • {calculateTravelTime(
                          waypoint.departure_time,
                          trip.waypoints[index + 1].arrival_time
                        ) + (extraBreakTimes[index] || 0)} min
                        {extraBreakTimes[index] ? ` (+${extraBreakTimes[index]} break)` : ''}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingSegmentIndex(index);
                          setBreakTimeInput(extraBreakTimes[index]?.toString() || '');
                          setShowBreakTimeModal(true);
                        }}
                        style={styles.editBreakButton}
                      >
                        <Text style={styles.editBreakText}>Edit</Text>
                      </TouchableOpacity>
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

      {/* Break Time Edit Modal */}
      <Modal
        visible={showBreakTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBreakTimeModal(false)}
      >
        <View style={styles.breakTimeModalOverlay}>
          <View style={styles.breakTimeModal}>
            <Text style={styles.breakTimeModalTitle}>Want more time in between?</Text>
            <Text style={styles.breakTimeModalSubtitle}>
              Add extra break time before your next stop
            </Text>

            <View style={styles.breakTimeInputRow}>
              <TextInput
                style={styles.breakTimeInput}
                value={breakTimeInput}
                onChangeText={setBreakTimeInput}
                keyboardType="number-pad"
                placeholder="0"
                maxLength={3}
                autoFocus
              />
              <Text style={styles.breakTimeInputUnit}>minutes</Text>
            </View>

            <View style={styles.breakTimeModalButtons}>
              <TouchableOpacity
                style={styles.breakTimeButtonCancel}
                onPress={() => {
                  setShowBreakTimeModal(false);
                  setEditingSegmentIndex(null);
                  setBreakTimeInput('');
                }}
              >
                <Text style={styles.breakTimeButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.breakTimeButtonSave}
                onPress={() => {
                  const minutes = parseInt(breakTimeInput, 10) || 0;
                  if (editingSegmentIndex !== null) {
                    setExtraBreakTimes(prev => ({
                      ...prev,
                      [editingSegmentIndex]: minutes,
                    }));
                  }
                  setShowBreakTimeModal(false);
                  setEditingSegmentIndex(null);
                  setBreakTimeInput('');
                }}
              >
                <Text style={styles.breakTimeButtonSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('MapView', { tripId })}
        >
          <Text style={styles.buttonText}>View Map</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonShare]}
          onPress={handleShare}
          disabled={isSharing}
        >
          <Text style={styles.buttonShareText}>{isSharing ? '...' : '📎'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonGoogleMaps]}
          onPress={openInGoogleMaps}
        >
          <Text style={styles.buttonGoogleMapsText}>Maps</Text>
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

      {/* Combined hidden view for screenshot capture (Timeline + Map in one image) */}
      <View
        ref={combinedShareRef}
        style={styles.combinedShareContainer}
        collapsable={false}
      >
        {/* Timeline Section */}
        <View style={styles.hiddenTimelineSection}>
          <View style={styles.hiddenTimelineHeader}>
            <Text style={styles.hiddenTimelineTitle}>📅 {trip.name}</Text>
            <Text style={styles.hiddenTimelineSubtitle}>
              {trip.waypoints.length} stops • {trip.total_time_minutes} min
            </Text>
          </View>
          {trip.waypoints.map((waypoint: any, index: number) => {
            const segment = getRouteSegmentForWaypoint(waypoint.order);
            const hasTransit = segment?.transit_steps && segment.transit_steps.length > 0;

            return (
              <View key={`hidden-${waypoint.id}`}>
                <View style={styles.hiddenTimelineItem}>
                  <View style={styles.hiddenTimelineMarker}>
                    <View style={[
                      styles.hiddenTimelineDot,
                      index === 0 && { backgroundColor: '#10B981' },
                      index === trip.waypoints.length - 1 && { backgroundColor: '#EF4444' },
                    ]} />
                    {index < trip.waypoints.length - 1 && (
                      <View style={styles.hiddenTimelineLine} />
                    )}
                  </View>
                  <View style={styles.hiddenTimelineContent}>
                    <Text style={styles.hiddenTimelineTime}>
                      {formatTime(waypoint.arrival_time)} - {formatTime(waypoint.departure_time)}
                    </Text>
                    <Text style={styles.hiddenTimelineName}>{waypoint.name}</Text>
                    <Text style={styles.hiddenTimelineDuration}>
                      Stay: {waypoint.estimated_stay_duration || 60} min
                    </Text>
                  </View>
                </View>
                {index < trip.waypoints.length - 1 && (
                  <View style={styles.hiddenTravelSegment}>
                    <Text style={styles.hiddenTravelText}>
                      {hasTransit ? '🚇' : '🚶'} {calculateTravelTime(
                        waypoint.departure_time,
                        trip.waypoints[index + 1].arrival_time
                      )} min
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* Map Section */}
        <View style={styles.hiddenMapSection}>
          <Text style={styles.hiddenMapSectionTitle}>🗺️ Route Map</Text>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.hiddenMap}
            region={shareMapRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {/* Render route polylines */}
            {mapRouteData?.segments?.map((segment: any, index: number) => (
              <Polyline
                key={`route-${index}`}
                coordinates={segment.polyline.map((point: any) => ({
                  latitude: point.lat,
                  longitude: point.lng,
                }))}
                strokeColor={segmentColors[index % segmentColors.length]}
                strokeWidth={4}
              />
            ))}

            {/* Fallback straight lines if no route data */}
            {!mapRouteData && (
              <Polyline
                coordinates={coordinates}
                strokeColor="#4F46E5"
                strokeWidth={3}
                lineDashPattern={[5, 5]}
              />
            )}

            {/* Waypoint markers - small custom circles */}
            {trip.waypoints.map((waypoint: any, index: number) => {
              const isStart = index === 0;
              const isEnd = index === trip.waypoints.length - 1;
              const color = isStart ? '#10B981' : isEnd ? '#EF4444' : '#4F46E5';

              return (
                <Marker
                  key={`share-marker-${waypoint.id}`}
                  coordinate={{
                    latitude: waypoint.lat,
                    longitude: waypoint.lng,
                  }}
                  title={waypoint.name}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.shareMarker, { borderColor: color }]}>
                    <View style={[styles.shareMarkerInner, { backgroundColor: color }]}>
                      <Text style={styles.shareMarkerText}>{waypoint.order}</Text>
                    </View>
                  </View>
                </Marker>
              );
            })}
          </MapView>
          <View style={styles.hiddenMapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'green' }]} />
              <Text style={styles.legendText}>Start</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4F46E5' }]} />
              <Text style={styles.legendText}>Stops</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'red' }]} />
              <Text style={styles.legendText}>End</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sharing loading overlay */}
      {isSharing && (
        <View style={styles.sharingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.sharingText}>Preparing to share...</Text>
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
  buttonShare: {
    backgroundColor: '#8B5CF6',
    flex: 0.5,
  },
  buttonShareText: {
    fontSize: 18,
  },
  // Hidden map for screenshot capture
  hiddenMapContainer: {
    position: 'absolute',
    left: -1000,
    top: 0,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
    backgroundColor: '#fff',
  },
  hiddenMapHeader: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hiddenMapTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  hiddenMapSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  hiddenMap: {
    height: 350,
    width: '100%',
  },
  hiddenMapLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
  // Sharing overlay
  sharingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sharingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '600',
  },
  // Hidden Timeline for full-content screenshot capture
  hiddenTimelineContainer: {
    position: 'absolute',
    left: -2000,
    top: 0,
    width: Dimensions.get('window').width,
    backgroundColor: '#fff',
    padding: 20,
  },
  hiddenTimelineHeader: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hiddenTimelineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  hiddenTimelineSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  hiddenTimelineItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  hiddenTimelineMarker: {
    alignItems: 'center',
    marginRight: 16,
    width: 20,
  },
  hiddenTimelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
  },
  hiddenTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#D1D5DB',
    marginTop: 4,
    minHeight: 40,
  },
  hiddenTimelineContent: {
    flex: 1,
    paddingBottom: 8,
  },
  hiddenTimelineTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 4,
  },
  hiddenTimelineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  hiddenTimelineDuration: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  hiddenTravelSegment: {
    paddingLeft: 36,
    paddingVertical: 8,
    marginBottom: 8,
  },
  hiddenTravelText: {
    fontSize: 13,
    color: '#6B7280',
  },
  // Combined share container (timeline + map in one image)
  combinedShareContainer: {
    position: 'absolute',
    left: -2000,
    top: 0,
    width: Dimensions.get('window').width,
    backgroundColor: '#fff',
  },
  hiddenTimelineSection: {
    padding: 20,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
  hiddenMapSection: {
    padding: 20,
  },
  hiddenMapSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  // Edit break button (inline with walking text)
  editBreakButton: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editBreakText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Break Time Modal styles
  breakTimeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  breakTimeModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  breakTimeModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  breakTimeModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  breakTimeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  breakTimeInput: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontSize: 24,
    fontWeight: '600',
    width: 100,
    textAlign: 'center',
    backgroundColor: '#EEF2FF',
  },
  breakTimeInputUnit: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  breakTimeModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  breakTimeButtonCancel: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  breakTimeButtonCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  breakTimeButtonSave: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  breakTimeButtonSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Small markers for share image
  shareMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareMarkerInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareMarkerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
});
