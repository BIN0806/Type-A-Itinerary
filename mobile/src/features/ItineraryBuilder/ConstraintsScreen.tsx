import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type ConstraintsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Constraints'>;
  route: RouteProp<RootStackParamList, 'Constraints'>;
};

export const ConstraintsScreen: React.FC<ConstraintsScreenProps> = ({
  navigation,
  route,
}) => {
  const { tripId } = route.params;
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [walkingSpeed, setWalkingSpeed] = useState<'slow' | 'moderate' | 'fast'>('moderate');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = async () => {
    if (!startLat || !startLng) {
      Alert.alert('Missing Info', 'Please enter start location coordinates');
      return;
    }

    const lat = parseFloat(startLat);
    const lng = parseFloat(startLng);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert('Invalid Coordinates', 'Please enter valid latitude and longitude');
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

      const response = await apiService.optimizeTrip(tripId, {
        start_location: { lat, lng },
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        walking_speed: walkingSpeed,
      });

      Alert.alert(
        'Optimization Complete',
        `Your itinerary has been optimized! Total time: ${response.total_time_minutes} minutes`,
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Trip Details</Text>
        <Text style={styles.subtitle}>
          Set your starting point and time preferences
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Starting Location</Text>
          <Text style={styles.sectionSubtitle}>
            Enter the coordinates where you'll start your journey
          </Text>
          
          <TextInput
            style={styles.input}
            placeholder="Latitude (e.g., 35.6762)"
            value={startLat}
            onChangeText={setStartLat}
            keyboardType="numeric"
          />
          
          <TextInput
            style={styles.input}
            placeholder="Longitude (e.g., 139.6503)"
            value={startLng}
            onChangeText={setStartLng}
            keyboardType="numeric"
          />
        </View>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Walking Speed</Text>
          
          <View style={styles.speedButtons}>
            <TouchableOpacity
              style={[
                styles.speedButton,
                walkingSpeed === 'slow' && styles.speedButtonActive
              ]}
              onPress={() => setWalkingSpeed('slow')}
            >
              <Text style={[
                styles.speedButtonText,
                walkingSpeed === 'slow' && styles.speedButtonTextActive
              ]}>
                Slow
              </Text>
              <Text style={styles.speedButtonSubtext}>1.2 m/s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.speedButton,
                walkingSpeed === 'moderate' && styles.speedButtonActive
              ]}
              onPress={() => setWalkingSpeed('moderate')}
            >
              <Text style={[
                styles.speedButtonText,
                walkingSpeed === 'moderate' && styles.speedButtonTextActive
              ]}>
                Moderate
              </Text>
              <Text style={styles.speedButtonSubtext}>1.4 m/s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.speedButton,
                walkingSpeed === 'fast' && styles.speedButtonActive
              ]}
              onPress={() => setWalkingSpeed('fast')}
            >
              <Text style={[
                styles.speedButtonText,
                walkingSpeed === 'fast' && styles.speedButtonTextActive
              ]}>
                Fast
              </Text>
              <Text style={styles.speedButtonSubtext}>1.6 m/s</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.optimizeButton, isOptimizing && styles.optimizeButtonDisabled]}
          onPress={handleOptimize}
          disabled={isOptimizing}
        >
          <Text style={styles.optimizeButtonText}>
            {isOptimizing ? 'Optimizing Route...' : 'Optimize Route'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
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
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
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
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
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
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  speedButtonActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  speedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  speedButtonTextActive: {
    color: '#4F46E5',
  },
  speedButtonSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  optimizeButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  optimizeButtonDisabled: {
    opacity: 0.6,
  },
  optimizeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
