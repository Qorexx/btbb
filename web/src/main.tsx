import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{color: 'red', padding: 20}}><h1>App Crashed</h1><pre>{this.state.error?.message}</pre><pre>{this.state.error?.stack}</pre></div>;
    }
    return this.props.children;
  }
}

const CONVEX_URL = (import.meta.env.VITE_CONVEX_URL as string) || '';

let convexClient: ConvexReactClient | null = null;
if (CONVEX_URL) {
  try {
    convexClient = new ConvexReactClient(CONVEX_URL);
  } catch (e) {
    console.error("Failed to initialize ConvexReactClient:", e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {convexClient ? (
        <ConvexProvider client={convexClient}>
          <App isConvexConnected={true} />
        </ConvexProvider>
      ) : (
        <App isConvexConnected={false} />
      )}
    </ErrorBoundary>
  </StrictMode>,
)

