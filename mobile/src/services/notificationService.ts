/**
 * Notification Service for Stay Timer
 * Handles scheduling and managing notifications for the itinerary app
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/**
 * Request permission to send notifications
 * @returns true if permission was granted
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    return finalStatus === 'granted';
}

/**
 * Schedule a notification for when 5 minutes remain at a location
 * @param placeName - Name of the location
 * @param secondsUntilWarning - Seconds until the notification should fire
 * @returns notification identifier for cancellation
 */
export async function scheduleFiveMinuteWarning(
    placeName: string,
    secondsUntilWarning: number
): Promise<string> {
    // Android requires a notification channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('stay-timer', {
            name: 'Stay Timer',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4F46E5',
        });
    }

    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'Time Check ⏱',
            body: `Hi, you planned ${placeName} for 5 more minutes`,
            data: { placeName, type: 'five-minute-warning' },
            sound: 'default',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntilWarning,
        },
    });

    return id;
}

/**
 * Cancel a previously scheduled notification
 * @param notificationId - The id returned from scheduling
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Add a listener for notification responses (when user taps notification)
 * @param callback - Function to call when notification is tapped
 * @returns Subscription that should be removed on cleanup
 */
export function addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add a listener for notifications received while app is in foreground
 * @param callback - Function to call when notification is received
 * @returns Subscription that should be removed on cleanup
 */
export function addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
}
