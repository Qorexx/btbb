import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { COLORS } from '../../theme/colors';
import { api, MOCK_CITIES } from '../../services/api';

const { width, height } = Dimensions.get('window');

export default function MapScreen() {
  const [cities, setCities] = useState<any[]>(MOCK_CITIES);

  const loadCities = async () => {
    try {
      const isHw = await AsyncStorage.getItem('@is_heatwave') === 'true';
      const data = await api.getCities(isHw);
      setCities(data?.cities || data || MOCK_CITIES); 
    } catch (e) {
      console.warn("Failed to load cities for map", e);
      setCities(MOCK_CITIES);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCities();
    }, [])
  );

  const getRiskColor = (level: string) => {
    return COLORS.risk[level as keyof typeof COLORS.risk] || COLORS.risk.LOW;
  };

  const webMapHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>body, html { margin: 0; padding: 0; height: 100%; } #map { width: 100%; height: 100%; }</style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var map = L.map('map').setView([27.5, 79.5], 6);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      ${cities.map(city => `
        L.circleMarker([${city.lat}, ${city.lng}], {
          color: '${getRiskColor(city.risk_level)}',
          fillColor: '${getRiskColor(city.risk_level)}',
          fillOpacity: 0.8,
          radius: 12
        }).addTo(map)
        .bindPopup('<b>${city.name || city.city_name}</b><br/>Risk: <b>${city.risk_level}</b><br/>Discom: ${city.discom}');
      `).join('\n')}
    </script>
  </body>
  </html>
  `;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Regional Map</Text>
        <Text style={styles.headerSubtitle}>Live Outage Risks (UP/NCR)</Text>
      </View>
      {Platform.OS === 'web' ? (
        <iframe 
          srcDoc={webMapHtml} 
          style={{ flex: 1, width: '100%', height: '100%', border: 'none' }} 
        />
      ) : (
        <WebView
          source={{ html: webMapHtml }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 24, paddingTop: 48, paddingBottom: 16, backgroundColor: COLORS.background, zIndex: 10 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 32, fontWeight: 'bold' },
  headerSubtitle: { color: COLORS.textSecondary, fontSize: 16, marginTop: 4 },
  map: { width: width, height: height },
});
