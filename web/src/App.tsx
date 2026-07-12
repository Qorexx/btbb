import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import './App.css';

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
  for (let i = 24; i >= 0; i--) {
    const time = now - i * 3600000;
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
      <div className="bg-decorations">
        <div className="ambient-glow glow-1"></div>
        <div className="ambient-glow glow-2"></div>
        <div className="bg-shape shape-1"></div>
        <div className="bg-shape shape-2"></div>
        <div className="bg-shape shape-3"></div>
        <div className="bg-shape shape-4"></div>
      </div>
      
      {isConvexConnected ? (
        <ConvexConnectedApp />
      ) : (
        <SimulatedApp />
      )}
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
  const [historyCache, setHistoryCache] = useState<Record<string, { timestamp: number; risk: number }[]>>({});

  const activePrediction = predictionsMap[currentCityId] || MOCK_PREDICTIONS.noida;
  const activeReports = localReports.filter(r => r.cityId === currentCityId);

  const getHistoryForActive = () => {
    if (!historyCache[currentCityId]) {
      const generated = generateMockHistory(currentCityId, activePrediction.adjustedRisk);
      setHistoryCache(prev => ({ ...prev, [currentCityId]: generated }));
      return generated;
    }
    return historyCache[currentCityId];
  };

  const historyData = getHistoryForActive();

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

      setHistoryCache(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(cid => {
          const hist = [...next[cid]];
          hist.shift();
          hist.push({
            timestamp: Date.now(),
            risk: predictionsMap[cid]?.adjustedRisk || 0.2
          });
          next[cid] = hist;
        });
        return next;
      });
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
  const svgHeight = 150;
  const padding = 20;

  const points = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - h.risk * (svgHeight - padding * 2);
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

  const areaD = pathD ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - padding} L ${points[0].x} ${svgHeight - padding} Z` : '';

  return (
    <div style={{ paddingBottom: 60 }}>
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
          <div className="top-bar glass-panel">
            <div className="current-city-details" style={{ textAlign: 'left' }}>
              <h2>{activeCity.name} Node</h2>
              <div className="coordinates-discom">
                <span>{activeCity.lat.toFixed(2)}° N, {activeCity.lon.toFixed(2)}° E</span>
                <span>DISCOM: <strong className="discom-tag">{activeCity.discom}</strong></span>
              </div>
            </div>
            
            <button className="glass-btn glass-btn-primary" onClick={() => setModalOpen(true)}>
              Report Incident
            </button>
          </div>

          {/* Grid Panel Layout */}
          <div className="grid-container">
            
            {/* Risk Value Block */}
            <div className="risk-card glass-panel glass-panel-hover" style={{ textAlign: 'left' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Calculated Failure Risk</span>
                <div className="metric-value-large">
                  {Math.round(prediction.adjustedRisk * 100)}
                  <span className="metric-unit">%</span>
                </div>
              </div>
              
              <div style={{ width: '100%' }}>
                <div className="risk-tag-row">
                  <span className={`status-badge ${currentRiskClass}`} style={{ fontSize: '0.7rem' }}>
                    {prediction.riskLevel}
                  </span>
                  <span className="risk-level-heading">Classification Status</span>
                </div>
                
                {/* Horizontal minimalist progress track */}
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 12 }}>
                  <div style={{ width: `${prediction.adjustedRisk * 100}%`, height: '100%', background: '#fff', borderRadius: 2 }} />
                </div>

                <p className="fragility-info" style={{ margin: '12px 0 0 0', padding: '10px 0 0 0' }}>
                  Infrastructure vulnerability multiplier: <strong className="fragility-highlight">{activeCity.fragility.toFixed(2)}x</strong>
                </p>
              </div>
            </div>

            {/* Metrics Influencing Factors Card */}
            <div className="explain-card glass-panel">
              <div className="section-header">
                <div className="section-title">
                  Metrics & Risk Indicators
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>XGBoost Telemetry v2</span>
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

            {/* Historical Risk Chart Card */}
            <div className="chart-card glass-panel">
              <div className="section-header">
                <div className="section-title">
                  24-Hour Risk Progression
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Historical telemetry logs</span>
              </div>

              <div className="chart-svg-container">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                  {/* Shaded Area */}
                  {areaD && <path d={areaD} fill="url(#chartGlow)" />}

                  {/* Line Path */}
                  {pathD && <path d={pathD} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />}

                  {/* Nodes & Interactive Points */}
                  {points.map((pt, i) => (
                    <g key={i}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredChartPoint?.x === pt.x ? 4 : 2}
                        fill="#ffffff"
                        stroke={hoveredChartPoint?.x === pt.x ? '#000000' : 'rgba(255,255,255,0.3)'}
                        strokeWidth={hoveredChartPoint?.x === pt.x ? 2 : 1}
                        style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={() => {
                          setHoveredChartPoint({
                            x: pt.x,
                            y: pt.y,
                            val: pt.val,
                            label: pt.label
                          });
                        }}
                        onMouseLeave={() => setHoveredChartPoint(null)}
                      />
                    </g>
                  ))}
                </svg>

                {/* Tooltip Overlay */}
                {hoveredChartPoint && (
                  <div
                    className="chart-tooltip"
                    style={{
                      left: `${(hoveredChartPoint.x / svgWidth) * 100}%`,
                      top: `${(hoveredChartPoint.y / svgHeight) * 100 - 30}%`,
                      transform: 'translate(-50%, -100%)'
                    }}
                  >
                    <h4>{hoveredChartPoint.label}</h4>
                    <p>{Math.round(hoveredChartPoint.val * 100)}% risk</p>
                  </div>
                )}
              </div>
            </div>

            {/* Citizen Outage Reports Card */}
            <div className="reports-card glass-panel">
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

        </main>
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
