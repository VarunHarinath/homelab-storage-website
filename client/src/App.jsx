import React, { useState, useEffect } from 'react';
import { 
  SignedIn, 
  SignedOut, 
  SignInButton, 
  UserButton,
  useAuth
} from '@clerk/clerk-react';
import { HardDrive, Shield, Users, LogIn } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AdminPortal from './components/AdminPortal';

function App() {
  const { isLoaded, userId, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState('files'); // files, admin
  const [userData, setUserData] = useState({ isAdmin: false });
  const [loadingUser, setLoadingUser] = useState(false);

  // Fetch logged-in user profile details (includes admin checks)
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) return;
      setLoadingUser(true);
      try {
        const token = await getToken();
        const response = await fetch('/api/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserProfile();
  }, [userId, getToken]);

  return (
    <>
      {/* Header element (visible to all states but changes based on auth) */}
      <header className="app-header">
        <div className="logo-container">
          <HardDrive className="logo-icon" size={28} />
          <span className="logo-text">Homelab Storage</span>
        </div>

        <div className="user-nav-actions">
          <SignedIn>
            {userData.isAdmin && (
              <div className="tab-navigation">
                <button 
                  className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                  onClick={() => setActiveTab('files')}
                >
                  <HardDrive size={16} /> My Files
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
                  onClick={() => setActiveTab('admin')}
                >
                  <Users size={16} /> Admin Console
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {userData.email && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }} className="user-email-header">
                  {userData.email}
                </span>
              )}
              <UserButton appearance={{
                elements: {
                  avatarBox: "user-avatar-clerk"
                }
              }} />
            </div>
          </SignedIn>

          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.6rem 1.2rem', borderRadius: '10px' }}>
                <LogIn size={16} /> Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        <SignedOut>
          <div className="landing-container">
            <div className="landing-hero animate-fade-in">
              <h1 className="landing-title">
                Your Self-Hosted Personal Cloud Portal
              </h1>
              <p className="landing-subtitle">
                Store, share, and backup photos and files on your own server. Securely powered by Clerk Authentication, Postgres, and Node.js.
              </p>
            </div>

            <div className="glass landing-card">
              <Shield size={48} style={{ color: 'var(--primary)', marginBottom: '1.25rem' }} />
              <h2 style={{ fontFamily: 'var(--title-font)', fontWeight: '600', marginBottom: '0.5rem' }}>Homelab Access Portal</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                This portal is private and restricted. Sign in with your registered account credentials to view and manage files.
              </p>
              
              <SignInButton mode="modal">
                <button className="auth-button">
                  Access Portal
                </button>
              </SignInButton>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {loadingUser ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
            </div>
          ) : activeTab === 'admin' && userData.isAdmin ? (
            <div className="dashboard-container">
              <AdminPortal />
            </div>
          ) : (
            <Dashboard />
          )}
        </SignedIn>
      </main>
    </>
  );
}

export default App;
