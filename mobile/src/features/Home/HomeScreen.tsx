import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { SafeAreaView } from 'react-native-safe-area-context';

type HomeScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
    const handleCreateTrips = () => {
        navigation.navigate('Upload');
    };

    const handlePastTrips = () => {
        Alert.alert('Coming Soon', 'Past Trips feature is coming soon!');
    };

    const handleAddCredits = () => {
        Alert.alert('Coming Soon', 'Add Credits feature is coming soon!');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Plan_A</Text>
                <Text style={styles.tagline}>Created for Type A, Enjoyed by Everyone</Text>

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
                </View>
            </View>
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
    },
    title: {
        fontSize: 56,
        fontWeight: 'bold',
        color: '#4F46E5',
        textAlign: 'center',
        marginBottom: 12,
    },
    tagline: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginBottom: 64,
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
});
