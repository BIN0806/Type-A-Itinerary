import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type PastTripsScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PastTrips'>;
};

interface Trip {
    id: string;
    name: string;
    status: string;
    created_at: string;
    total_time_minutes?: number;
    waypoints?: any[];
}

export const PastTripsScreen: React.FC<PastTripsScreenProps> = ({ navigation }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadTrips = async () => {
        try {
            const data = await apiService.listTrips();
            // Sort by created_at descending (most recent first)
            const sorted = data.sort((a: Trip, b: Trip) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setTrips(sorted);
        } catch (error) {
            console.error('Failed to load trips:', error);
            Alert.alert('Error', 'Failed to load trips. Please try again.');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // Reload trips when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            loadTrips();
        }, [])
    );

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadTrips();
    };

    const handleDeleteTrip = (trip: Trip) => {
        Alert.alert(
            'Delete Trip',
            `Are you sure you want to delete "${trip.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await apiService.deleteTrip(trip.id);
                            setTrips(prev => prev.filter(t => t.id !== trip.id));
                        } catch (error) {
                            console.error('Failed to delete trip:', error);
                            Alert.alert('Error', 'Failed to delete trip. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleTripPress = (trip: Trip) => {
        if (trip.status === 'optimized') {
            // Finished trip - go to Timeline
            navigation.navigate('Timeline', { tripId: trip.id });
        } else {
            // In progress (draft) - go to Constraints
            navigation.navigate('Constraints', { tripId: trip.id });
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const isFinished = status === 'optimized';
        return {
            text: isFinished ? 'Finished' : 'In Progress',
            style: isFinished ? styles.statusFinished : styles.statusInProgress,
            textStyle: isFinished ? styles.statusFinishedText : styles.statusInProgressText,
        };
    };

    const renderTripItem = ({ item }: { item: Trip }) => {
        const badge = getStatusBadge(item.status);

        return (
            <TouchableOpacity
                style={styles.tripCard}
                onPress={() => handleTripPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.tripInfo}>
                    <Text style={styles.tripName} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <View style={styles.tripMeta}>
                        <Text style={styles.tripDate}>{formatDate(item.created_at)}</Text>
                        {item.waypoints && item.waypoints.length > 0 && (
                            <View style={styles.locationBadge}>
                                <Text style={styles.locationBadgeText}>
                                    {item.waypoints.length} Locations
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.tripActions}>
                    <View style={[styles.statusBadge, badge.style]}>
                        <Text style={badge.textStyle}>{badge.text}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteTrip(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🗺️</Text>
            <Text style={styles.emptyStateTitle}>No trips yet</Text>
            <Text style={styles.emptyStateSubtitle}>
                Create your first trip to get started!
            </Text>
            <TouchableOpacity
                style={styles.createButton}
                onPress={() => navigation.navigate('Home')}
            >
                <Text style={styles.createButtonText}>Create Trip</Text>
            </TouchableOpacity>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={styles.loadingText}>Loading trips...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={trips}
                renderItem={renderTripItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                    styles.listContent,
                    trips.length === 0 && styles.emptyListContent,
                ]}
                ListEmptyComponent={renderEmptyState}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor="#4F46E5"
                    />
                }
                ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
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
        backgroundColor: '#F9FAFB',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#6B7280',
    },
    listContent: {
        padding: 16,
    },
    emptyListContent: {
        flex: 1,
    },
    tripCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    tripInfo: {
        flex: 1,
        marginRight: 12,
    },
    tripName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    tripDate: {
        fontSize: 14,
        color: '#6B7280',
    },
    tripMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    locationBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    locationBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4F46E5',
    },
    tripActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusFinished: {
        backgroundColor: '#D1FAE5',
    },
    statusInProgress: {
        backgroundColor: '#FEF3C7',
    },
    statusFinishedText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#059669',
    },
    statusInProgressText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#D97706',
    },
    deleteButton: {
        padding: 8,
    },
    deleteButtonText: {
        fontSize: 20,
        color: '#9CA3AF',
        fontWeight: '300',
    },
    separator: {
        height: 12,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyStateIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyStateTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8,
    },
    emptyStateSubtitle: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
    },
    createButton: {
        backgroundColor: '#4F46E5',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 28,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
