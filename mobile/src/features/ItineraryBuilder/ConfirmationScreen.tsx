import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
  FlatList,
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

interface Alternative {
  name: string;
  address?: string;
  google_place_id: string;
  lat: number;
  lng: number;
  rating?: number;
  user_ratings_total?: number;
}

interface Candidate {
  name: string;
  description?: string;
  confidence: number;
  google_place_id: string;
  lat: number;
  lng: number;
  address?: string;
  rating?: number;
  opening_hours?: any;
  alternatives?: Alternative[];
  original_query?: string;
}

export const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({
  navigation,
  route,
}) => {
  const { jobId } = route.params;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmed, setConfirmed] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingName, setEditingName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const swiperRef = useRef<any>(null);

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

    // Timeout after 60 seconds (reasonable with optimized backend)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (isLoading) {
        Alert.alert('Timeout', 'Analysis is taking longer than expected');
        navigation.goBack();
      }
    }, 60000);
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

  const handleShowAlternatives = (index: number) => {
    const candidate = candidates[index];
    if (candidate.alternatives && candidate.alternatives.length > 0) {
      setSelectedCardIndex(index);
      setShowAlternatives(true);
    } else {
      Alert.alert('No Alternatives', 'No similar locations found for this place.');
    }
  };

  const handleSelectAlternative = (alternative: Alternative) => {
    if (selectedCardIndex !== null) {
      // Update the candidate with the selected alternative
      const updatedCandidate: Candidate = {
        ...candidates[selectedCardIndex],
        name: alternative.name,
        google_place_id: alternative.google_place_id,
        lat: alternative.lat,
        lng: alternative.lng,
        address: alternative.address,
        rating: alternative.rating,
      };
      
      const newCandidates = [...candidates];
      newCandidates[selectedCardIndex] = updatedCandidate;
      setCandidates(newCandidates);
    }
    setShowAlternatives(false);
    setSelectedCardIndex(null);
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

  const renderAlternativeItem = ({ item, index }: { item: Alternative; index: number }) => (
    <TouchableOpacity
      style={styles.alternativeItem}
      onPress={() => handleSelectAlternative(item)}
    >
      <View style={styles.alternativeContent}>
        <View style={styles.alternativeRank}>
          <Text style={styles.alternativeRankText}>{index + 2}</Text>
        </View>
        <View style={styles.alternativeDetails}>
          <Text style={styles.alternativeName}>{item.name}</Text>
          {item.address && (
            <Text style={styles.alternativeAddress} numberOfLines={2}>
              {item.address}
            </Text>
          )}
          {item.rating && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingText}>★ {item.rating.toFixed(1)}</Text>
              {item.user_ratings_total && (
                <Text style={styles.ratingCount}>
                  ({item.user_ratings_total.toLocaleString()} reviews)
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Analyzing your photos...</Text>
        <Text style={styles.loadingSubtext}>Processing images in parallel for speed</Text>
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

  const currentCandidate = candidates[currentIndex];
  const hasAlternatives = currentCandidate?.alternatives && currentCandidate.alternatives.length > 0;

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
          ref={swiperRef}
          cards={candidates}
          renderCard={(card: Candidate, index: number) => (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{card.name}</Text>
                {card.address && (
                  <Text style={styles.cardAddress}>{card.address}</Text>
                )}
                <View style={styles.cardMeta}>
                  <Text style={styles.cardConfidence}>
                    Confidence: {Math.round(card.confidence * 100)}%
                  </Text>
                  {card.rating && (
                    <Text style={styles.cardRating}>★ {card.rating.toFixed(1)}</Text>
                  )}
                </View>
                {card.description && (
                  <Text style={styles.cardDescription}>{card.description}</Text>
                )}
                
                {/* Alternatives indicator */}
                {card.alternatives && card.alternatives.length > 0 && (
                  <View style={styles.alternativesIndicator}>
                    <Text style={styles.alternativesText}>
                      +{card.alternatives.length} similar places found
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.cardButtons}>
                {card.alternatives && card.alternatives.length > 0 && (
                  <TouchableOpacity
                    style={styles.alternativesButton}
                    onPress={() => handleShowAlternatives(index)}
                  >
                    <Text style={styles.alternativesButtonText}>
                      See {card.alternatives.length} Alternatives
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleEdit}
                >
                  <Text style={styles.editButtonText}>Edit Name</Text>
                </TouchableOpacity>
              </View>
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

      {/* Edit Name Modal */}
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

      {/* Alternatives Modal */}
      {showAlternatives && selectedCardIndex !== null && (
        <View style={styles.modal}>
          <View style={styles.alternativesModal}>
            <View style={styles.alternativesHeader}>
              <Text style={styles.alternativesTitle}>
                Choose Location
              </Text>
              <Text style={styles.alternativesSubtitle}>
                Select the correct "{candidates[selectedCardIndex].original_query || candidates[selectedCardIndex].name}"
              </Text>
            </View>

            {/* Current Selection (Primary) */}
            <TouchableOpacity
              style={[styles.alternativeItem, styles.primaryItem]}
              onPress={() => {
                setShowAlternatives(false);
                setSelectedCardIndex(null);
              }}
            >
              <View style={styles.alternativeContent}>
                <View style={[styles.alternativeRank, styles.primaryRank]}>
                  <Text style={styles.alternativeRankText}>1</Text>
                </View>
                <View style={styles.alternativeDetails}>
                  <Text style={styles.alternativeName}>
                    {candidates[selectedCardIndex].name}
                  </Text>
                  {candidates[selectedCardIndex].address && (
                    <Text style={styles.alternativeAddress} numberOfLines={2}>
                      {candidates[selectedCardIndex].address}
                    </Text>
                  )}
                  <Text style={styles.primaryBadge}>Current selection</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Alternatives List */}
            <FlatList
              data={candidates[selectedCardIndex].alternatives}
              renderItem={renderAlternativeItem}
              keyExtractor={(item) => item.google_place_id}
              style={styles.alternativesList}
              showsVerticalScrollIndicator={false}
            />

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowAlternatives(false);
                setSelectedCardIndex(null);
              }}
            >
              <Text style={styles.closeButtonText}>Keep Current Selection</Text>
            </TouchableOpacity>
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
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardConfidence: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  cardRating: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '600',
    marginLeft: 16,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    lineHeight: 20,
  },
  alternativesIndicator: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  alternativesText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
    textAlign: 'center',
  },
  cardButtons: {
    gap: 8,
  },
  alternativesButton: {
    backgroundColor: '#4F46E5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  alternativesButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  // Alternatives Modal Styles
  alternativesModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    padding: 20,
  },
  alternativesHeader: {
    marginBottom: 16,
  },
  alternativesTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  alternativesSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  alternativesList: {
    maxHeight: 300,
  },
  alternativeItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryItem: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
    marginBottom: 16,
  },
  alternativeContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alternativeRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  primaryRank: {
    backgroundColor: '#4F46E5',
  },
  alternativeRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  alternativeDetails: {
    flex: 1,
  },
  alternativeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  alternativeAddress: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  primaryBadge: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '500',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
  },
  ratingCount: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  closeButton: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
});
