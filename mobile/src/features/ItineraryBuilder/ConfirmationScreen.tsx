import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Swiper from 'react-native-deck-swiper';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type ConfirmationScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Confirmation'>;
  route: RouteProp<RootStackParamList, 'Confirmation'>;
};

export const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({
  navigation,
  route,
}) => {
  const { jobId } = route.params;
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmed, setConfirmed] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingName, setEditingName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    pollForCandidates();
  }, []);

  const pollForCandidates = async () => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await apiService.getJobStatus(jobId);
        
        if (statusResponse.status === 'completed') {
          clearInterval(pollInterval);
          const candidatesResponse = await apiService.getCandidates(jobId);
          setCandidates(candidatesResponse.candidates);
          setIsLoading(false);
        } else if (statusResponse.status === 'failed') {
          clearInterval(pollInterval);
          Alert.alert('Error', 'Image analysis failed. Please try again.');
          navigation.goBack();
        }
      } catch (error) {
        clearInterval(pollInterval);
        Alert.alert('Error', 'Could not fetch analysis results');
        navigation.goBack();
      }
    }, 2000);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isLoading) {
        Alert.alert('Timeout', 'Analysis is taking longer than expected');
        navigation.goBack();
      }
    }, 120000);
  };

  const handleSwipeRight = (index: number) => {
    const candidate = candidates[index];
    setConfirmed(prev => [...prev, {
      name: candidate.name,
      google_place_id: candidate.google_place_id,
      lat: candidate.lat,
      lng: candidate.lng,
      estimated_stay_duration: 60,
    }]);
  };

  const handleSwipeLeft = (index: number) => {
    // Rejected - do nothing
  };

  const handleEdit = () => {
    const candidate = candidates[currentIndex];
    setEditingName(candidate.name);
    setIsEditMode(true);
  };

  const handleSaveEdit = () => {
    if (editingName.trim()) {
      const updatedCandidate = { ...candidates[currentIndex], name: editingName.trim() };
      const newCandidates = [...candidates];
      newCandidates[currentIndex] = updatedCandidate;
      setCandidates(newCandidates);
    }
    setIsEditMode(false);
  };

  const handleFinish = async () => {
    if (confirmed.length === 0) {
      Alert.alert('No Locations', 'Please confirm at least one location');
      return;
    }

    try {
      const response = await apiService.confirmWaypoints(
        jobId,
        confirmed,
        'My Trip'
      );
      navigation.navigate('Constraints', { tripId: response.id });
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Could not create trip'
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Analyzing your photos...</Text>
        <Text style={styles.loadingSubtext}>This may take a moment</Text>
      </View>
    );
  }

  if (candidates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No locations found</Text>
        <Text style={styles.emptySubtext}>
          Try uploading photos with visible location names or landmarks
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Confirm Locations</Text>
        <Text style={styles.subtitle}>
          Swipe right to confirm, left to skip
        </Text>
        <Text style={styles.counter}>
          {confirmed.length} confirmed • {currentIndex + 1}/{candidates.length}
        </Text>
      </View>

      <View style={styles.swiperContainer}>
        <Swiper
          cards={candidates}
          renderCard={(card) => (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{card.name}</Text>
                {card.address && (
                  <Text style={styles.cardAddress}>{card.address}</Text>
                )}
                <Text style={styles.cardConfidence}>
                  Confidence: {Math.round(card.confidence * 100)}%
                </Text>
                {card.description && (
                  <Text style={styles.cardDescription}>{card.description}</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEdit}
              >
                <Text style={styles.editButtonText}>Edit Name</Text>
              </TouchableOpacity>
            </View>
          )}
          onSwipedRight={handleSwipeRight}
          onSwipedLeft={handleSwipeLeft}
          onSwiped={(index) => setCurrentIndex(index + 1)}
          cardIndex={0}
          backgroundColor="transparent"
          stackSize={3}
          stackScale={10}
          stackSeparation={15}
          animateCardOpacity
          overlayLabels={{
            left: {
              title: 'SKIP',
              style: {
                label: {
                  backgroundColor: '#EF4444',
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 'bold',
                  borderRadius: 8,
                  padding: 10,
                },
                wrapper: {
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-start',
                  marginTop: 30,
                  marginLeft: -30,
                },
              },
            },
            right: {
              title: 'CONFIRM',
              style: {
                label: {
                  backgroundColor: '#10B981',
                  color: '#fff',
                  fontSize: 24,
                  fontWeight: 'bold',
                  borderRadius: 8,
                  padding: 10,
                },
                wrapper: {
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  marginTop: 30,
                  marginLeft: 30,
                },
              },
            },
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.finishButton, confirmed.length === 0 && styles.finishButtonDisabled]}
        onPress={handleFinish}
        disabled={confirmed.length === 0}
      >
        <Text style={styles.finishButtonText}>
          Continue with {confirmed.length} location{confirmed.length !== 1 ? 's' : ''}
        </Text>
      </TouchableOpacity>

      {isEditMode && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Location Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editingName}
              onChangeText={setEditingName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setIsEditMode(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveEdit}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  counter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  swiperContainer: {
    flex: 1,
    paddingTop: 20,
  },
  card: {
    flex: 0.75,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardContent: {
    flex: 1,
  },
  cardName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  cardAddress: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  cardConfidence: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    lineHeight: 20,
  },
  editButton: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#4F46E5',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  finishButtonDisabled: {
    opacity: 0.5,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonSave: {
    backgroundColor: '#4F46E5',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});
