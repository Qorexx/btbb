import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions, Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, Info, MapPin } from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '../../theme/colors';
import { api } from '../../services/api';
import LoadingScreen from '../../components/LoadingScreen';

const screenWidth = Dimensions.get('window').width;

export default function HomeDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cityData, setCityData] = useState<any>(null);
  const [forecast, setForecast] = useState<any[]>([]);
  const [explainability, setExplainability] = useState<any>(null);

  const fetchData = async () => {
    try {
      const cityId = await AsyncStorage.getItem('@user_city') || 'lucknow';
      const isHw = await AsyncStorage.getItem('@is_heatwave') === 'true';
      
      const [pred, fc, exp] = await Promise.all([
        api.getPrediction(cityId, isHw),
        api.getForecast(cityId, isHw),
        api.getExplainability(cityId, isHw)
      ]);
      setCityData(pred);
      setForecast(fc);
      setExplainability(exp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  const getRiskColor = (level: string) => {
    return COLORS.risk[level as keyof typeof COLORS.risk] || COLORS.risk.LOW;
  };

  const riskColor = getRiskColor(cityData?.risk_level);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
        <Image 
          source={require('../../assets/images/logo.png')} 
          style={styles.logo} 
          resizeMode="contain" 
        />
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>My Grid Dashboard</Text>
          <View style={styles.locationBadge}>
            <MapPin size={16} color={COLORS.textSecondary} />
            <Text style={styles.headerSubtitle}>{cityData?.city_name || 'Loading...'} • {cityData?.discom || 'Loading...'}</Text>
          </View>
        </View>
      </Animated.View>

      {/* Hero Risk Zone */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)} style={[styles.card, { borderTopWidth: 4, borderTopColor: riskColor }]}>
        <View style={styles.riskHeader}>
          <Text style={styles.cardTitle}>Current Risk Status</Text>
          <View style={[styles.badge, { backgroundColor: `${riskColor}20`, borderColor: riskColor }]}>
            <AlertTriangle size={16} color={riskColor} />
            <Text style={[styles.badgeText, { color: riskColor }]}>{cityData?.risk_level || 'N/A'}</Text>
          </View>
        </View>
        <Text style={[styles.riskValue, { color: riskColor }]}>{cityData?.adjusted_risk || 0}%</Text>
        <Text style={styles.riskSubtext}>Infrastructure Fragility Factor: {cityData?.fragility || 'N/A'}</Text>
      </Animated.View>

      {/* Explainability Zone */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.card}>
        <View style={styles.cardHeader}>
          <Info size={20} color={COLORS.accent} />
          <Text style={styles.cardTitle}>Risk Factors Analysis</Text>
        </View>
        {explainability?.factors?.map((factor: any, i: number) => (
          <View key={i} style={styles.factorRow}>
            <View style={styles.factorTextContainer}>
              <Text style={styles.factorTitle}>{factor.feature}</Text>
              <Text style={styles.factorDesc}>{factor.explanation}</Text>
            </View>
            <Text style={[styles.factorImpact, { color: COLORS.risk.HIGH }]}>{factor.impact}</Text>
          </View>
        ))}
        {!explainability?.factors && <Text style={{color: COLORS.textSecondary}}>No risk factors available.</Text>}
      </Animated.View>

      {/* Forecast Chart Zone */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.card}>
        <Text style={styles.cardTitle}>24-Hour Forecast</Text>
        {forecast && forecast.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, paddingBottom: 24 }}>
              {forecast.map((f, i) => {
                const heightPercent = f.risk;
                const roundedRisk = Math.round(f.risk);
                const barColor = getRiskColor(f.risk >= 70 ? 'CRITICAL' : f.risk >= 50 ? 'HIGH' : f.risk >= 30 ? 'MODERATE' : 'LOW');
                
                // Format timestamp to "3 PM", "12 AM", etc.
                const dateObj = new Date(f.timestamp);
                let timeStr = f.timestamp;
                if (!isNaN(dateObj.getTime())) {
                  let hours = dateObj.getHours();
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  hours = hours % 12;
                  hours = hours ? hours : 12; // the hour '0' should be '12'
                  timeStr = `${hours} ${ampm}`;
                }

                return (
                  <View key={i} style={{ alignItems: 'center', width: 48 }}>
                    <Text style={{ color: barColor, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>{roundedRisk}%</Text>
                    <View style={{ height: 100, width: 24, backgroundColor: `${barColor}20`, borderRadius: 12, justifyContent: 'flex-end' }}>
                      <View style={{ height: `${heightPercent}%`, width: '100%', backgroundColor: barColor, borderRadius: 12 }} />
                    </View>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: 8, position: 'absolute', bottom: -24 }}>{timeStr}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary }}>No forecast data available.</Text>
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 24, paddingTop: 48, paddingBottom: 16, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 16 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '800' },
  locationBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  headerSubtitle: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  headerTextContainer: { flex: 1 },
  logo: { width: 90, height: 60 },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 6 },
  badgeText: { fontWeight: 'bold', fontSize: 12 },
  riskValue: { fontSize: 64, fontWeight: '900', marginVertical: 8 },
  riskSubtext: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },
  factorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  factorTextContainer: { flex: 1, paddingRight: 16 },
  factorTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  factorDesc: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  factorImpact: { fontWeight: '800', fontSize: 16 },
});
