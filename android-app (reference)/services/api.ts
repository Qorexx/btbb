import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Use the local network IP for Expo Go bypass!
const BASE_URL = 'http://localhost:8000'; // Changed to localhost
let USE_MOCK_DATA = false; 

// Bypass localtunnel's anti-phishing screen so our API requests don't get blocked
axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';
axios.defaults.timeout = 2000; // Add a 2s timeout so the app doesn't hang

export const MOCK_CITIES = [
  { id: 'lucknow', name: 'Lucknow', discom: 'MVVNL', fragility: 1.13, current_risk: 42, risk_level: 'MODERATE', lat: 26.85, lng: 80.95 },
  { id: 'noida', name: 'Noida', discom: 'PVVNL', fragility: 0.93, current_risk: 28, risk_level: 'LOW', lat: 28.57, lng: 77.32 },
  { id: 'ghaziabad', name: 'Ghaziabad', discom: 'PVVNL', fragility: 1.05, current_risk: 35, risk_level: 'MODERATE', lat: 28.67, lng: 77.45 },
  { id: 'firozabad', name: 'Firozabad', discom: 'DVVNL', fragility: 1.40, current_risk: 75, risk_level: 'CRITICAL', lat: 27.15, lng: 78.39 },
  { id: 'agra', name: 'Agra', discom: 'DVVNL', fragility: 1.20, current_risk: 55, risk_level: 'HIGH', lat: 27.18, lng: 78.02 },
  { id: 'meerut', name: 'Meerut', discom: 'PVVNL', fragility: 1.10, current_risk: 45, risk_level: 'MODERATE', lat: 28.98, lng: 77.71 },
];

export const MOCK_FORECAST = [
  { timestamp: 'Now', risk: 42, temp: 35 },
  { timestamp: '+4h', risk: 48, temp: 37 },
  { timestamp: '+8h', risk: 65, temp: 36 },
  { timestamp: '+12h', risk: 50, temp: 32 },
  { timestamp: '+16h', risk: 35, temp: 29 },
  { timestamp: '+20h', risk: 25, temp: 28 },
  { timestamp: '+24h', risk: 20, temp: 27 },
];

export const MOCK_EXPLAIN = {
  factors: [
    { feature: 'Thermal Stress', explanation: 'High temperatures causing transformer overheating', impact: '+25%' },
    { feature: 'Infrastructure Fragility', explanation: 'Aging substations in this sector', impact: '+15%' },
    { feature: 'Grid Load', peak: true, explanation: 'Current demand exceeds 85% capacity', impact: '+10%' }
  ]
};

export const MOCK_REPORTS = [
  { id: 1, type: 'Power Outage', time: '10 mins ago', details: 'No power since 2 PM', status: 'Verifying' },
  { id: 2, type: 'Voltage Fluctuations', time: '1 hr ago', details: 'Lights flickering continuously', status: 'Confirmed' }
];

export const api = {
  toggleMock: (value: boolean) => { USE_MOCK_DATA = value; },
  
  saveProfile: async (name: string, cityId: string, area: string) => {
    if (USE_MOCK_DATA) return { success: true };
    // Generate or get a session ID
    let sessionId = await AsyncStorage.getItem('@btbb_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 15);
      await AsyncStorage.setItem('@btbb_session_id', sessionId);
    }
    const res = await axios.post(`${BASE_URL}/api/profile`, {
      session_id: sessionId,
      name: name,
      city_id: cityId,
      area: area
    });
    return res.data;
  },

  getCities: async (isHeatwave: boolean = false) => {
    if (USE_MOCK_DATA) return MOCK_CITIES;
    const res = await axios.get(`${BASE_URL}/api/cities${isHeatwave ? '?heatwave=true' : ''}`);
    return res.data;
  },
  
  getPrediction: async (cityId: string, isHeatwave: boolean = false) => {
    if (USE_MOCK_DATA) return MOCK_CITIES.find(c => c.id === cityId) || MOCK_CITIES[0];
    const isDemo = await AsyncStorage.getItem('@is_demo_mode');
    const demoDate = await AsyncStorage.getItem('@demo_date');
    
    let url = `${BASE_URL}/api/predict/${cityId}?`;
    if (isHeatwave) url += 'heatwave=true&';
    if (isDemo === 'true' && demoDate) url += `target_time=${demoDate}&`;
    
    const res = await axios.get(url.replace(/&$/, ''));
    return res.data;
  },

  getForecast: async (cityId: string, isHeatwave: boolean = false) => {
    if (USE_MOCK_DATA) return MOCK_FORECAST;
    const isDemo = await AsyncStorage.getItem('@is_demo_mode');
    const demoDate = await AsyncStorage.getItem('@demo_date');
    
    let url = `${BASE_URL}/api/forecast/${cityId}?`;
    if (isDemo === 'true' && demoDate) url += `target_time=${demoDate}&`;
    
    const res = await axios.get(url.replace(/&$/, '').replace(/\?$/, ''));
    return res.data.forecast || [];
  },

  getExplainability: async (cityId: string, isHeatwave: boolean = false) => {
    if (USE_MOCK_DATA) return MOCK_EXPLAIN;
    const isDemo = await AsyncStorage.getItem('@is_demo_mode');
    const demoDate = await AsyncStorage.getItem('@demo_date');
    
    let url = `${BASE_URL}/api/explain/${cityId}?`;
    if (isHeatwave) url += 'heatwave=true&';
    if (isDemo === 'true' && demoDate) url += `target_time=${demoDate}&`;
    
    const res = await axios.get(url.replace(/&$/, ''));
    return res.data;
  },

  getReports: async (cityId: string) => {
    if (USE_MOCK_DATA) return MOCK_REPORTS;
    const res = await axios.get(`${BASE_URL}/api/reports/${cityId}`);
    return res.data;
  },

  submitReport: async (reportData: any) => {
    if (USE_MOCK_DATA) {
      MOCK_REPORTS.unshift({
        id: Math.random(),
        type: reportData.type,
        time: 'Just now',
        details: reportData.details,
        status: 'Submitted'
      });
      return { success: true };
    }
    const res = await axios.post(`${BASE_URL}/api/reports`, reportData);
    return res.data;
  },

  checkAlerts: async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/check-alerts`);
      return res.data;
    } catch (e) {
      return { has_alert: false };
    }
  }
};
