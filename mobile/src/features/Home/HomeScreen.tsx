import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Platform,
    Modal,
    TextInput,
    KeyboardAvoidingView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../services/api';

type HomeScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [tripName, setTripName] = useState('');

    const handleCreateTrips = () => {
        setTripName('');
        setIsModalVisible(true);
    };

    const handleModalCancel = () => {
        setIsModalVisible(false);
        setTripName('');
    };

    const handleModalContinue = () => {
        const name = tripName.trim() || 'My Trip';
        setIsModalVisible(false);
        setTripName('');
        navigation.navigate('Upload', { tripName: name });
    };

    const handlePastTrips = () => {
        navigation.navigate('PastTrips');
    };

    const handleAddCredits = () => {
        Alert.alert('Coming Soon', 'Add Credits feature is coming soon!');
    };

    const handleSignOut = async () => {
        await apiService.clearToken();
        navigation.replace('Login');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.headerContainer}>
                    <Text style={styles.title}>Plan_A</Text>
                    <Text style={styles.tagline}>Created for Type A</Text>
                    <Text style={styles.tagline}>Made for Everyone</Text>
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleCreateTrips}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Create Trips</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handlePastTrips}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Past Trips</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleAddCredits}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Add Credits</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.signOutButton}
                        onPress={handleSignOut}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.signOutButtonText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Trip Name Modal */}
            <Modal
                visible={isModalVisible}
                transparent
                animationType="fade"
                onRequestClose={handleModalCancel}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Name Your Trip</Text>
                        <Text style={styles.modalSubtitle}>
                            Give your trip a memorable name
                        </Text>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g., Tokyo Adventure"
                            placeholderTextColor="#9CA3AF"
                            value={tripName}
                            onChangeText={setTripName}
                            autoFocus
                            maxLength={50}
                            returnKeyType="done"
                            onSubmitEditing={handleModalContinue}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalButtonCancel}
                                onPress={handleModalCancel}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.modalButtonContinue}
                                onPress={handleModalContinue}
                            >
                                <Text style={styles.modalButtonContinueText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        paddingBottom: 100,
    },
    headerContainer: {
        alignItems: 'center',
        marginBottom: 80,
    },
    title: {
        fontSize: 56,
        fontWeight: 'bold',
        color: '#4F46E5',
        textAlign: 'center',
        marginBottom: 16,
    },
    tagline: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 24,
    },
    buttonContainer: {
        width: '100%',
        gap: 16,
    },
    button: {
        backgroundColor: '#4F46E5',
        borderRadius: 50,
        paddingVertical: 18,
        paddingHorizontal: 32,
        alignItems: 'center',
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    signOutButton: {
        backgroundColor: 'transparent',
        borderRadius: 50,
        paddingVertical: 18,
        paddingHorizontal: 32,
        alignItems: 'center',
        marginTop: 8,
    },
    signOutButtonText: {
        color: '#EF4444',
        fontSize: 16,
        fontWeight: '500',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 24,
    },
    modalInput: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#111827',
        marginBottom: 24,
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButtonCancel: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalButtonCancelText: {
        color: '#6B7280',
        fontSize: 16,
        fontWeight: '600',
    },
    modalButtonContinue: {
        flex: 1,
        backgroundColor: '#4F46E5',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalButtonContinueText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
