import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isPlaceholderKey = !PUBLISHABLE_KEY || PUBLISHABLE_KEY === 'pk_test_...' || PUBLISHABLE_KEY.trim() === '';

if (isPlaceholderKey) {
  // Render a friendly step-by-step setup screen to prevent Clerk SDK crash
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <div className="landing-container" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass landing-card" style={{ maxWidth: '600px', textAlign: 'left', padding: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--title-font)', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            ⚙️ Configuration Required
          </h2>
          <p style={{ fontSize: '0.95rem', marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
            Welcome to your Homelab Storage Portal! To get started, you need to configure your environment variables:
          </p>
          <ol style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
            <li>
              <strong>Create a Clerk Account</strong>: Go to <a href="https://clerk.com" target="_blank" style={{ color: 'var(--primary)' }}>clerk.com</a> and create a new project.
            </li>
            <li>
              <strong>Configure Frontend Key</strong>:
              <div style={{ background: 'var(--bg-input)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'var(--mono)', margin: '0.25rem 0', wordBreak: 'break-all' }}>
                Open <strong>client/.env</strong> and replace <code>pk_test_...</code> with your Clerk <strong>Publishable Key</strong>.
              </div>
            </li>
            <li>
              <strong>Configure Backend Keys</strong>:
              <div style={{ background: 'var(--bg-input)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'var(--mono)', margin: '0.25rem 0', wordBreak: 'break-all' }}>
                Open <strong>server/.env</strong> and replace Clerk keys and set your PostgreSQL <code>DATABASE_URL</code>.
              </div>
            </li>
            <li>
              <strong>Restart dev servers</strong> to load the new environment variables!
            </li>
          </ol>
          <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            Once the keys are set, this page will automatically reload and show the access portal.
          </div>
        </div>
      </div>
    </StrictMode>
  );
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>,
  );
}
