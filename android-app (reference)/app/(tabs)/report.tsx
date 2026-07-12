import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import * as Location from 'expo-location';
import { COLORS } from '../../theme/colors';
import { api } from '../../services/api';
import AnimatedPressable from '../../components/AnimatedPressable';
import { MapPin, CheckCircle2 } from 'lucide-react-native';

const ISSUE_TYPES = [
  'Power Outage', 
  'Voltage Fluctuations', 
  'Sparking/Fire', 
  'Downed Line',
  'Tree on Line',
  'Transformer Issue'
];

export default function ReportScreen() {
  const [selectedType, setSelectedType] = useState(ISSUE_TYPES[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const fetchLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow location access to submit precise coordinates.');
        setFetchingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setCoordinates({
        lat: location.coords.latitude,
        lng: location.coords.longitude
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch location.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleSubmit = async () => {
    if (!details.trim()) {
      Alert.alert('Error', 'Please provide some details about the issue.');
      return;
    }
    
    setSubmitting(true);
    try {
      const cityId = await AsyncStorage.getItem('@user_city') || 'lucknow';
      const reporterName = await AsyncStorage.getItem('@user_name') || 'Anonymous';
      const locationName = await AsyncStorage.getItem('@user_city') || 'Unknown location';
      
      const payload: any = {
        city_id: cityId,
        location: locationName,
        issue_type: selectedType,
        details: details,
        reporter_name: reporterName
      };

      if (coordinates) {
        payload.latitude = coordinates.lat;
        payload.longitude = coordinates.lng;
      }
      
      await api.submitReport(payload);
      
      // Show custom success modal
      setShowSuccess(true);
      
      // Reset form
      setDetails('');
      setCoordinates(null);
      setSelectedType(ISSUE_TYPES[0]);
    } catch (e) {
      Alert.alert('Error', 'Failed to submit report. Please check server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text style={styles.headerTitle}>Report Issue</Text>
          <Text style={styles.headerSubtitle}>Alert operators about local grid problems</Text>
        </Animated.View>

        <View>
          <Animated.Text entering={FadeInDown.delay(50).duration(500)} style={styles.label}>Your Location</Animated.Text>
          <Animated.View entering={FadeInDown.delay(50).duration(500)} style={styles.locationContainer}>
            <View style={styles.locationInfo}>
              <MapPin size={20} color={coordinates ? COLORS.accent : COLORS.textSecondary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.locationText, coordinates && styles.locationTextActive]}>
                  {coordinates ? 'Location Acquired' : 'No Location Provided'}
                </Text>
                {coordinates && (
                  <Text style={styles.coordText}>
                    {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                  </Text>
                )}
              </View>
            </View>
            
            <AnimatedPressable 
              style={[styles.fetchBtn, fetchingLocation && styles.fetchBtnDisabled]}
              onPress={fetchLocation}
              disabled={fetchingLocation}
            >
              {fetchingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.fetchBtnText}>Fetch Location</Text>
              )}
            </AnimatedPressable>
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={styles.label}>Issue Type</Animated.Text>
          <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.grid}>
            {ISSUE_TYPES.map(type => (
              <AnimatedPressable
                key={type}
                style={[styles.issueCard, selectedType === type && styles.issueCardSelected]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.issueText, selectedType === type && styles.issueTextSelected]}>{type}</Text>
              </AnimatedPressable>
            ))}
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(200).duration(500)} style={styles.label}>Additional Details</Animated.Text>
          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <TextInput
              style={styles.input}
              placeholder="e.g., Transformer sparking near Sector 4..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={4}
              value={details}
              onChangeText={setDetails}
            />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).duration(500).springify()}>
            <AnimatedPressable 
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? 'Submitting...' : 'Submit Report'}
              </Text>
            </AnimatedPressable>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Custom Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <CheckCircle2 size={48} color="#4CAF50" />
            </View>
            <Text style={styles.modalTitle}>Report Submitted!</Text>
            <Text style={styles.modalMessage}>
              Thank you for helping us monitor the grid. Operators have been alerted to the issue at your location.
            </Text>
            <AnimatedPressable 
              style={styles.modalButton} 
              onPress={() => setShowSuccess(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </AnimatedPressable>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '800' },
  headerSubtitle: { color: COLORS.textSecondary, fontSize: 16, marginTop: 4, marginBottom: 24 },
  label: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 16 },
  locationContainer: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },
  locationTextActive: { color: COLORS.textPrimary, fontWeight: '600' },
  coordText: { color: COLORS.accent, fontSize: 12, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  fetchBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  fetchBtnDisabled: { backgroundColor: COLORS.cardBorder },
  fetchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  issueCard: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  issueCardSelected: { borderColor: COLORS.accent, backgroundColor: '#FFF5F0' },
  issueText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  issueTextSelected: { color: COLORS.accent },
  input: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 16,
    color: COLORS.textPrimary,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top'
  },
  button: {
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: { backgroundColor: COLORS.cardBorder, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: COLORS.cardBackground, padding: 32, borderRadius: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  successIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  modalButton: { backgroundColor: COLORS.accent, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' },
  modalButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
