import re

with open("web/src/App.tsx", "r") as f:
    content = f.read()

# 1. Update AppSubProps
content = content.replace(
    "  setHistoricalMode: (mode: boolean) => void;\n}",
    "  setHistoricalMode: (mode: boolean) => void;\n  onLogout?: () => void;\n}"
)

# 2. Update BackgroundVideo
content = content.replace(
    "function BackgroundVideo({ condition }: { condition: string }) {",
    "function BackgroundVideo({ condition, isTransitioning = false }: { condition: string; isTransitioning?: boolean }) {"
)
content = content.replace(
    "className=\"background-video\"",
    "className={`background-video ${isTransitioning ? 'warp-active' : ''}`}"
)

# 3. Update DashboardViewProps
content = content.replace(
    "  simulation: SimulationType;\n}",
    "  simulation: SimulationType;\n  onLogout?: () => void;\n}"
)
content = content.replace(
    "  simulation\n}: DashboardViewProps) {",
    "  simulation,\n  onLogout\n}: DashboardViewProps) {"
)
content = content.replace(
    "            </span>\n          )}",
    "            </span>\n          )}\n          {onLogout && (\n            <button\n              onClick={onLogout}\n              className=\"glass-btn\"\n              style={{ marginLeft: 12, padding: '4px 10px', fontSize: '0.62rem', minHeight: 0, fontWeight: 700 }}\n            >\n              LOGOUT\n            </button>\n          )}"
)

# 4. Update App
app_start = """export default function App({ isConvexConnected = false }: { isConvexConnected?: boolean }) {
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
}"""

content = re.sub(
    r"export default function App\(.*?\) {.*?return \(\n    <>\n.*?</>\n  \);\n}",
    app_start.replace('\\', '\\\\'),
    content,
    flags=re.DOTALL
)

with open("web/src/App.tsx", "w") as f:
    f.write(content)
