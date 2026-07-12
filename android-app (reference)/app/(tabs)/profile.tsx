import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Switch, TextInput } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../theme/colors';
import { Activity, Clock } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  withRepeat, 
  withSequence, 
  withTiming, 
  useAnimatedStyle,
  interpolateColor
} from 'react-native-reanimated';

export default function ProfileScreen() {
  const [isHeatwave, setIsHeatwave] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoDate, setDemoDate] = useState('2024-06-15T14:00');
  
  const flash = useSharedValue(0);

  useEffect(() => {
    const loadState = async () => {
      const hw = await AsyncStorage.getItem('@is_heatwave');
      if (hw === 'true') setIsHeatwave(true);
      
      const demo = await AsyncStorage.getItem('@is_demo_mode');
      if (demo === 'true') setIsDemoMode(true);
      
      const dDate = await AsyncStorage.getItem('@demo_date');
      if (dDate) setDemoDate(dDate);
    };
    loadState();
  }, []);

  useEffect(() => {
    if (isHeatwave) {
      flash.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      flash.value = withTiming(0, { duration: 500 });
    }
  }, [isHeatwave]);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      flash.value,
      [0, 1],
      [COLORS.background, 'rgba(220, 38, 38, 0.25)']
    );
    return { backgroundColor };
  });
  
  const animatedCardStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      flash.value,
      [0, 1],
      [COLORS.cardBorder, 'rgba(220, 38, 38, 0.8)']
    );
    return { borderColor, borderWidth: isHeatwave ? 2 : 1 };
  });

  const toggleHeatwave = async (val: boolean) => {
    setIsHeatwave(val);
    if (val) {
      await AsyncStorage.setItem('@is_heatwave', 'true');
    } else {
      await AsyncStorage.removeItem('@is_heatwave');
    }
  };

  const toggleDemoMode = async (val: boolean) => {
    setIsDemoMode(val);
    if (val) {
      await AsyncStorage.setItem('@is_demo_mode', 'true');
      await AsyncStorage.setItem('@demo_date', demoDate);
    } else {
      await AsyncStorage.removeItem('@is_demo_mode');
    }
  };

  const saveDemoDate = async (text: string) => {
    setDemoDate(text);
    if (isDemoMode) {
      await AsyncStorage.setItem('@demo_date', text);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    router.replace('/onboarding');
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.text}>Profile Options</Text>
      
      <Animated.View style={[styles.card, animatedCardStyle]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Activity size={24} color={isHeatwave ? COLORS.risk.CRITICAL : COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Simulate Heatwave</Text>
            <Text style={styles.cardSubtitle}>Trigger extreme thermal stress scenario</Text>
          </View>
          <Switch
            value={isHeatwave}
            onValueChange={toggleHeatwave}
            trackColor={{ false: COLORS.cardBorder, true: COLORS.risk.CRITICAL }}
            thumbColor={'#fff'}
          />
        </View>
      </Animated.View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Clock size={24} color={isDemoMode ? COLORS.accent : COLORS.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Historical Demo Mode</Text>
            <Text style={styles.cardSubtitle}>Fetch AI predictions for a past date/time</Text>
          </View>
          <Switch
            value={isDemoMode}
            onValueChange={toggleDemoMode}
            trackColor={{ false: COLORS.cardBorder, true: COLORS.accent }}
            thumbColor={'#fff'}
          />
        </View>
        
        {isDemoMode && (
          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.cardBorder }}>
            <Text style={{ color: COLORS.textSecondary, marginBottom: 8, fontSize: 13 }}>Target Date & Time (YYYY-MM-DDTHH:MM)</Text>
            <TextInput
              style={styles.input}
              value={demoDate}
              onChangeText={saveDemoDate}
              placeholder="2024-06-15T14:00"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={{ color: COLORS.textSecondary, marginTop: 8, fontSize: 12 }}>
              Dashboard will now fetch and predict based on this historical moment.
            </Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 32 }}>
        <Button title="Log Out" color={COLORS.risk.CRITICAL} onPress={handleLogout} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 24,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    padding: 12,
    color: COLORS.textPrimary,
    fontFamily: 'monospace',
  }
});
