import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';
import { COLORS } from '../theme/colors';
import LoadingScreen from '../components/LoadingScreen';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    try {
      const [cityId] = await Promise.all([
        AsyncStorage.getItem('@user_city'),
        new Promise(resolve => setTimeout(resolve, 2500)) // Force splash screen to stay for 2.5s
      ]);
      
      if (cityId) {
        setTarget('/(tabs)');
      } else {
        setTarget('/onboarding');
      }
    } catch (e) {
      setTarget('/onboarding');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !target) {
    return <LoadingScreen />;
  }

  return <Redirect href={target as any} />;
}
