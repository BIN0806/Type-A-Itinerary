import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { UploadScreen } from '../features/ItineraryBuilder/UploadScreen';
import { ConfirmationScreen } from '../features/ItineraryBuilder/ConfirmationScreen';
import { ConstraintsScreen } from '../features/ItineraryBuilder/ConstraintsScreen';
import { TimelineScreen } from '../features/MapView/TimelineScreen';
import { MapViewScreen } from '../features/MapView/MapViewScreen';
import { NavigationScreen } from '../features/MapView/NavigationScreen';
import { LoginScreen } from '../features/Auth/LoginScreen';
import { RegisterScreen } from '../features/Auth/RegisterScreen';
import { HomeScreen } from '../features/Home/HomeScreen';
import { PastTripsScreen } from '../features/PastTrips/PastTripsScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Upload: { tripName?: string };
  Confirmation: { jobId: string; tripName?: string };
  Constraints: { tripId: string };
  Timeline: { tripId: string };
  MapView: { tripId: string };
  Navigation: { tripId: string };
  PastTrips: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#4F46E5',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Upload"
          component={UploadScreen}
          options={{ title: 'Upload Photos' }}
        />
        <Stack.Screen
          name="Confirmation"
          component={ConfirmationScreen}
          options={{ title: 'Confirm Locations' }}
        />
        <Stack.Screen
          name="Constraints"
          component={ConstraintsScreen}
          options={{ title: 'Trip Details' }}
        />
        <Stack.Screen
          name="Timeline"
          component={TimelineScreen}
          options={{ title: 'Your Itinerary' }}
        />
        <Stack.Screen
          name="MapView"
          component={MapViewScreen}
          options={{ title: 'Map View' }}
        />
        <Stack.Screen
          name="Navigation"
          component={NavigationScreen}
          options={{ title: 'Navigate' }}
        />
        <Stack.Screen
          name="PastTrips"
          component={PastTripsScreen}
          options={{ title: 'Past Trips' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
