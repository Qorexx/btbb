import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Zap, Mail, Phone, MapPin } from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { COLORS } from '../theme/colors';
import { MOCK_CITIES, api } from '../services/api';
import AnimatedPressable from '../components/AnimatedPressable';

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  const isFormValid = name.trim() && email.trim() && phone.trim() && selectedCity;

  const handleSave = async () => {
    if (!isFormValid) return;
    try {
      await AsyncStorage.multiSet([
        ['@user_name', name],
        ['@user_email', email],
        ['@user_phone', phone],
        ['@user_city', selectedCity]
      ]);
      // Save to backend
      const cityName = MOCK_CITIES.find(c => c.id === selectedCity)?.name || selectedCity;
      await api.saveProfile(name, selectedCity, cityName);
    } catch (e) {
      console.error("Backend unreachable, but continuing to dashboard anyway:", e);
    } finally {
      // ALWAYS proceed to the dashboard
      router.replace('/(tabs)');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.header}>
          <Image 
            source={require('../assets/images/logo.png')} 
            style={styles.logo} 
            resizeMode="contain" 
          />
          <Text style={styles.title}>Citizen Portal</Text>
          <Text style={styles.subtitle}>Register to access your 24-hour city dashboard.</Text>
        </Animated.View>

        <View style={styles.formSection}>
          <Animated.View entering={FadeInDown.delay(100).duration(600).springify()}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <User size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor={COLORS.textSecondary} value={name} onChangeText={setName} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(600).springify()}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Mail size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="john@example.com" placeholderTextColor={COLORS.textSecondary} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(600).springify()}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <Phone size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="+91 98765 43210" placeholderTextColor={COLORS.textSecondary} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(600).springify()}>
            <Text style={styles.label}>Select Your City</Text>
            <View style={styles.cityGrid}>
              {MOCK_CITIES.map((city) => (
                <AnimatedPressable
                  key={city.id}
                  style={[styles.cityCard, selectedCity === city.id && styles.cityCardSelected]}
                  onPress={() => setSelectedCity(city.id)}
                >
                  <MapPin size={16} color={selectedCity === city.id ? COLORS.accent : COLORS.textSecondary} />
                  <Text style={[styles.cityName, selectedCity === city.id && styles.cityTextSelected]}>{city.name}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(500).duration(600).springify()}>
          <AnimatedPressable 
            style={[styles.button, !isFormValid && styles.buttonDisabled]} 
            onPress={handleSave}
            disabled={!isFormValid}
          >
            <Text style={styles.buttonText}>Enter Dashboard</Text>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 80, height: 80, marginBottom: 16 },
  title: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: COLORS.textSecondary, fontSize: 16, textAlign: 'center', marginTop: 8 },
  formSection: { marginBottom: 24 },
  label: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBackground, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 12, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: COLORS.textPrimary },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  cityCard: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground, 
    borderWidth: 1, 
    borderColor: COLORS.cardBorder,
    padding: 12, 
    borderRadius: 8, 
    width: '48%',
    gap: 8
  },
  cityCardSelected: { borderColor: COLORS.accent, backgroundColor: '#FFF5F0' },
  cityName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  cityTextSelected: { color: COLORS.accent },
  button: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  buttonDisabled: { backgroundColor: COLORS.cardBorder, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }
});
