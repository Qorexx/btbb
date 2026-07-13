import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import './App.css';
import './nav.css';

// ── TYPES DEFINITIONS ──
interface ExplanationFactor {
  feature: string;
  label: string;
  value: number;
  impact: 'low' | 'medium' | 'high';
  explanation: string;
}

interface Prediction {
  _id?: string;
  cityId: string;
  timestamp: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  rawRisk: number;
  adjustedRisk: number;
  rainAdjustmentApplied: boolean;
  explanation: {
    summary: string;
    factors: ExplanationFactor[];
  };
}

interface CitizenReport {
  _id: string;
  cityId: string;
  reportType: 'outage' | 'voltage_fluctuation' | 'sparking' | 'infrastructure_damage';
  description: string;
  status: 'pending' | 'verified' | 'resolved';
  lat?: number;
  lon?: number;
  userId?: string;
  _creationTime?: number;
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  timeStarted?: 'now' | '1h' | '24h';
}

interface WeatherSnapshot {
  temp: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  alerts?: string[];
}

interface CityConfig {
  id: string;
  name: string;
  lat: number;
  lon: number;
  discom: string;
  fragility: number;
}

// ── CITIES CONFIGURATION ──
const CITIES: CityConfig[] = [
  { id: "noida", name: "Noida", lat: 28.57, lon: 77.32, discom: "PVVNL", fragility: 0.93 },
  { id: "ghaziabad", name: "Ghaziabad", lat: 28.67, lon: 77.42, discom: "PVVNL", fragility: 1.00 },
  { id: "meerut", name: "Meerut", lat: 28.98, lon: 77.71, discom: "PVVNL", fragility: 1.07 },
  { id: "lucknow", name: "Lucknow", lat: 26.85, lon: 80.95, discom: "MVVNL", fragility: 1.13 },
  { id: "agra", name: "Agra", lat: 27.18, lon: 78.02, discom: "DVVNL", fragility: 1.27 },
  { id: "firozabad", name: "Firozabad", lat: 27.15, lon: 78.39, discom: "DVVNL", fragility: 1.40 },
];

// ── MINIMALIST TELEMETRY STATIC MOCK DATA ──
const MOCK_WEATHER: Record<string, WeatherSnapshot> = {
  noida: { temp: 34, humidity: 65, windSpeed: 12, condition: "Partly Cloudy" },
  ghaziabad: { temp: 35, humidity: 62, windSpeed: 10, condition: "Clear" },
  meerut: { temp: 36, humidity: 68, windSpeed: 8, condition: "Haze" },
  lucknow: { temp: 38, humidity: 72, windSpeed: 15, condition: "Thunderstorms", alerts: ["Severe Thunderstorm Watch"] },
  agra: { temp: 40, humidity: 55, windSpeed: 22, condition: "Dust Storm", alerts: ["High Wind Warning", "Dust Storm Advisory"] },
  firozabad: { temp: 41, humidity: 50, windSpeed: 18, condition: "Clear", alerts: ["Extreme Heat Warning"] },
};

const MOCK_PREDICTIONS: Record<string, Prediction> = {
  noida: {
    cityId: "noida",
    timestamp: Date.now(),
    riskLevel: "LOW",
    rawRisk: 0.18,
    adjustedRisk: 0.167,
    rainAdjustmentApplied: false,
    explanation: {
      summary: "Grid performance parameters are nominal. Standard thermal loads observed.",
      factors: [
        { feature: "temp_x_humidity", label: "Thermal-Moisture Index", value: 410, impact: "low", explanation: "Equipment temperature remains within normal threshold boundaries." },
        { feature: "wind_gusts_10m", label: "Wind Gust Speed", value: 12.5, impact: "low", explanation: "Draft velocities create negligible mechanical load on overhead structures." },
        { feature: "is_summer", label: "Summer Load Season", value: 1.0, impact: "medium", explanation: "Seasonal baseline demand active. Domestic cooling load is standard." },
        { feature: "surface_pressure", label: "Atmospheric Pressure", value: 1008.2, impact: "low", explanation: "High pressure center limits vertical moisture development." }
      ]
    }
  },
  ghaziabad: {
    cityId: "ghaziabad",
    timestamp: Date.now(),
    riskLevel: "LOW",
    rawRisk: 0.24,
    adjustedRisk: 0.24,
    rainAdjustmentApplied: false,
    explanation: {
      summary: "Grid operating within expected safety margins. Wind speeds are moderate.",
      factors: [
        { feature: "temp_x_humidity", label: "Thermal-Moisture Index", value: 450, impact: "low", explanation: "Low relative humidity facilitates natural transformer cooling." },
        { feature: "wind_gusts_10m", label: "Wind Gust Speed", value: 18.2, impact: "low", explanation: "Exposed distribution feeders are clear of adjacent canopy obstructions." },
        { feature: "is_summer", label: "Summer Load Season", value: 1.0, impact: "medium", explanation: "Baseline demand active. Minor voltage drops expected during transient peaks." }
      ]
    }
  },
  meerut: {
    cityId: "meerut",
    timestamp: Date.now(),
    riskLevel: "MODERATE",
    rawRisk: 0.35,
    adjustedRisk: 0.374,
    rainAdjustmentApplied: false,
    explanation: {
      summary: "Thermal stress showing slight escalation. caution advised.",
      factors: [
        { feature: "temp_x_humidity", label: "Thermal-Moisture Index", value: 580, impact: "medium", explanation: "Elevated humidity slows core transformer heat dissipation rate." },
        { feature: "is_peak_hour", label: "Peak Demand Hour", value: 1.0, impact: "medium", explanation: "Concentrated domestic loading causes slight sub-station load imbalance." },
        { feature: "consecutive_hot_hours", label: "Heat Accumulation", value: 4, impact: "low", explanation: "Transformer core temperature has risen, reducing overload response margin." }
      ]
    }
  },
  lucknow: {
    cityId: "lucknow",
    timestamp: Date.now(),
    riskLevel: "HIGH",
    rawRisk: 0.48,
    adjustedRisk: 0.542,
    rainAdjustmentApplied: true,
    explanation: {
      summary: "Significant overload risk. Heat index exceeds nominal operational safety guidelines.",
      factors: [
        { feature: "temp_x_humidity", label: "Thermal-Moisture Index", value: 720, impact: "high", explanation: "High ambient temperature with moisture creates continuous conductor loading stress." },
        { feature: "consecutive_hot_hours", label: "Heat Accumulation", value: 12, impact: "medium", explanation: "Thermal saturation of substation switches reached after 12 consecutive hot hours." },
        { feature: "is_peak_hour", label: "Peak Demand Hour", value: 1.0, impact: "high", explanation: "A/C load peaks coincide with transmission line thermal limits." }
      ]
    }
  },
  agra: {
    cityId: "agra",
    timestamp: Date.now(),
    riskLevel: "HIGH",
    rawRisk: 0.52,
    adjustedRisk: 0.66,
    rainAdjustmentApplied: true,
    explanation: {
      summary: "Infrastructure vulnerability is high. Impending convective storm systems detected.",
      factors: [
        { feature: "temp_x_humidity", label: "Thermal-Moisture Index", value: 780, impact: "high", explanation: "Extreme temperature values. Core grid components operating near threshold limits." },
        { feature: "surface_pressure", label: "Atmospheric Pressure", value: 1002.1, impact: "medium", explanation: "Rapid barometric pressure drops signal convective storm system transition." },
        { feature: "gust_ratio", label: "Wind Gust Ratio", value: 1.8, impact: "medium", explanation: "Fluctuating winds induce mechanical oscillation on older span lines." }
      ]
    }
  },
  firozabad: {
    cityId: "firozabad",
    timestamp: Date.now(),
    riskLevel: "CRITICAL",
    rawRisk: 0.64,
    adjustedRisk: 0.896,
    rainAdjustmentApplied: true,
    explanation: {
      summary: "Critical failure risk. Severe winds (>45 km/h) and precipitation threaten grid nodes.",
      factors: [
        { feature: "wind_gusts_10m", label: "Wind Gust Speed", value: 48.5, impact: "high", explanation: "High speed gusts exceed structural safety thresholds of older support spans." },
        { feature: "rain_x_wind", label: "Rain-Wind Interaction", value: 185.2, impact: "high", explanation: "Combined rain and wind pathing increases risk of insulator path flashovers." },
        { feature: "pressure_change_3h", label: "Barometric Drop Rate", value: -4.5, impact: "high", explanation: "Atmospheric instability. Immediate risk of local line trips and transformer drops." },
        { feature: "temperature_2m", label: "Air Temperature", value: 38.6, impact: "medium", explanation: "Persistent high heat decreases open air conductor current thresholds." }
      ]
    }
  }
};

const MOCK_REPORTS: CitizenReport[] = [
  { _id: "rep1", cityId: "noida", reportType: "voltage_fluctuation", description: "Constant voltage drop and flickering lights since 3 PM in Sector 62.", status: "verified", _creationTime: Date.now() - 7200000 },
  { _id: "rep2", cityId: "lucknow", reportType: "outage", description: "Complete phase blackout in Aliganj main market. Substation transformer failure suspected.", status: "pending", _creationTime: Date.now() - 1800000 },
  { _id: "rep3", cityId: "firozabad", reportType: "sparking", description: "Line sparking on overhead cables near level crossing 4.", status: "pending", _creationTime: Date.now() - 600000 },
  { _id: "rep4", cityId: "agra", reportType: "infrastructure_damage", description: "Line support damaged due to fallen tree limb near Fatehabad Road.", status: "resolved", _creationTime: Date.now() - 18000000 },
  { _id: "rep5", cityId: "meerut", reportType: "outage", description: "Feeder shutdown. Power offline for 6 hours without notification.", status: "verified", _creationTime: Date.now() - 12600000 }
];

export type SimulationType = 'none' | 'heatwave' | 'storm' | 'cyber';

export const applySimulationEffects = (prediction: Prediction, city: CityConfig, simulation: SimulationType): Prediction => {
  if (simulation === 'none') return prediction;
  
  let newRisk = prediction.rawRisk;
  if (simulation === 'heatwave') newRisk = Math.min(0.98, prediction.rawRisk + (0.3 * city.fragility));
  if (simulation === 'storm') newRisk = Math.min(0.98, prediction.rawRisk + (0.5 * city.fragility));
  if (simulation === 'cyber') newRisk = 1.0;

  let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (newRisk < 0.4) riskLevel = 'LOW';
  else if (newRisk < 0.7) riskLevel = 'MODERATE';
  else if (newRisk < 0.85) riskLevel = 'HIGH';
  else riskLevel = 'CRITICAL';

  return { ...prediction, adjustedRisk: newRisk, riskLevel };
};

const generateMockHistory = (cityId: string, baseRisk: number, simulation: SimulationType = 'none'): { timestamp: number; risk: number }[] => {
  const history = [];
  const now = Date.now();
  let currentVal = baseRisk;
  for (let i = 0; i <= 24; i++) {
    const time = now - (24 - i) * 3600000;
    if (simulation === 'cyber') {
      history.push({ timestamp: time, risk: 1.0 });
      continue;
    }
    const change = (Math.random() - 0.5) * 0.12;
    currentVal = Math.max(0.05, Math.min(0.95, currentVal + change));
    let adjustedVal = currentVal;
    if (cityId === "firozabad") adjustedVal = Math.max(0.6, currentVal);
    if (cityId === "noida") adjustedVal = Math.min(0.3, currentVal);
    history.push({ timestamp: time, risk: adjustedVal });
  }
  return history;
};

// ── COMPONENT 1: WRAPPER ──
export default function App({ isConvexConnected = false }: { isConvexConnected?: boolean }) {
  const [activeTab, setActiveTab] = useState<string>("Dashboard");
  const [currentCityId, setCurrentCityId] = useState<string>("noida");
  const [simulation, setSimulation] = useState<SimulationType>('none');
  const [historicalMode, setHistoricalMode] = useState<boolean>(false);
  
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [sweepActive, setSweepActive] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("btb_user");
    if (cached) {
      setShowDashboard(true);
    }
  }, []);

  const handleEnter = (profile: any) => {
    setIsTransitioning(true);
    setSweepActive(true);

    setTimeout(() => {
      localStorage.setItem("btb_user", JSON.stringify(profile));
      setShowDashboard(true);
    }, 800);

    setTimeout(() => {
      setIsTransitioning(false);
      setSweepActive(false);
    }, 1500);
  };

  const handleLogout = () => {
    localStorage.removeItem("btb_user");
    setShowDashboard(false);
  };

  const weather = MOCK_WEATHER[currentCityId] || MOCK_WEATHER.noida;

  const appProps = {
    activeTab, setActiveTab, currentCityId, setCurrentCityId,
    simulation, setSimulation, historicalMode, setHistoricalMode,
    onLogout: handleLogout
  };

  return (
    <>
      <div className={`scanline-sweep ${sweepActive ? 'sweep-active' : ''}`} />
      
      {showDashboard ? (
        <>
          <BackgroundVideo condition={weather.condition} />
          {isConvexConnected ? (
            <ConvexConnectedApp {...appProps} />
          ) : (
            <SimulatedApp {...appProps} />
          )}
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        </>
      ) : (
        <>
          <BackgroundVideo condition="clear" isTransitioning={isTransitioning} />
          <LandingPage onEnter={handleEnter} isTransitioning={isTransitioning} />
        </>
      )}
    </>
  );
}

// ── COMPONENT 2: CONVEX CONNECTED MODE ──
interface AppSubProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentCityId: string;
  setCurrentCityId: (id: string) => void;
  simulation: SimulationType;
  setSimulation: (sim: SimulationType) => void;
  historicalMode: boolean;
  setHistoricalMode: (mode: boolean) => void;
  onLogout?: () => void;
}

function ConvexConnectedApp({ activeTab, setActiveTab, currentCityId, setCurrentCityId, simulation, setSimulation, historicalMode, setHistoricalMode , onLogout}: AppSubProps) {
  
  // Real Convex queries
  const latestPrediction = useQuery((api as any).predictions.getLatest, { cityId: currentCityId });
  const rawHistory = useQuery((api as any).predictions.getHistory, { cityId: currentCityId, limit: 24 });
  const recentReports = useQuery((api as any).reports.getRecent, { cityId: currentCityId });
  
  // Real Convex mutations
  const convexSubmitReport = useMutation((api as any).reports.submitReport);
  const convexUpdateStatus = useMutation((api as any).reports.updateStatus);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, [currentCityId]);

  const handleAddReport = async (report: Omit<CitizenReport, "_id" | "status" | "_creationTime">) => {
    try {
      await convexSubmitReport({
        cityId: report.cityId,
        reportType: report.reportType,
        description: report.description,
        lat: report.lat,
        lon: report.lon,
      });
    } catch (e) {
      console.error("Convex submit error:", e);
    }
  };

  const handleCycleStatus = async (reportId: string, currentStatus: 'pending' | 'verified' | 'resolved') => {
    const nextStatusMap: Record<string, 'pending' | 'verified' | 'resolved'> = {
      pending: 'verified',
      verified: 'resolved',
      resolved: 'pending',
    };
    try {
      await convexUpdateStatus({
        reportId: reportId as any,
        status: nextStatusMap[currentStatus],
      });
    } catch (e) {
      console.error("Convex status update error:", e);
    }
  };

  const currentCityConfig = CITIES.find(c => c.id === currentCityId) || CITIES[0];
  const basePrediction = latestPrediction || MOCK_PREDICTIONS[currentCityId];
  const activePrediction = applySimulationEffects(basePrediction as Prediction, currentCityConfig, simulation);
  
  const historyData = rawHistory && rawHistory.length > 0 
    ? rawHistory.map((h: any) => ({ timestamp: h.timestamp, risk: h.adjustedRisk }))
    : generateMockHistory(currentCityId, activePrediction.adjustedRisk, simulation);

  const activeReports = recentReports || MOCK_REPORTS.filter(r => r.cityId === currentCityId);

  if (loading && !latestPrediction) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', color: '#fff', fontSize: '1.25rem' }}>Loading Grid Telemetry...</h2>
      </div>
    );
  }

  if (activeTab === 'Maps') {
    const allPredictions: Record<string, { riskLevel: string; adjustedRisk: number }> = {};
    CITIES.forEach(c => {
      const p = MOCK_PREDICTIONS[c.id] || { riskLevel: 'LOW', adjustedRisk: 0.1, rawRisk: 0.1 };
      allPredictions[c.id] = applySimulationEffects(p as Prediction, c, simulation);
    });
    return <MapView predictions={allPredictions} setActiveTab={setActiveTab} setCurrentCityId={setCurrentCityId} />;
  }

  if (activeTab === 'Reports') {
    return <ReportView currentCityId={currentCityId} onAddReport={handleAddReport} reports={activeReports} />;
  }

  const handleInjectFault = () => {
    handleAddReport({
      cityId: currentCityId,
      reportType: 'infrastructure_damage',
      description: 'SYSTEM INJECTED FAULT: Critical Transformer Failure detected in sector 4. Immediate repair required.',
      severity: 'critical',
      timeStarted: 'now'
    });
  };

  if (activeTab === 'Profile') {
    return <ProfileView currentCityId={currentCityId} simulation={simulation} setSimulation={setSimulation} historicalMode={historicalMode} setHistoricalMode={setHistoricalMode} onInjectFault={handleInjectFault} onLogout={onLogout} />;
  }

  return (
    <DashboardView
      isConnected={true}
      currentCityId={currentCityId}
      setCurrentCityId={setCurrentCityId}
      prediction={activePrediction}
      history={historyData}
      reports={activeReports}
      weather={MOCK_WEATHER[currentCityId] || MOCK_WEATHER.noida}
      onAddReport={handleAddReport}
      onCycleStatus={handleCycleStatus}
      simulation={simulation}
      onLogout={onLogout}
    />
  );
}

// ── COMPONENT 3: SIMULATED / OFFLINE MODE ──
function SimulatedApp({ activeTab, setActiveTab, currentCityId, setCurrentCityId, simulation, setSimulation, historicalMode, setHistoricalMode , onLogout}: AppSubProps) {
  const [localReports, setLocalReports] = useState<CitizenReport[]>(MOCK_REPORTS);
  const [predictionsMap, setPredictionsMap] = useState<Record<string, Prediction>>(MOCK_PREDICTIONS);
  const historyCache = useRef<Record<string, { timestamp: number; risk: number }[]>>({});

  const currentCityConfig = CITIES.find(c => c.id === currentCityId) || CITIES[0];
  const basePrediction = predictionsMap[currentCityId] || MOCK_PREDICTIONS.noida;
  const activePrediction = applySimulationEffects(basePrediction, currentCityConfig, simulation);

  const activeReports = localReports.filter(r => r.cityId === currentCityId);

  const historyData = useMemo(() => {
    if (simulation !== 'none') {
      return generateMockHistory(currentCityId, activePrediction.adjustedRisk, simulation);
    }
    if (!historyCache.current[currentCityId]) {
      historyCache.current[currentCityId] = generateMockHistory(currentCityId, activePrediction.adjustedRisk, simulation);
    }
    return historyCache.current[currentCityId];
  }, [currentCityId, activePrediction.adjustedRisk, simulation]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPredictionsMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(cid => {
          const current = next[cid];
          const deviation = (Math.random() - 0.5) * 0.04;
          const newAdjusted = Math.max(0.08, Math.min(0.96, current.adjustedRisk + deviation));
          
          let nextLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
          if (newAdjusted >= 0.70) nextLevel = 'CRITICAL';
          else if (newAdjusted >= 0.50) nextLevel = 'HIGH';
          else if (newAdjusted >= 0.30) nextLevel = 'MODERATE';

          next[cid] = {
            ...current,
            timestamp: Date.now(),
            adjustedRisk: newAdjusted,
            riskLevel: nextLevel
          };
        });
        return next;
      });

      const nextCache = { ...historyCache.current };
      Object.keys(nextCache).forEach(cid => {
        if (nextCache[cid]) {
          const hist = [...nextCache[cid]];
          hist.shift();
          const lastTimestamp = hist[hist.length - 1].timestamp;
          hist.push({
            timestamp: lastTimestamp + 3600000,
            risk: Math.max(0.05, Math.min(0.95, (predictionsMap[cid]?.adjustedRisk || 0.2) + (Math.random() - 0.5) * 0.1))
          });
          nextCache[cid] = hist;
        }
      });
      historyCache.current = nextCache;
    }, 10000);

    return () => clearInterval(interval);
  }, [predictionsMap]);

  const handleAddReport = (report: Omit<CitizenReport, "_id" | "status" | "_creationTime">) => {
    const newReport: CitizenReport = {
      ...report,
      _id: `sim_rep_${Date.now()}`,
      status: "pending",
      _creationTime: Date.now()
    };
    setLocalReports(prev => [newReport, ...prev]);
  };

  const handleCycleStatus = (reportId: string, currentStatus: 'pending' | 'verified' | 'resolved') => {
    const nextStatusMap: Record<string, 'pending' | 'verified' | 'resolved'> = {
      pending: 'verified',
      verified: 'resolved',
      resolved: 'pending',
    };
    setLocalReports(prev =>
      prev.map(r => r._id === reportId ? { ...r, status: nextStatusMap[currentStatus] } : r)
    );
  };

  if (activeTab === 'Maps') {
    const allPredictions: Record<string, { riskLevel: string; adjustedRisk: number }> = {};
    CITIES.forEach(c => {
      const p = predictionsMap[c.id] || { riskLevel: 'LOW', adjustedRisk: 0.1, rawRisk: 0.1 };
      allPredictions[c.id] = applySimulationEffects(p as Prediction, c, simulation);
    });
    return <MapView predictions={allPredictions} setActiveTab={setActiveTab} setCurrentCityId={setCurrentCityId} />;
  }

  if (activeTab === 'Reports') {
    return <ReportView currentCityId={currentCityId} onAddReport={handleAddReport} reports={activeReports} />;
  }

  const handleInjectFault = () => {
    handleAddReport({
      cityId: currentCityId,
      reportType: 'infrastructure_damage',
      description: 'SYSTEM INJECTED FAULT: Critical Transformer Failure detected in sector 4. Immediate repair required.',
      severity: 'critical',
      timeStarted: 'now'
    });
  };

  if (activeTab === 'Profile') {
    return <ProfileView currentCityId={currentCityId} simulation={simulation} setSimulation={setSimulation} historicalMode={historicalMode} setHistoricalMode={setHistoricalMode} onInjectFault={handleInjectFault} onLogout={onLogout} />;
  }

  return (
    <DashboardView
      isConnected={false}
      currentCityId={currentCityId}
      setCurrentCityId={setCurrentCityId}
      prediction={activePrediction}
      history={historyData}
      reports={activeReports}
      weather={MOCK_WEATHER[currentCityId] || MOCK_WEATHER.noida}
      onAddReport={handleAddReport}
      onCycleStatus={handleCycleStatus}
      simulation={simulation}
      onLogout={onLogout}
    />
  );
}

// ── COMPONENT 4: DYNAMIC PRESENTATION VIEW ──
interface DashboardViewProps {
  isConnected: boolean;
  currentCityId: string;
  setCurrentCityId: (id: string) => void;
  prediction: Prediction;
  history: { timestamp: number; risk: number }[];
  reports: CitizenReport[];
  weather: WeatherSnapshot;
  onAddReport: (report: Omit<CitizenReport, "_id" | "status" | "_creationTime">) => void;
  onCycleStatus: (reportId: string, currentStatus: 'pending' | 'verified' | 'resolved') => void;
  simulation: SimulationType;
  onLogout?: () => void;
}

function DashboardView({
  isConnected,
  currentCityId,
  setCurrentCityId,
  prediction,
  history,
  reports,
  weather,
  onAddReport,
  onCycleStatus,
  simulation,
  onLogout
}: DashboardViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newReportType, setNewReportType] = useState<'outage' | 'voltage_fluctuation' | 'sparking' | 'infrastructure_damage'>('outage');
  const [newReportDesc, setNewReportDesc] = useState('');

  const activeCity = CITIES.find(c => c.id === currentCityId) || CITIES[0];

  const getRiskColorClass = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'critical';
      case 'HIGH': return 'high';
      case 'MODERATE': return 'moderate';
      default: return 'low';
    }
  };

  const currentRiskClass = getRiskColorClass(prediction.riskLevel);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReportDesc.trim()) return;

    onAddReport({
      cityId: currentCityId,
      reportType: newReportType,
      description: newReportDesc,
      lat: activeCity.lat + (Math.random() - 0.5) * 0.05,
      lon: activeCity.lon + (Math.random() - 0.5) * 0.05,
    });

    setNewReportDesc('');
    setModalOpen(false);
  };

  const svgWidth = 600;
  const svgHeight = 320;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;

  const points = history.map((h, i) => {
    const x = padLeft + (i / (history.length - 1)) * (svgWidth - padLeft - padRight);
    const y = svgHeight - padBottom - h.risk * (svgHeight - padTop - padBottom);
    return { x, y, val: h.risk, label: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  });

  let pathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 2;
      const cpY1 = curr.y;
      const cpX2 = curr.x + (next.x - curr.x) / 2;
      const cpY2 = next.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
    }
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      {simulation !== 'none' && (
        <div style={{ background: simulation === 'cyber' ? '#805AD5' : '#fa2d48', color: '#fff', padding: '12px 24px', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '1px', position: 'relative', animation: 'pulse 2s infinite', zIndex: 100 }}>
          ⚠️ GLOBAL ALERT: {simulation === 'cyber' ? 'CYBER ATTACK DETECTED - INFRASTRUCTURE COMPROMISED' : simulation === 'heatwave' ? 'EXTREME THERMAL STRESS - GRID OVERLOAD IMMINENT' : 'SEVERE STORM WARNING - PHYSICAL DAMAGE EXPECTED'} ⚠️
        </div>
      )}
      {/* Header Bar */}
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/images/WhatsApp_Image_2026-07-13_at_00.28.36-removebg-preview.png" alt="DrishtiX Logo" style={{ height: '72px', width: 'auto', filter: 'drop-shadow(0 0 10px rgba(72, 187, 120, 0.4))' }} />
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '1px', margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center' }}>
              DrishtiX
            </h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>
              TELEMETRY & RISK ANALYTICS
            </p>
          </div>
        </div>

        <div>
          {isConnected ? (
            <span className="connection-badge">
              <span className="pulse-dot" style={{ backgroundColor: '#fff' }}></span> LIVE DATA
            </span>
          ) : (
            <span className="connection-badge">
              <span className="pulse-dot" style={{ backgroundColor: '#71717a' }}></span> SYSTEM SIMULATION
            </span>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="glass-btn"
              style={{ marginLeft: 12, padding: '4px 10px', fontSize: '0.62rem', minHeight: 0, fontWeight: 700 }}
            >
              LOGOUT
            </button>
          )}
        </div>
      </header>

      {/* Dashboard Core Layout */}
      <div className="dashboard-container">
        
        {/* TOP ROW: Sidebar + Main Stats */}
        <div className="dashboard-top-row">
          {/* Sidebar */}
          <aside className="sidebar glass-panel">
          <div className="brand-section">
            <div className="brand-text" style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>Grid Nodes</h1>
              <p style={{ margin: 0, fontSize: '0.65rem' }}>Select target monitoring node</p>
            </div>
          </div>

          <div className="city-list">
            {CITIES.map(city => {
              const isActive = city.id === currentCityId;
              let currentPredict = prediction.cityId === city.id ? prediction : MOCK_PREDICTIONS[city.id];
              if (currentPredict && prediction.cityId !== city.id) {
                currentPredict = applySimulationEffects(currentPredict as Prediction, city, simulation);
              }
              const levelClass = getRiskColorClass(currentPredict?.riskLevel || 'LOW');

              return (
                <div
                  key={city.id}
                  className={`city-card ${isActive ? 'active' : ''}`}
                  onClick={() => setCurrentCityId(city.id)}
                >
                  <div className="city-info" style={{ textAlign: 'left' }}>
                    <h3>{city.name}</h3>
                    <p>{city.discom} • {city.fragility.toFixed(2)}x</p>
                  </div>
                  <div className="city-status-indicator">
                    <span className={`status-badge ${levelClass}`}>
                      {currentPredict?.riskLevel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Panel Content */}
        <main className="main-content main-card">
          
          {/* Active City Details Banner */}
          <div className="top-bar">
            <div className="current-city-details" style={{ textAlign: 'center' }}>
              <h2>{activeCity.name} Node</h2>
              <div className="coordinates-discom">
                <span>{activeCity.lat.toFixed(2)}° N, {activeCity.lon.toFixed(2)}° E</span>
                <span>DISCOM: <strong className="discom-tag">{activeCity.discom}</strong></span>
              </div>
            </div>
          </div>

          {/* Grid Panel Layout */}
          <div className="grid-container">
            
            {/* Risk Value Block */}
            <div className="risk-card glass-panel glass-panel-hover" style={{ alignItems: 'center', justifyContent: 'center' }}>
              
              <div style={{ position: 'absolute', top: 20, left: 24 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Calculated Failure Risk</span>
              </div>
              
              <div className="circular-progress-container" style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 15 }}>
                <svg width="150" height="150" viewBox="0 0 150 150" style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}>
                  {/* Background track */}
                  <circle cx="75" cy="75" r="65" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="14" />
                  {/* Progress track */}
                  <circle 
                    cx="75" cy="75" r="65" 
                    fill="transparent" 
                    stroke={
                      Math.round(prediction.adjustedRisk * 100) < 33 ? '#34C759' : 
                      Math.round(prediction.adjustedRisk * 100) <= 66 ? '#FFCC00' : 
                      '#FF3B30'
                    } 
                    strokeWidth="14" 
                    strokeDasharray={2 * Math.PI * 65} 
                    strokeDashoffset={(2 * Math.PI * 65) - ((2 * Math.PI * 65) * Math.min(prediction.adjustedRisk, 1))} 
                    strokeLinecap="round" 
                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease' }} 
                  />
                </svg>
                <div className="metric-value-large" style={{ margin: 0 }}>
                  {Math.round(prediction.adjustedRisk * 100)}
                  <span className="metric-unit">%</span>
                </div>
              </div>

              <div style={{ position: 'absolute', bottom: 20, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="risk-tag-row" style={{ margin: 0 }}>
                  <span className={`status-badge ${currentRiskClass}`} style={{ fontSize: '0.7rem' }}>
                    {prediction.riskLevel}
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Fragility: <strong className="fragility-highlight">{activeCity.fragility.toFixed(2)}x</strong>
                </span>
              </div>
            </div>

            {/* Metrics Influencing Factors Card */}
            <div className="explain-card glass-panel">
              <div className="section-header">
                <div className="section-title">
                  Metrics & Risk Indicators
                </div>
              </div>

              <div className="summary-text" style={{ textAlign: 'left' }}>
                {prediction.explanation.summary}
              </div>

              <div className="factors-list">
                {prediction.explanation.factors.map((factor, index) => (
                  <div key={index} className="factor-item" style={{ textAlign: 'left' }}>
                    <div className="factor-top">
                      <span className="factor-name">{factor.label}</span>
                      <div className="factor-meta">
                        <span className="factor-value">
                          {factor.value.toFixed(1)}
                        </span>
                        <span className={`factor-impact ${factor.impact}`}>
                          {factor.impact}
                        </span>
                      </div>
                    </div>
                    <p className="factor-explanation">{factor.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

        {/* BOTTOM FULL-WIDTH CARDS */}
        
        {/* Outage Rates Bar Chart Card */}
        <div className="bar-chart-card glass-panel full-width-card">
              <div className="section-header">
                <div className="section-title">
                  24-Hour Outage Forecast
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Predicted telemetry logs</span>
              </div>

              <div className="bar-chart-container">
                {history.map((h, i) => {
                  const heightPercent = Math.max(5, h.risk * 100);
                  
                  return (
                    <div key={i} className="bar-chart-column">
                      <div 
                        className="bar-chart-bar" 
                        style={{ 
                          height: `${Math.max(15, heightPercent)}%`,
                          background: (h.risk * 100) < 33 ? 'linear-gradient(180deg, #34C759 0%, rgba(52, 199, 89, 0.2) 100%)' 
                                    : (h.risk * 100) <= 66 ? 'linear-gradient(180deg, #FFCC00 0%, rgba(255, 204, 0, 0.2) 100%)'
                                    : 'linear-gradient(180deg, #FF3B30 0%, rgba(255, 59, 48, 0.2) 100%)'
                        }} 
                      >
                        <span className="bar-chart-inner-text">{Math.round(h.risk * 100)}%</span>
                      </div>
                      <div className="bar-chart-label">
                        {i === 0 ? 'Now' : `+${i}h`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current Weather Snapshot Card */}
            <div className="weather-card glass-panel full-width-card">
              <div className="section-header">
                <div className="section-title">Current Weather Snapshot</div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Real-time meteorological context</span>
              </div>
              <div className="weather-grid">
                <div className="weather-stat-box">
                  <span className="weather-label">Temperature</span>
                  <div className="weather-val">{weather.temp}<span className="weather-unit">°C</span></div>
                </div>
                <div className="weather-stat-box">
                  <span className="weather-label">Humidity</span>
                  <div className="weather-val">{weather.humidity}<span className="weather-unit">%</span></div>
                </div>
                <div className="weather-stat-box">
                  <span className="weather-label">Wind Speed</span>
                  <div className="weather-val">{weather.windSpeed}<span className="weather-unit"> km/h</span></div>
                </div>
                <div className="weather-stat-box">
                  <span className="weather-label">Conditions</span>
                  <div className="weather-val" style={{ fontSize: '1.2rem' }}>{weather.condition}</div>
                </div>
              </div>
              {weather.alerts && weather.alerts.length > 0 && (
                <div className="weather-alerts-container">
                  {weather.alerts.map((alert, idx) => (
                    <div key={idx} className="weather-alert-banner">
                      <span className="pulse-dot" style={{ backgroundColor: '#ff4b4b' }}></span>
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Citizen Outage Reports Card */}
            <div className="reports-card glass-panel full-width-card">
              <div className="section-header">
                <div className="section-title">
                  Incident Feeds & Outages
                </div>
                <div className="reports-header-actions">
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Status column triggers status progression</span>
                </div>
              </div>

              {reports.length === 0 ? (
                <div className="empty-state">
                  <p>No active anomalies reported at this node.</p>
                </div>
              ) : (
                <div className="reports-table-container">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Observation details</th>
                        <th>Verification status</th>
                        <th>Logged Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report._id}>
                          <td className="report-type-cell">
                            <span style={{ fontSize: '0.78rem' }}>
                              {report.reportType.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <p className="report-desc-text" title={report.description}>
                              {report.description}
                            </p>
                          </td>
                          <td>
                            <div>
                              <span
                                className={`report-status-badge ${report.status}`}
                                onClick={() => onCycleStatus(report._id, report.status)}
                              >
                                {report.status}
                              </span>
                              <span className="status-cycle-helper">Click to cycle</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            {report._creationTime 
                              ? new Date(report._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : 'Recent'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

      </div>

      {/* Grid Issue Reporting Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Log Grid Incident</h3>
              <button className="close-btn" onClick={() => setModalOpen(false)}>×</button>
            </div>
            
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label>Issue Classification</label>
                <select
                  className="glass-select"
                  value={newReportType}
                  onChange={(e) => setNewReportType(e.target.value as any)}
                >
                  <option value="outage">Complete Outage (Blackout)</option>
                  <option value="voltage_fluctuation">Voltage Fluctuation (Flickering)</option>
                  <option value="sparking">Transformer Sparking / Fire</option>
                  <option value="infrastructure_damage">Infrastructure Damage (Fallen Poles/Lines)</option>
                </select>
              </div>

              <div className="form-group" style={{ textAlign: 'left' }}>
                <label>Incident Details</label>
                <textarea
                  className="glass-textarea"
                  placeholder="Provide precise observations. Include safety hazards if present."
                  value={newReportDesc}
                  onChange={(e) => setNewReportDesc(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ textAlign: 'left' }}>
                <label>Grid Node Location</label>
                <input
                  type="text"
                  className="glass-input"
                  value={activeCity.name}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="glass-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-btn glass-btn-primary"
                >
                  Submit Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── COMPONENT 5: BACKGROUND VIDEO ──
function BackgroundVideo({ condition, isTransitioning = false }: { condition: string; isTransitioning?: boolean }) {
  const [videoIndex, setVideoIndex] = useState(0);

  useEffect(() => {
    // Reset index when condition changes
    setVideoIndex(0);
  }, [condition]);

  const getVideoList = (cond: string) => {
    switch (cond.toLowerCase()) {
      case 'clear':
      case 'partly cloudy':
        return ['/videos/clear/clear1.mp4', '/videos/clear/clear2.mp4'];
      case 'thunderstorms':
        return ['/videos/thunder/thunder.mp4'];
      case 'dust storm':
        return ['/videos/dust/dust.mp4'];
      case 'haze':
      default:
        return ['/videos/haze/haze.mp4'];
    }
  };

  const videoList = getVideoList(condition);
  const currentVideo = videoList[videoIndex % videoList.length];

  const handleEnded = () => {
    setVideoIndex(prev => prev + 1);
  };

  return (
    <video
      key={currentVideo}
      src={currentVideo}
      autoPlay
      muted
      playsInline
      loop={videoList.length === 1}
      onEnded={videoList.length > 1 ? handleEnded : undefined}
      className={`background-video ${isTransitioning ? 'warp-active' : ''}`}
    />
  );
}

// ── COMPONENT 6: BOTTOM NAV ──
interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const navItems = [
    { id: 'Dashboard', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg> },
    { id: 'Maps', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg> },
    { id: 'Reports', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> },
    { id: 'Profile', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> },
  ];

  return (
    <>
      <svg style={{ width: 0, height: 0, position: 'absolute' }} aria-hidden="true">
        <filter id="glass-distortion">
          <feTurbulence 
            type="fractalNoise" 
            baseFrequency="0.015 0.015" 
            numOctaves="3" 
            result="noise" 
          />
          <feDisplacementMap 
            in="SourceGraphic" 
            in2="noise" 
            scale="10" 
            xChannelSelector="R" 
            yChannelSelector="G" 
          />
        </filter>
      </svg>
      <div className="bottom-nav">
        {navItems.map(item => (
          <button 
            key={item.id} 
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <div className="nav-icon">{item.icon}</div>
            <span className="nav-label">{item.id}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── COMPONENT 7: REGIONAL OUTAGE MAP VIEW ──
interface MapViewProps {
  predictions: Record<string, { riskLevel: string; adjustedRisk: number }>;
  setActiveTab: (tab: string) => void;
  setCurrentCityId: (id: string) => void;
}

function MapView({ predictions, setActiveTab, setCurrentCityId }: MapViewProps) {
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CITY_CLICK' && event.data?.cityId) {
        setSelectedCityId(event.data.cityId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return '#48BB78';
      case 'MODERATE': return '#ECC94B';
      case 'HIGH': return '#ED8936';
      case 'CRITICAL': return '#E53E3E';
      default: return '#48BB78';
    }
  };

  const mapCities = CITIES.map(city => {
    const pred = predictions[city.id] || { riskLevel: 'LOW', adjustedRisk: 0.1 };
    return {
      ...city,
      riskLevel: pred.riskLevel,
      adjustedRisk: pred.adjustedRisk,
      color: getRiskColor(pred.riskLevel)
    };
  });

  // Calculate Aggregated Risk
  const avgRisk = mapCities.reduce((acc, city) => acc + city.adjustedRisk, 0) / mapCities.length;
  
  // Get Top Hotspots
  const hotspots = [...mapCities].sort((a, b) => b.adjustedRisk - a.adjustedRisk).slice(0, 5);
  
  // Dummy Alerts
  const alerts = [
    { time: '10:45 AM', text: 'Agra Dust Storm Advisory' },
    { time: '09:30 AM', text: 'Noida Sector 62 Transformer Fault' },
    { time: '08:15 AM', text: 'Mathura High Load Warning' }
  ];

  const selectedCity = selectedCityId ? mapCities.find(c => c.id === selectedCityId) : null;

  const srcDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html { margin: 0; padding: 0; height: 100%; width: 100%; background: transparent !important; }
        #map { width: 100%; height: 100%; background: transparent !important; }
        .leaflet-container { background: transparent !important; }
        .leaflet-popup-content-wrapper {
          background: rgba(255, 255, 255, 0.8) !important;
          backdrop-filter: blur(10px);
          color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 12px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
        }
        .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.8) !important;
          border: 1px solid rgba(255, 255, 255, 0.25);
        }
        .popup-header {
          font-size: 0.9rem;
          font-weight: 700;
          margin-bottom: 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          padding-bottom: 4px;
        }
        .popup-detail {
          font-size: 0.75rem;
          margin: 3px 0;
          color: #333333;
        }
        .risk-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: bold;
          font-size: 0.7rem;
          color: #000;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false
        }).setView([28.1, 78.1], 8);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CartoDB',
          opacity: 0.75
        }).addTo(map);

        L.control.zoom({
          position: 'topright'
        }).addTo(map);

        var cities = ${JSON.stringify(mapCities)};
        
        cities.forEach(function(city) {
          var marker = L.circleMarker([city.lat, city.lon], {
            color: city.color,
            fillColor: city.color,
            fillOpacity: 0.75,
            weight: 3,
            radius: 14 + (city.adjustedRisk * 12)
          }).addTo(map);
          
          marker.on('click', function() {
            window.parent.postMessage({ type: 'CITY_CLICK', cityId: city.id }, '*');
          });
          
          var popupContent = '<div class="popup-header">' + city.name + '</div>' +
                             '<div class="popup-detail" style="font-weight: 600;">Click to view context card</div>';
          marker.bindPopup(popupContent);
        });
      </script>
    </body>
    </html>
  `;

  return (
    <div className="map-view-container" style={{ padding: '0 24px', height: 'calc(100vh - 140px)', boxSizing: 'border-box', width: '1200px', maxWidth: '95vw', margin: '20px auto 32px' }}>
      <div style={{ display: 'flex', gap: '20px', height: '100%', width: '100%' }}>
        
        {/* 75% MAP AREA */}
        <div className="glass-panel" style={{ flex: '0 0 75%', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1.5px solid rgba(255, 255, 255, 0.3)', background: 'rgba(255, 255, 255, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-heading)' }}>Regional Outage Map</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0 0', fontWeight: 600 }}>Grid Outage Risk Prediction & Telemetry (UP/NCR)</p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '6px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.7rem', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#48BB78' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#48BB78' }}></span> Low
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#888800' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ECC94B' }}></span> Moderate
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ED8936' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ED8936' }}></span> High
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#E53E3E' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E53E3E' }}></span> Critical
              </span>
            </div>
          </div>
          
          <iframe 
            srcDoc={srcDoc} 
            title="Regional Outage Map"
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', background: 'transparent' }} 
          />

          {/* FLOATING CITY CARD */}
          {selectedCity && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              width: '280px',
              background: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(24px) saturate(150%)',
              WebkitBackdropFilter: 'blur(24px) saturate(150%)',
              border: '1.5px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              zIndex: 100,
              animation: 'fade-in-up 0.3s ease-out forwards'
            }}>
              <button 
                onClick={() => setSelectedCityId(null)}
                style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700 }}>{selectedCity.name}</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Outage Risk:</span>
                  <span style={{ fontWeight: 700, color: selectedCity.color }}>{selectedCity.riskLevel} ({Math.round(selectedCity.adjustedRisk * 100)}%)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Discom:</span>
                  <span style={{ fontWeight: 700 }}>{selectedCity.discom}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Grid Fragility:</span>
                  <span style={{ fontWeight: 700 }}>{selectedCity.fragility}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Weather:</span>
                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                    Clear (32°C)
                  </span>
                </div>
              </div>

              <button style={{
                marginTop: '20px',
                width: '100%',
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.05)',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
              onClick={() => {
                setCurrentCityId(selectedCity.id);
                setActiveTab('Dashboard');
              }}
              >
                View Full Dashboard
              </button>
            </div>
          )}
        </div>

        {/* 25% SIDEBAR AREA */}
        <div className="glass-panel" style={{ flex: '1', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)', overflowY: 'auto' }}>
          
          {/* Regional Risk Gauge */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', fontFamily: 'var(--font-heading)' }}>Regional Grid Health</h3>
            <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: '16px', padding: '20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: avgRisk > 0.6 ? '#E53E3E' : (avgRisk > 0.4 ? '#ED8936' : '#48BB78') }}>
                {Math.round(avgRisk * 100)}%
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Average Vulnerability</div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${avgRisk * 100}%`, background: avgRisk > 0.6 ? '#E53E3E' : (avgRisk > 0.4 ? '#ED8936' : '#48BB78'), borderRadius: '4px' }}></div>
              </div>
            </div>
          </div>

          {/* Active Hotspots */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', fontFamily: 'var(--font-heading)' }}>Active Hotspots</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {hotspots.map((city, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.2)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'background 0.2s' }}
                     onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.4)'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                     onClick={() => setSelectedCityId(city.id)}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{city.name}</span>
                  <span style={{ padding: '4px 8px', borderRadius: '6px', background: city.color, color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                    {city.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts Feed */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', fontFamily: 'var(--font-heading)' }}>State-wide Alerts</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {alerts.map((alert, idx) => (
                <div key={idx} style={{ padding: '12px', background: 'rgba(250, 45, 72, 0.05)', borderLeft: '3px solid #fa2d48', borderRadius: '0 8px 8px 0', fontSize: '0.8rem' }}>
                  <div style={{ color: '#fa2d48', fontWeight: 700, fontSize: '0.7rem', marginBottom: '4px' }}>{alert.time}</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{alert.text}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── COMPONENT 8: CITIZEN REPORT VIEW ──
interface ReportViewProps {
  currentCityId: string;
  onAddReport: (report: Omit<CitizenReport, "_id" | "status" | "_creationTime">) => void;
  reports: CitizenReport[];
}

function ReportView({ currentCityId, onAddReport, reports }: ReportViewProps) {
  const [issueType, setIssueType] = useState<CitizenReport['reportType']>('outage');
  const [severity, setSeverity] = useState<'critical' | 'high' | 'moderate' | 'low'>('moderate');
  const [timeStarted, setTimeStarted] = useState<'now' | '1h' | '24h'>('now');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        const iframe = document.getElementById('map-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'SET_LOCATION', lat: pos.coords.latitude, lon: pos.coords.longitude }, '*');
        }
      });
    } else {
      alert("Geolocation is not supported by your browser");
    }
  };

  const activeCity = CITIES.find(c => c.id === currentCityId) || CITIES[0];
  const centerLat = location?.lat || activeCity.lat;
  const centerLon = location?.lon || activeCity.lon;

  const srcDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html { margin: 0; padding: 0; height: 100%; width: 100%; }
        #map { width: 100%; height: 100%; }
        .leaflet-container { cursor: crosshair !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLon}], 11);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CartoDB'
        }).addTo(map);

        var marker = null;
        ${location ? `marker = L.marker([${location.lat}, ${location.lon}]).addTo(map);` : ''}

        map.on('click', function(e) {
          if (marker) {
            marker.setLatLng(e.latlng);
          } else {
            marker = L.marker(e.latlng).addTo(map);
          }
          window.parent.postMessage({ type: 'LOCATION_PICKED', lat: e.latlng.lat, lon: e.latlng.lng }, '*');
        });

        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'SET_LOCATION') {
            var latlng = [event.data.lat, event.data.lon];
            map.setView(latlng, 15);
            if (marker) {
              marker.setLatLng(latlng);
            } else {
              marker = L.marker(latlng).addTo(map);
            }
          }
        });
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LOCATION_PICKED') {
        setLocation({ lat: event.data.lat, lon: event.data.lon });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    setTimeout(() => {
      onAddReport({
        cityId: currentCityId,
        reportType: issueType,
        description,
        lat: location?.lat,
        lon: location?.lon,
        severity,
        timeStarted
      });
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setDescription('');
      setMediaFile(null);
    }, 800);
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return '#E53E3E';
      case 'high': return '#ED8936';
      case 'moderate': return '#ECC94B';
      case 'low': return '#48BB78';
      default: return '#718096';
    }
  };

  return (
    <div className="report-view-container" style={{ padding: '0 24px', height: 'calc(100vh - 140px)', boxSizing: 'border-box', width: '1200px', maxWidth: '95vw', margin: '20px auto 32px' }}>
      <div style={{ display: 'flex', gap: '20px', height: '100%', width: '100%' }}>
        
        <div className="glass-panel" style={{ flex: '0 0 65%', borderRadius: '24px', padding: '32px', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)', overflowY: 'auto' }}>
          
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px 0', fontFamily: 'var(--font-heading)' }}>Submit Telemetry Report</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Contribute real-time data to help operators dispatch crews and train predictive models.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div className="form-section" style={{ background: 'rgba(255,255,255,0.3)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700 }}>1. Pinpoint Location</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Click on the map to set the exact coordinates.</p>
                </div>
                <button type="button" onClick={handleGetLocation} style={{
                  background: 'rgba(250,45,72,0.1)', color: '#fa2d48', border: '1px solid rgba(250,45,72,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                  Get My Location
                </button>
              </div>
              
              <div style={{ height: '300px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', position: 'relative' }}>
                <iframe id="map-iframe" srcDoc={srcDoc} style={{ width: '100%', height: '100%', border: 'none' }} />
                {!location && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ background: '#000', color: '#fff', padding: '8px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>Click to place pin</div>
                  </div>
                )}
              </div>
              {location && <div style={{ fontSize: '0.75rem', marginTop: '8px', color: 'var(--text-secondary)', fontWeight: 600 }}>Selected: {location.lat.toFixed(5)}, {location.lon.toFixed(5)}</div>}
            </div>

            <div className="form-section" style={{ background: 'rgba(255,255,255,0.3)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>2. Categorize Issue</h3>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Issue Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'outage', label: 'Power Outage' },
                    { id: 'voltage_fluctuation', label: 'Voltage Fluctuation' },
                    { id: 'sparking', label: 'Sparking / Fire' },
                    { id: 'infrastructure_damage', label: 'Physical Damage (Transformer/Line)' }
                  ].map(type => (
                    <button type="button" key={type.id}
                      onClick={() => setIssueType(type.id as any)}
                      style={{
                        padding: '12px', borderRadius: '12px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                        background: issueType === type.id ? '#fff' : 'rgba(255,255,255,0.2)',
                        border: issueType === type.id ? '2px solid #fa2d48' : '1px solid rgba(0,0,0,0.1)',
                        color: issueType === type.id ? '#fa2d48' : 'var(--text-main)',
                        boxShadow: issueType === type.id ? '0 4px 12px rgba(250,45,72,0.15)' : 'none'
                      }}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Severity Level</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['low', 'moderate', 'high', 'critical'].map(sev => (
                      <button type="button" key={sev}
                        onClick={() => setSeverity(sev as any)}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: '10px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'capitalize', cursor: 'pointer',
                          background: severity === sev ? getSeverityColor(sev) : 'rgba(255,255,255,0.3)',
                          color: severity === sev ? '#fff' : 'var(--text-muted)',
                          border: 'none',
                          boxShadow: severity === sev ? `0 4px 12px ${getSeverityColor(sev)}40` : 'none'
                        }}>
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>Time Started</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                      { id: 'now', label: 'Just Now' },
                      { id: '1h', label: '1 Hr Ago' },
                      { id: '24h', label: '>24 Hrs' }
                    ].map(t => (
                      <button type="button" key={t.id}
                        onClick={() => setTimeStarted(t.id as any)}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: '10px', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                          background: timeStarted === t.id ? '#1a1a1a' : 'rgba(255,255,255,0.3)',
                          color: timeStarted === t.id ? '#fff' : 'var(--text-muted)',
                          border: 'none'
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section" style={{ background: 'rgba(255,255,255,0.3)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700 }}>3. Additional Details & Evidence</h3>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="E.g., Transformer sparking near Sector 4 market..."
                style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'none', height: '80px', boxSizing: 'border-box', marginBottom: '12px' }}
                required
              />
              
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) setMediaFile(e.dataTransfer.files[0]); }}
                onClick={() => document.getElementById('media-upload')?.click()}
                style={{ width: '100%', padding: '20px', border: mediaFile ? '2px solid #48BB78' : '2px dashed rgba(0,0,0,0.2)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.3)', transition: 'all 0.2s' }}>
                <input type="file" id="media-upload" hidden onChange={(e) => e.target.files?.[0] && setMediaFile(e.target.files[0])} />
                {mediaFile ? (
                  <div style={{ color: '#48BB78', fontSize: '0.85rem', fontWeight: 700 }}>✓ Attached: {mediaFile.name}</div>
                ) : (
                  <>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Drag & Drop photos or videos of the issue</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '4px' }}>(Images will be analyzed by CV models for severity)</div>
                  </>
                )}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting || !location} style={{
              width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#fa2d48', color: '#fff', fontSize: '1.1rem', fontWeight: 700, cursor: (isSubmitting || !location) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: (isSubmitting || !location) ? 0.7 : 1, boxShadow: '0 10px 20px rgba(250,45,72,0.3)'
            }}>
              {isSubmitting ? 'Submitting...' : showSuccess ? 'Report Submitted!' : 'Submit Telemetry Report'}
            </button>

          </form>
        </div>

        <div className="glass-panel" style={{ flex: '0 0 35%', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)', overflowY: 'auto' }}>
          
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', fontFamily: 'var(--font-heading)' }}>Live Community Feed</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Recent verified reports from {activeCity.name}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reports.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, background: 'rgba(255,255,255,0.2)', borderRadius: '12px' }}>
                No active reports in this area.
              </div>
            ) : (
              reports.map(report => (
                <div key={report._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-main)' }}>
                      {report.reportType.replace('_', ' ')}
                    </span>
                    <span style={{ 
                      fontSize: '0.65rem', fontWeight: 800, padding: '4px 8px', borderRadius: '20px', textTransform: 'uppercase',
                      background: report.status === 'verified' ? '#48BB7820' : (report.status === 'resolved' ? '#A0AEC020' : '#ED893620'),
                      color: report.status === 'verified' ? '#48BB78' : (report.status === 'resolved' ? '#A0AEC0' : '#ED8936')
                    }}>
                      {report.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.4 }}>
                    "{report.description}"
                  </div>
                  {report.severity && (
                    <div style={{ display: 'inline-block', marginTop: '10px', fontSize: '0.65rem', fontWeight: 700, color: getSeverityColor(report.severity), padding: '2px 6px', borderRadius: '4px', background: `${getSeverityColor(report.severity)}20`, textTransform: 'capitalize' }}>
                      Severity: {report.severity}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── COMPONENT 9: PROFILE & DEMO CONTROLS ──
interface ProfileViewProps {
  currentCityId: string;
  simulation: SimulationType;
  setSimulation: (sim: SimulationType) => void;
  historicalMode: boolean;
  setHistoricalMode: (mode: boolean) => void;
  onInjectFault?: () => void;
  onLogout?: () => void;
}

function ProfileView({ currentCityId, simulation, setSimulation, historicalMode, setHistoricalMode, onInjectFault, onLogout }: ProfileViewProps) {
  const activeCity = CITIES.find(c => c.id === currentCityId) || CITIES[0];
  
  const demoMode = simulation !== 'none';
  const [historicalDate, setHistoricalDate] = useState('');

  const handleSimulate = (type: 'heatwave' | 'storm' | 'cyber') => {
    if (simulation === type) {
      setSimulation('none');
    } else {
      setSimulation(type);
    }
  };

  return (
    <div className="profile-view-container" style={{ 
      padding: '0 24px', height: 'calc(100vh - 140px)', boxSizing: 'border-box', width: '1200px', maxWidth: '95vw', margin: '20px auto 32px',
      position: 'relative'
    }}>
      {demoMode && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          background: simulation === 'heatwave' ? 'rgba(250, 45, 72, 0.08)' : simulation === 'storm' ? 'rgba(49, 130, 206, 0.08)' : 'rgba(128, 90, 213, 0.08)',
          pointerEvents: 'none', zIndex: 0, borderRadius: '24px', transition: 'all 1s' 
        }} />
      )}
      
      <div style={{ display: 'flex', gap: '20px', height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>
        
        {/* LEFT COLUMN: Operator Info */}
        <div className="glass-panel" style={{ flex: '0 0 35%', borderRadius: '24px', padding: '32px', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, #111, #333)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 800, margin: '0 auto 16px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
              OP
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 4px 0', fontFamily: 'var(--font-heading)' }}>John Doe</h1>
            <div style={{ color: '#fa2d48', fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Senior Grid Dispatcher</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', marginTop: '4px' }}>ID: OP-7824-A</div>
            {onLogout && (
              <button 
                onClick={onLogout}
                style={{
                  marginTop: '24px',
                  background: 'rgba(250,45,72,0.1)',
                  color: '#fa2d48',
                  border: '1px solid rgba(250,45,72,0.3)',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(250,45,72,0.2)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(250,45,72,0.1)'}
              >
                LOGOUT
              </button>
            )}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.3)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.4)', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700 }}>Current Assignment</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Region:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{activeCity.name} ({activeCity.discom})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Shift Status:</span>
              <span style={{ fontWeight: 700, color: '#48BB78' }}>● Active (08:00 - 16:00)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Access Level:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Tier 1 (Override Enabled)</span>
            </div>
          </div>

          <div style={{ flex: 1 }}></div>

          <button style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid rgba(250,45,72,0.3)', background: 'rgba(250, 45, 72, 0.1)', color: '#fa2d48', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            LOG OUT
          </button>
        </div>

        {/* RIGHT COLUMN: Demo Controls */}
        <div className="glass-panel" style={{ flex: '0 0 65%', borderRadius: '24px', padding: '32px', border: '1.5px solid rgba(255, 255, 255, 0.4)', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 30px 60px rgba(0, 0, 0, 0.08)', overflowY: 'auto' }}>
          
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px 0', fontFamily: 'var(--font-heading)' }}>Demo Controls</h1>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Hackathon simulation environment. Use these toggles to demonstrate AI model responses.</p>
            </div>
            {demoMode && (
              <div style={{ background: '#fa2d48', color: '#fff', padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, animation: 'pulse 2s infinite' }}>
                SIMULATION ACTIVE
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Heatwave / Weather Panel */}
            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '24px', borderRadius: '20px', border: simulation !== 'none' ? '2px solid #fa2d48' : '1px solid rgba(255,255,255,0.4)', transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={simulation !== 'none' ? '#fa2d48' : 'currentColor'} strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Extreme Weather Simulation
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Trigger high thermal stress or storm conditions to test load predictions.</p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <button onClick={() => handleSimulate('heatwave')} style={{ padding: '16px', borderRadius: '12px', border: simulation === 'heatwave' ? '2px solid #fa2d48' : '1px solid rgba(0,0,0,0.1)', background: simulation === 'heatwave' ? 'rgba(250,45,72,0.1)' : 'rgba(255,255,255,0.5)', color: simulation === 'heatwave' ? '#fa2d48' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                  Heatwave
                </button>
                <button onClick={() => handleSimulate('storm')} style={{ padding: '16px', borderRadius: '12px', border: simulation === 'storm' ? '2px solid #3182CE' : '1px solid rgba(0,0,0,0.1)', background: simulation === 'storm' ? 'rgba(49,130,206,0.1)' : 'rgba(255,255,255,0.5)', color: simulation === 'storm' ? '#3182CE' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                  Severe Storm
                </button>
                <button onClick={() => handleSimulate('cyber')} style={{ padding: '16px', borderRadius: '12px', border: simulation === 'cyber' ? '2px solid #805AD5' : '1px solid rgba(0,0,0,0.1)', background: simulation === 'cyber' ? 'rgba(128,90,213,0.1)' : 'rgba(255,255,255,0.5)', color: simulation === 'cyber' ? '#805AD5' : 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Cyber Attack
                </button>
              </div>
            </div>

            {/* Historical Mode */}
            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '24px', borderRadius: '20px', border: historicalMode ? '2px solid #48BB78' : '1px solid rgba(255,255,255,0.4)', transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: historicalMode ? '#48BB78' : 'var(--text-main)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Historical Demo Mode
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Fetch AI predictions and real telemetry for a past date/time.</p>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                  <input type="checkbox" checked={historicalMode} onChange={(e) => setHistoricalMode(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: historicalMode ? '#48BB78' : 'rgba(0,0,0,0.2)', transition: '.4s', borderRadius: '34px' }}>
                    <span style={{ position: 'absolute', content: '""', height: '20px', width: '20px', left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%', transform: historicalMode ? 'translateX(24px)' : 'none' }}></span>
                  </span>
                </label>
              </div>
              
              <div style={{ opacity: historicalMode ? 1 : 0.4, pointerEvents: historicalMode ? 'auto' : 'none', transition: 'all 0.3s' }}>
                <input type="datetime-local" value={historicalDate} onChange={e => setHistoricalDate(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 600, fontFamily: 'inherit', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                <button style={{ width: '100%', marginTop: '12px', padding: '16px', borderRadius: '12px', background: '#111', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>Fetch Historical Data</button>
              </div>
            </div>

            {/* Inject Fault */}
            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '24px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700, color: '#fa2d48' }}>Inject System Fault</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Manually trigger a critical outage alert in {activeCity.name}.</p>
              </div>
              <button onClick={() => onInjectFault && onInjectFault()} style={{ background: '#fa2d48', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 20px rgba(250,45,72,0.3)', transition: 'transform 0.1s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                TRIGGER FAULT
              </button>
            </div>

          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
// ── COMPONENT 7: LANDING PAGE ──
function LandingPage({
  onEnter,
  isTransitioning,
}: {
  onEnter: (profile: any) => void;
  isTransitioning: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);

  const isFormValid = name.trim() && email.includes('@') && phone.trim() && selectedCity;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsFormLoading(true);
    setTimeout(() => {
      setIsFormLoading(false);
      onEnter({ name, email, phone, city: selectedCity });
    }, 800);
  };

  const handleGoogleAuth = () => {
    setIsGoogleLoading(true);
    setTimeout(() => {
      setIsGoogleLoading(false);
      onEnter({
        name: 'John Doe',
        email: 'john.doe@gmail.com',
        phone: '+91 99999 88888',
        city: 'noida',
      });
    }, 1200);
  };

  const citiesList = [
    { id: 'lucknow', name: 'Lucknow' },
    { id: 'noida', name: 'Noida' },
    { id: 'ghaziabad', name: 'Ghaziabad' },
    { id: 'firozabad', name: 'Firozabad' },
    { id: 'agra', name: 'Agra' },
    { id: 'meerut', name: 'Meerut' },
  ];

  return (
    <div className="landing-wrapper">
      <div className={`landing-card ${isTransitioning ? 'card-exit' : ''}`}>
        <div className="landing-logo-container">
          <div className="landing-logo-icon">
            {/* Electrical Pylon BTB Logo SVG */}
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M5 12h14M2 17h20M9 7h6" />
              <circle cx="12" cy="12" r="3" fill="#34C759" stroke="none" />
            </svg>
          </div>
          <h2 className="landing-logo-text">BT<span>B</span></h2>
        </div>

        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
          Citizen Portal
        </h1>
        <p className="landing-subtext">
          Register to access your 24-hour city dashboard.
        </p>

        <form onSubmit={handleSubmit} className="landing-form">
          <div className="form-group">
            <span className="input-label">Full Name</span>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <span className="input-label">Email Address</span>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <span className="input-label">Phone Number</span>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <span className="input-label">Select Your City</span>
            <div className="city-grid-select">
              {citiesList.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => setSelectedCity(city.id)}
                  className={`city-select-btn ${selectedCity === city.id ? 'active' : ''}`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="10" r="3" />
                    <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
                  </svg>
                  {city.name}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isFormLoading}
            className={`submit-btn ${isFormValid ? 'ready' : ''}`}
            style={{ marginTop: 8 }}
          >
            {isFormLoading ? 'Verifying...' : 'Enter Dashboard'}
          </button>
        </form>

        <div className="divider-row">
          <div className="divider-line"></div>
          <span className="divider-text">OR</span>
          <div className="divider-line"></div>
        </div>

        <button onClick={handleGoogleAuth} disabled={isGoogleLoading} className="google-auth-btn">
          {isGoogleLoading ? (
            <span className="empty-state" style={{ padding: 0, color: '#fff', fontSize: '0.85rem' }}>Signing in...</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              Continue with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}

