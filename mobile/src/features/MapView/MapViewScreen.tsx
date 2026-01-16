import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
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

export const MapViewScreen: React.FC<MapViewScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTrip();
  }, []);

  const loadTrip = async () => {
    try {
      const response = await apiService.getTrip(tripId);
      setTrip(response);
    } catch (error: any) {
      Alert.alert('Error', 'Could not load trip details');
    } finally {
      setIsLoading(false);
    }
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

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
      >
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

        <Polyline
          coordinates={coordinates}
          strokeColor="#4F46E5"
          strokeWidth={3}
          lineDashPattern={[1]}
        />
      </MapView>

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
});
