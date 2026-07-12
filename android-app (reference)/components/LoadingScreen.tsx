import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { COLORS } from '../theme/colors';

const { width } = Dimensions.get('window');
const PROGRESS_WIDTH = width * 0.6; // 60% of screen width

export default function LoadingScreen() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true // reverse
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: progress.value * PROGRESS_WIDTH,
      backgroundColor: COLORS.accent,
      height: '100%',
      borderRadius: 4,
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={styles.logoContainer}>
        <Image 
          source={require('../assets/images/splash.png')} 
          style={styles.logo} 
          resizeMode="contain" 
        />
      </Animated.View>
      <View style={styles.progressTrack}>
        <Animated.View style={animatedStyle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 40,
  },
  logo: {
    width: 250,
    height: 250,
  },
  progressTrack: {
    width: PROGRESS_WIDTH,
    height: 6,
    backgroundColor: COLORS.cardBorder,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
