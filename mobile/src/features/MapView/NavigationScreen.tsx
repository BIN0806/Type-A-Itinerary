import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  Modal,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';
import {
  requestNotificationPermissions,
  scheduleFiveMinuteWarning,
  cancelScheduledNotification,
  addNotificationResponseListener,
} from '../../services/notificationService';

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

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState('15');

  // Refs for timer management
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fiveMinWarningShown = useRef(false);
  const notificationIdRef = useRef<string | null>(null);
  const initialDurationRef = useRef<number>(60); // Track initial duration for reset

  useEffect(() => {
    loadData();
    requestNotificationPermissions();

    // Listen for notification taps to show extend modal
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'five-minute-warning') {
        setShowExtendModal(true);
      }
    });

    return () => {
      subscription.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      if (notificationIdRef.current) {
        cancelScheduledNotification(notificationIdRef.current);
      }
    };
  }, []);

  // Override back button to go to PastTrips (reset stack to prevent duplicates)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.reset({
            index: 1,
            routes: [
              { name: 'Home' },
              { name: 'PastTrips' },
            ],
          })}
          style={{ paddingHorizontal: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
      stopTimer();
      setCurrentStop(currentStop - 1);
    }
  };

  // Timer functions
  const startTimer = (durationMinutes: number) => {
    const totalSeconds = durationMinutes * 60;
    initialDurationRef.current = durationMinutes;
    setRemainingSeconds(totalSeconds);
    setIsTimerRunning(true);
    setIsPaused(false);
    fiveMinWarningShown.current = false;

    // Schedule 5-minute warning notification
    if (totalSeconds > 300) {
      const secondsUntilWarning = totalSeconds - 300;
      const currentWaypoint = trip?.waypoints?.[currentStop];
      scheduleFiveMinuteWarning(
        currentWaypoint?.name || 'this location',
        secondsUntilWarning
      ).then((id) => {
        notificationIdRef.current = id;
      });
    }
  };

  const pauseTimer = () => {
    setIsPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Cancel notification while paused
    if (notificationIdRef.current) {
      cancelScheduledNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  };

  const resumeTimer = () => {
    setIsPaused(false);
    // Reschedule notification if more than 5 min remaining
    if (remainingSeconds && remainingSeconds > 300) {
      const currentWaypoint = trip?.waypoints?.[currentStop];
      scheduleFiveMinuteWarning(
        currentWaypoint?.name || 'this location',
        remainingSeconds - 300
      ).then((id) => {
        notificationIdRef.current = id;
      });
    }
  };

  const resetTimer = () => {
    const totalSeconds = initialDurationRef.current * 60;
    setRemainingSeconds(totalSeconds);
    setIsPaused(false);
    fiveMinWarningShown.current = false;

    // Cancel old notification and reschedule
    if (notificationIdRef.current) {
      cancelScheduledNotification(notificationIdRef.current);
    }
    if (totalSeconds > 300) {
      const currentWaypoint = trip?.waypoints?.[currentStop];
      scheduleFiveMinuteWarning(
        currentWaypoint?.name || 'this location',
        totalSeconds - 300
      ).then((id) => {
        notificationIdRef.current = id;
      });
    }
  };

  const finishedEarly = () => {
    // Stop current timer
    setIsTimerRunning(false);
    setIsPaused(false);
    setRemainingSeconds(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (notificationIdRef.current) {
      cancelScheduledNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }

    // Move to next stop if available
    if (trip && currentStop < trip.waypoints.length - 1) {
      setCurrentStop(currentStop + 1);
      Alert.alert(
        'Moving On!',
        'Great! Moving to your next destination.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Trip Complete!',
        "You've finished all your stops!",
        [{ text: 'OK' }]
      );
    }
  };

  const stopTimer = () => {
    setIsTimerRunning(false);
    setIsPaused(false);
    setRemainingSeconds(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (notificationIdRef.current) {
      cancelScheduledNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  };

  const extendTime = () => {
    const additionalMinutes = parseInt(extensionMinutes, 10) || 15;
    const additionalSeconds = additionalMinutes * 60;

    setRemainingSeconds((prev) => (prev || 0) + additionalSeconds);
    fiveMinWarningShown.current = false;
    setShowExtendModal(false);
    setExtensionMinutes('15');

    // Reschedule notification if we now have more than 5 min
    if (notificationIdRef.current) {
      cancelScheduledNotification(notificationIdRef.current);
    }
    const newRemaining = (remainingSeconds || 0) + additionalSeconds;
    if (newRemaining > 300) {
      const currentWaypoint = trip?.waypoints?.[currentStop];
      scheduleFiveMinuteWarning(
        currentWaypoint?.name || 'this location',
        newRemaining - 300
      ).then((id) => {
        notificationIdRef.current = id;
      });
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer countdown effect
  useEffect(() => {
    if (!isTimerRunning || remainingSeconds === null || isPaused) return;

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 0) {
          setIsTimerRunning(false);
          if (timerRef.current) clearInterval(timerRef.current);
          Alert.alert(
            'Time\'s Up!',
            'Your planned stay at this location has ended.',
            [{ text: 'OK' }]
          );
          return 0;
        }

        const next = prev - 1;

        // 5-minute warning - show extend modal
        if (next === 300 && !fiveMinWarningShown.current) {
          fiveMinWarningShown.current = true;
          setShowExtendModal(true);
        }

        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, isPaused]);

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

          {/* Timer Display */}
          {isTimerRunning && remainingSeconds !== null ? (
            <View style={styles.timerContainer} testID="timer-display">
              <Text style={[
                styles.timerText,
                remainingSeconds <= 300 && styles.timerTextWarning,
                isPaused && styles.timerTextPaused
              ]}>
                {formatTimeRemaining(remainingSeconds)}
              </Text>
              <Text style={styles.timerLabel}>
                {isPaused ? 'paused' : 'remaining'}
              </Text>

              {/* Timer Control Buttons */}
              <View style={styles.timerControlsRow}>
                {/* Pause / Resume Button */}
                <TouchableOpacity
                  style={styles.timerControlButton}
                  onPress={isPaused ? resumeTimer : pauseTimer}
                  testID="pause-timer-button"
                >
                  <Text style={styles.timerControlButtonText}>
                    {isPaused ? 'Resume' : 'Pause'}
                  </Text>
                </TouchableOpacity>

                {/* Reset Button */}
                <TouchableOpacity
                  style={styles.timerControlButton}
                  onPress={resetTimer}
                  testID="reset-timer-button"
                >
                  <Text style={styles.timerControlButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>

              {/* Finished Early Button */}
              <TouchableOpacity
                style={styles.finishedEarlyButton}
                onPress={finishedEarly}
                testID="finished-early-button"
              >
                <Text style={styles.finishedEarlyButtonText}>✓ Finished Early</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.timerContainer}>
              <Text style={styles.currentStay}>
                Stay for {currentWaypoint.estimated_stay_duration || 60} minutes
              </Text>
              <TouchableOpacity
                style={styles.startTimerButton}
                onPress={() => startTimer(currentWaypoint.estimated_stay_duration || 60)}
                testID="start-timer-button"
              >
                <Text style={styles.startTimerButtonText}>⏱ Start Timer</Text>
              </TouchableOpacity>
            </View>
          )}
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

      {/* Extend Time Modal */}
      <Modal
        visible={showExtendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtendModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.extendModal} testID="extend-time-modal">
            <Text style={styles.extendModalTitle}>⏱ Time Check</Text>
            <Text style={styles.extendModalMessage}>
              Would you like to stay at {currentWaypoint?.name} for longer?
            </Text>

            <View style={styles.extendInputRow}>
              <Text style={styles.extendInputLabel}>Add</Text>
              <TextInput
                style={styles.extendInput}
                value={extensionMinutes}
                onChangeText={setExtensionMinutes}
                keyboardType="number-pad"
                maxLength={3}
                testID="extend-time-input"
              />
              <Text style={styles.extendInputLabel}>minutes</Text>
            </View>

            <View style={styles.extendModalButtons}>
              <TouchableOpacity
                style={styles.extendCancelButton}
                onPress={() => setShowExtendModal(false)}
              >
                <Text style={styles.extendCancelButtonText}>No Thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.extendConfirmButton}
                onPress={extendTime}
                testID="confirm-extend-button"
              >
                <Text style={styles.extendConfirmButtonText}>Add Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  // Timer styles
  timerContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4F46E5',
    fontVariant: ['tabular-nums'],
  },
  timerTextWarning: {
    color: '#DC2626',
  },
  timerLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  startTimerButton: {
    marginTop: 12,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  startTimerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopTimerButton: {
    marginTop: 12,
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  stopTimerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  extendModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
  },
  extendModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  extendModalMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  extendInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  extendInputLabel: {
    fontSize: 16,
    color: '#374151',
    marginHorizontal: 8,
  },
  extendInput: {
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '600',
    width: 80,
    textAlign: 'center',
    backgroundColor: '#EEF2FF',
  },
  extendModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  extendCancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  extendCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  extendConfirmButton: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  extendConfirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Timer control buttons
  timerTextPaused: {
    color: '#9CA3AF',
  },
  timerControlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  timerControlButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  timerControlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  finishedEarlyButton: {
    marginTop: 12,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  finishedEarlyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
