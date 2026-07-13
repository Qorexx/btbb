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

const generateMockHistory = (cityId: string, baseRisk: number): { timestamp: number; risk: number }[] => {
  const history = [];
  const now = Date.now();
  let currentVal = baseRisk;
  for (let i = 0; i <= 24; i++) {
    const time = now + i * 3600000;
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
  return (
    <>

      
      {isConvexConnected ? (
        <ConvexConnectedApp />
      ) : (
        <SimulatedApp />
      )}
      <BottomNav />
    </>
  );
}

// ── COMPONENT 2: CONVEX CONNECTED MODE ──
function ConvexConnectedApp() {
  const [currentCityId, setCurrentCityId] = useState<string>("noida");
  
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

  const activePrediction = latestPrediction || MOCK_PREDICTIONS[currentCityId];
  
  const historyData = rawHistory && rawHistory.length > 0 
    ? rawHistory.map((h: any) => ({ timestamp: h.timestamp, risk: h.adjustedRisk }))
    : generateMockHistory(currentCityId, activePrediction.adjustedRisk);

  const activeReports = recentReports || MOCK_REPORTS.filter(r => r.cityId === currentCityId);

  if (loading && !latestPrediction) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', color: '#fff', fontSize: '1.25rem' }}>Loading Grid Telemetry...</h2>
      </div>
    );
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
    />
  );
}

// ── COMPONENT 3: SIMULATED / OFFLINE MODE ──
function SimulatedApp() {
  const [currentCityId, setCurrentCityId] = useState<string>("noida");
  const [localReports, setLocalReports] = useState<CitizenReport[]>(MOCK_REPORTS);
  const [predictionsMap, setPredictionsMap] = useState<Record<string, Prediction>>(MOCK_PREDICTIONS);
  const historyCache = useRef<Record<string, { timestamp: number; risk: number }[]>>({});

  const activePrediction = predictionsMap[currentCityId] || MOCK_PREDICTIONS.noida;
  const activeReports = localReports.filter(r => r.cityId === currentCityId);

  const historyData = useMemo(() => {
    if (!historyCache.current[currentCityId]) {
      historyCache.current[currentCityId] = generateMockHistory(currentCityId, activePrediction.adjustedRisk);
    }
    return historyCache.current[currentCityId];
  }, [currentCityId, activePrediction.adjustedRisk]);

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
  onCycleStatus
}: DashboardViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newReportType, setNewReportType] = useState<'outage' | 'voltage_fluctuation' | 'sparking' | 'infrastructure_damage'>('outage');
  const [newReportDesc, setNewReportDesc] = useState('');
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{ x: number; y: number; val: number; label: string } | null>(null);

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

  const areaD = pathD ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - padBottom} L ${points[0].x} ${svgHeight - padBottom} Z` : '';

  return (
    <div style={{ paddingBottom: 60 }}>
      <BackgroundVideo condition={weather.condition} />
      {/* Header Bar */}
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-glow">G</div>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 600, letterSpacing: '0.5px', margin: 0 }}>
              GRID INDEX
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
              const currentPredict = prediction.cityId === city.id ? prediction : MOCK_PREDICTIONS[city.id];
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
                  const isHourMarker = i % 6 === 0 || i === history.length - 1;
                  
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
function BackgroundVideo({ condition }: { condition: string }) {
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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        objectFit: 'cover',
        zIndex: -2,
        opacity: 1,
        filter: 'brightness(0.75)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ── COMPONENT 6: BOTTOM NAV ──
function BottomNav() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  
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

