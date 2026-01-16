import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type MapViewScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MapView'>;
  route: RouteProp<RootStackParamList, 'MapView'>;
};

interface RouteSegment {
  from_index: number;
  to_index: number;
  from_name: string;
  to_name: string;
  polyline: Array<{ lat: number; lng: number }>;
  duration_seconds: number;
  distance_meters: number;
  duration_text: string;
  distance_text: string;
}

interface RouteData {
  segments: RouteSegment[];
  total_duration_seconds: number;
  total_distance_meters: number;
}

export const MapViewScreen: React.FC<MapViewScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<any>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<RouteSegment | null>(null);

  useEffect(() => {
    loadTrip();
  }, []);

  const loadTrip = async () => {
    try {
      const [tripResponse, routeResponse] = await Promise.all([
        apiService.getTrip(tripId),
        apiService.getTripRoute(tripId).catch(() => null),
      ]);
      setTrip(tripResponse);
      if (routeResponse) {
        setRouteData(routeResponse);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Could not load trip details');
    } finally {
      setIsLoading(false);
    }
  };
  
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
  };
  
  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
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
        <Text style={styles.emptyText}>No waypoints to display</Text>
      </View>
    );
  }

  // Calculate region to fit all markers
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

  const region = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: (maxLat - minLat) * 1.5 || 0.05,
    longitudeDelta: (maxLng - minLng) * 1.5 || 0.05,
  };

  // Generate route polyline colors for each segment
  const segmentColors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
      >
        {/* Render actual walking paths if available */}
        {routeData && routeData.segments.map((segment, index) => (
          <Polyline
            key={`route-${index}`}
            coordinates={segment.polyline.map(point => ({
              latitude: point.lat,
              longitude: point.lng,
            }))}
            strokeColor={segmentColors[index % segmentColors.length]}
            strokeWidth={4}
            tappable
            onPress={() => setSelectedSegment(segment)}
          />
        ))}
        
        {/* Fallback to straight lines if no route data */}
        {!routeData && (
          <Polyline
            coordinates={coordinates}
            strokeColor="#4F46E5"
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        )}

        {trip.waypoints.map((waypoint: any, index: number) => (
          <Marker
            key={waypoint.id}
            coordinate={{
              latitude: waypoint.lat,
              longitude: waypoint.lng,
            }}
            title={waypoint.name}
            description={`Stop ${waypoint.order}`}
            pinColor={index === 0 ? 'green' : index === trip.waypoints.length - 1 ? 'red' : '#4F46E5'}
          />
        ))}
      </MapView>

      {/* Route info header */}
      {routeData && (
        <View style={styles.routeInfo}>
          <Text style={styles.routeInfoTitle}>Walking Route</Text>
          <Text style={styles.routeInfoText}>
            {formatDuration(routeData.total_duration_seconds)} • {formatDistance(routeData.total_distance_meters)}
          </Text>
        </View>
      )}

      {/* Selected segment info */}
      {selectedSegment && (
        <TouchableOpacity 
          style={styles.segmentInfo}
          onPress={() => setSelectedSegment(null)}
        >
          <Text style={styles.segmentInfoTitle}>
            {selectedSegment.from_name} → {selectedSegment.to_name}
          </Text>
          <Text style={styles.segmentInfoText}>
            🚶 {selectedSegment.duration_text || formatDuration(selectedSegment.duration_seconds)} • {selectedSegment.distance_text || formatDistance(selectedSegment.distance_meters)}
          </Text>
          <Text style={styles.tapToDismiss}>Tap to dismiss</Text>
        </TouchableOpacity>
      )}

      <View style={styles.legend}>
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
        {routeData && (
          <View style={styles.legendItem}>
            <View style={[styles.legendLine]} />
            <Text style={styles.legendText}>Walking path</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  legend: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#111827',
  },
  legendLine: {
    width: 20,
    height: 4,
    backgroundColor: '#4F46E5',
    borderRadius: 2,
    marginRight: 8,
  },
  routeInfo: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  routeInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  routeInfoText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  segmentInfo: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  segmentInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  segmentInfoText: {
    fontSize: 14,
    color: '#E0E7FF',
    marginTop: 4,
  },
  tapToDismiss: {
    fontSize: 12,
    color: '#C7D2FE',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
