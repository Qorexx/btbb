import re

with open("web/src/App.tsx", "r") as f:
    content = f.read()

# 1. Update ConvexConnectedApp and SimulatedApp to destructure onLogout
content = re.sub(
    r"function ConvexConnectedApp\(\{(.*?)\}: AppSubProps\) \{",
    r"function ConvexConnectedApp({\1, onLogout}: AppSubProps) {",
    content
)

content = re.sub(
    r"function SimulatedApp\(\{(.*?)\}: AppSubProps\) \{",
    r"function SimulatedApp({\1, onLogout}: AppSubProps) {",
    content
)

# 2. Add onLogout to DashboardView calls
content = re.sub(
    r"simulation=\{simulation\}\n    />",
    r"simulation={simulation}\n      onLogout={onLogout}\n    />",
    content
)

# 3. Add onLogout to ProfileView calls
content = re.sub(
    r"<ProfileView (.*?onInjectFault=\{handleInjectFault\}) />",
    r"<ProfileView \1 onLogout={onLogout} />",
    content
)

# 4. Update ProfileViewProps and signature
content = content.replace(
    "  onInjectFault?: () => void;\n}",
    "  onInjectFault?: () => void;\n  onLogout?: () => void;\n}"
)
content = content.replace(
    "function ProfileView({ currentCityId, simulation, setSimulation, historicalMode, setHistoricalMode, onInjectFault }: ProfileViewProps) {",
    "function ProfileView({ currentCityId, simulation, setSimulation, historicalMode, setHistoricalMode, onInjectFault, onLogout }: ProfileViewProps) {"
)

# 5. Add Logout button to ProfileView
# Find where to put it. Let's put it in the header of the Profile View.
profile_header_target = """        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: '40px' }}>
          <div style={{ height: 80, width: 80, borderRadius: '24px', background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.5)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-main)' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Operator Profile</h1>
            <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 500 }}>System Administrator • {activeCity.name} Node</p>
          </div>
        </div>"""

profile_header_replacement = """        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ height: 80, width: 80, borderRadius: '24px', background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.5)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-main)' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Operator Profile</h1>
              <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 500 }}>System Administrator • {activeCity.name} Node</p>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="glass-btn" style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 700, color: '#fa2d48', border: '1px solid rgba(250,45,72,0.3)', background: 'rgba(250,45,72,0.1)' }}>
              LOGOUT
            </button>
          )}
        </div>"""

content = content.replace(profile_header_target, profile_header_replacement)

with open("web/src/App.tsx", "w") as f:
    f.write(content)
