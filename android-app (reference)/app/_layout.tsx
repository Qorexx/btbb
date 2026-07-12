import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { api } from '../services/api';
import { COLORS } from '../theme/colors';

// Tell notifications how to behave when received in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Request permissions for notifications
    Notifications.requestPermissionsAsync();

    // Poll backend for pending alerts every 5 seconds
    const interval = setInterval(async () => {
      const data = await api.checkAlerts();
      if (data && data.has_alert) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: data.alert.title,
            body: data.alert.body,
            sound: true,
          },
          trigger: null, // trigger immediately
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} />
      <Stack screenOptions={{ 
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background }
      }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
