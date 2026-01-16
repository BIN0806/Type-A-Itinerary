import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type TimelineScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Timeline'>;
  route: RouteProp<RootStackParamList, 'Timeline'>;
};

export const TimelineScreen: React.FC<TimelineScreenProps> = ({
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const calculateWalkingTime = (fromTime: string, toTime: string) => {
    const from = new Date(fromTime);
    const to = new Date(toTime);
    const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
    return minutes;
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
        <Text style={styles.tripInfo}>
          Total time: {trip.total_time_minutes} minutes • {trip.waypoints.length} stops
        </Text>
      </View>

      <ScrollView style={styles.timeline}>
        {trip.waypoints.map((waypoint: any, index: number) => (
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
              <View style={styles.walkingSegment}>
                <View style={styles.walkingDots}>
                  <View style={styles.walkingDot} />
                  <View style={styles.walkingDot} />
                  <View style={styles.walkingDot} />
                </View>
                <Text style={styles.walkingText}>
                  Walking • {calculateWalkingTime(
                    waypoint.departure_time,
                    trip.waypoints[index + 1].arrival_time
                  )} min
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('MapView', { tripId })}
        >
          <Text style={styles.buttonText}>View on Map</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('Navigation', { tripId })}
        >
          <Text style={[styles.buttonText, styles.buttonPrimaryText]}>
            Start Navigation
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
  tripInfo: {
    fontSize: 14,
    color: '#6B7280',
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
  walkingSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 56,
    paddingVertical: 12,
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
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  button: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  buttonPrimary: {
    backgroundColor: '#4F46E5',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  buttonPrimaryText: {
    color: '#fff',
  },
});
