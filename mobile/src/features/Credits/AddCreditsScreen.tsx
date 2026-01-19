import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { apiService } from '../../services/api';

type AddCreditsScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'AddCredits'>;
};

interface TicketPackage {
    id: 'single' | 'bundle';
    tickets: number;
    price: string;
    priceValue: number;
    badge?: string;
    description: string;
}

const PACKAGES: TicketPackage[] = [
    {
        id: 'single',
        tickets: 1,
        price: '$2',
        priceValue: 200,
        description: 'Perfect for trying it out',
    },
    {
        id: 'bundle',
        tickets: 3,
        price: '$5',
        priceValue: 500,
        badge: 'BEST VALUE',
        description: 'Save 17% per ticket',
    },
];

export const AddCreditsScreen: React.FC<AddCreditsScreenProps> = ({ navigation }) => {
    const [balance, setBalance] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);

    const fetchBalance = async () => {
        try {
            const data = await apiService.getTicketBalance();
            setBalance(data.balance);
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchBalance();
        }, [])
    );

    const handlePurchase = async (pkg: TicketPackage) => {
        Alert.alert(
            'Confirm Purchase',
            `Purchase ${pkg.tickets} ticket${pkg.tickets > 1 ? 's' : ''} for ${pkg.price}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Purchase',
                    onPress: async () => {
                        setIsPurchasing(true);
                        try {
                            const result = await apiService.purchaseTickets(pkg.id);
                            setBalance(result.new_balance);
                            Alert.alert(
                                '🎉 Purchase Successful!',
                                `${result.message}\n\nNew balance: ${result.new_balance} ticket${result.new_balance !== 1 ? 's' : ''}`,
                                [{ text: 'Great!' }]
                            );
                        } catch (error: any) {
                            console.error('Purchase failed:', error);
                            Alert.alert(
                                'Purchase Failed',
                                error.response?.data?.detail || 'Something went wrong. Please try again.'
                            );
                        } finally {
                            setIsPurchasing(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.content}>
                {/* Balance Display */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Your Ticket Balance</Text>
                    {isLoading ? (
                        <ActivityIndicator size="large" color="#4F46E5" />
                    ) : (
                        <View style={styles.balanceRow}>
                            <Text style={styles.ticketEmoji}>🎟️</Text>
                            <Text style={styles.balanceNumber}>{balance}</Text>
                            <Text style={styles.balanceUnit}>ticket{balance !== 1 ? 's' : ''}</Text>
                        </View>
                    )}
                    <Text style={styles.balanceHint}>
                        1 ticket = 1 trip optimization
                    </Text>
                </View>

                {/* Package Options */}
                <Text style={styles.sectionTitle}>Purchase Tickets</Text>
                <Text style={styles.sectionSubtitle}>
                    Tickets are used to optimize your travel itineraries
                </Text>

                <View style={styles.packagesContainer}>
                    {PACKAGES.map((pkg) => (
                        <TouchableOpacity
                            key={pkg.id}
                            style={[
                                styles.packageCard,
                                pkg.badge && styles.packageCardHighlighted,
                            ]}
                            onPress={() => handlePurchase(pkg)}
                            disabled={isPurchasing}
                            activeOpacity={0.8}
                        >
                            {pkg.badge && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{pkg.badge}</Text>
                                </View>
                            )}

                            <View style={styles.packageHeader}>
                                <Text style={styles.packageTickets}>
                                    {pkg.tickets} Ticket{pkg.tickets > 1 ? 's' : ''}
                                </Text>
                                <Text style={styles.packagePrice}>{pkg.price}</Text>
                            </View>

                            <Text style={styles.packageDescription}>{pkg.description}</Text>

                            <View style={styles.purchaseButton}>
                                <Text style={styles.purchaseButtonText}>
                                    {isPurchasing ? 'Processing...' : `Buy for ${pkg.price}`}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info */}
                <View style={styles.infoSection}>
                    <Text style={styles.infoText}>
                        💡 Your first account comes with 1 free ticket to try out the service!
                    </Text>
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
        padding: 20,
    },
    balanceCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    balanceLabel: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 12,
        fontWeight: '500',
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ticketEmoji: {
        fontSize: 32,
    },
    balanceNumber: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#4F46E5',
    },
    balanceUnit: {
        fontSize: 20,
        color: '#6B7280',
        fontWeight: '500',
    },
    balanceHint: {
        marginTop: 8,
        fontSize: 12,
        color: '#9CA3AF',
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
    },
    packagesContainer: {
        gap: 16,
    },
    packageCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    packageCardHighlighted: {
        borderColor: '#4F46E5',
        backgroundColor: '#FAFAFE',
    },
    badge: {
        position: 'absolute',
        top: -10,
        right: 16,
        backgroundColor: '#4F46E5',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    packageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    packageTickets: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    packagePrice: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#4F46E5',
    },
    packageDescription: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 16,
    },
    purchaseButton: {
        backgroundColor: '#4F46E5',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    purchaseButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    infoSection: {
        marginTop: 24,
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        padding: 16,
    },
    infoText: {
        fontSize: 13,
        color: '#4F46E5',
        textAlign: 'center',
        lineHeight: 20,
    },
});
