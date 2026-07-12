import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'

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
    {convexClient ? (
      <ConvexProvider client={convexClient}>
        <App isConvexConnected={true} />
      </ConvexProvider>
    ) : (
      <App isConvexConnected={false} />
    )}
  </StrictMode>,
)

