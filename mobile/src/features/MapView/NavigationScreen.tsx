import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type NavigationScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Navigation'>;
  route: RouteProp<RootStackParamList, 'Navigation'>;
};

export const NavigationScreen: React.FC<NavigationScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<any>(null);
  const [mapsLink, setMapsLink] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentStop, setCurrentStop] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tripResponse, linkResponse] = await Promise.all([
        apiService.getTrip(tripId),
        apiService.getMapsLink(tripId),
      ]);
      
      setTrip(tripResponse);
      setMapsLink(linkResponse.url);
    } catch (error: any) {
      Alert.alert('Error', 'Could not load navigation data');
    } finally {
      setIsLoading(false);
    }
  };

  const openInGoogleMaps = async () => {
    if (!mapsLink) {
      Alert.alert('Error', 'Navigation link not available');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(mapsLink);
      if (supported) {
        await Linking.openURL(mapsLink);
      } else {
        Alert.alert('Error', 'Could not open Google Maps');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open navigation');
    }
  };

  const handleNext = () => {
    if (trip && currentStop < trip.waypoints.length - 1) {
      setCurrentStop(currentStop + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStop > 0) {
      setCurrentStop(currentStop - 1);
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
        <Text style={styles.emptyText}>No navigation data available</Text>
      </View>
    );
  }

  const currentWaypoint = trip.waypoints[currentStop];
  const nextWaypoint = currentStop < trip.waypoints.length - 1 
    ? trip.waypoints[currentStop + 1] 
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepIndicator}>
          Stop {currentStop + 1} of {trip.waypoints.length}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.currentStop}>
          <Text style={styles.label}>Current Destination</Text>
          <Text style={styles.currentName}>{currentWaypoint.name}</Text>
          {currentWaypoint.address && (
            <Text style={styles.currentAddress}>{currentWaypoint.address}</Text>
          )}
          <Text style={styles.currentTime}>
            Arrive: {new Date(currentWaypoint.arrival_time).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })}
          </Text>
          <Text style={styles.currentStay}>
            Stay for {currentWaypoint.estimated_stay_duration || 60} minutes
          </Text>
        </View>

        {nextWaypoint && (
          <View style={styles.nextStop}>
            <Text style={styles.label}>Next Up</Text>
            <Text style={styles.nextName}>{nextWaypoint.name}</Text>
            <Text style={styles.nextTime}>
              Arrive: {new Date(nextWaypoint.arrival_time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })}
            </Text>
          </View>
        )}

        {!nextWaypoint && (
          <View style={styles.finalStop}>
            <Text style={styles.finalText}>🎉 This is your final stop!</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.navigationButtons}>
          <TouchableOpacity
            style={[styles.navButton, currentStop === 0 && styles.navButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentStop === 0}
          >
            <Text style={styles.navButtonText}>← Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButton, !nextWaypoint && styles.navButtonDisabled]}
            onPress={handleNext}
            disabled={!nextWaypoint}
          >
            <Text style={styles.navButtonText}>Next →</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.mapsButton}
          onPress={openInGoogleMaps}
        >
          <Text style={styles.mapsButtonText}>
            Open in Google Maps
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  currentStop: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  currentName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  currentAddress: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  currentTime: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 8,
  },
  currentStay: {
    fontSize: 14,
    color: '#6B7280',
  },
  nextStop: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 20,
  },
  nextName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  nextTime: {
    fontSize: 14,
    color: '#6B7280',
  },
  finalStop: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  finalText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#059669',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  mapsButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mapsButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
