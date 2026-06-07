import React, { useState, useEffect, useRef } from 'react';
import { 
  SignedIn, 
  SignedOut, 
  useAuth 
} from './contexts/AuthContext';
import { HardDrive, Shield, Users, LogIn, LogOut, ChevronDown, User, Key } from 'lucide-react';
import Dashboard from './components/Dashboard';
import AdminPortal from './components/AdminPortal';

// Custom Dropdown UserButton replacement
const CustomUserButton = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const toggleDropdown = () => setIsOpen(prev => !isOpen);

  // Close dropdown on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="user-dropdown-container" ref={dropdownRef}>
      <button className="user-dropdown-trigger" onClick={toggleDropdown}>
        <div className="user-dropdown-avatar">
          {initials}
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      
      {isOpen && (
        <div className="user-dropdown-menu">
          <div className="user-dropdown-info">
            <div className="user-dropdown-name">
              {user?.firstName || user?.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Homelab User'}
            </div>
            <div className="user-dropdown-email">{user?.email || ''}</div>
          </div>
          <button className="user-dropdown-item logout" onClick={() => { setIsOpen(false); onLogout(); }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

function App() {
  const { isLoaded, userId, user, logout, login, register } = useAuth();
  const [activeTab, setActiveTab] = useState('files'); // files, admin
  const [userData, setUserData] = useState({ isAdmin: false });
  const [loadingUser, setLoadingUser] = useState(false);
  
  // Custom Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Check if server database has no users (requires initial admin setup)
  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        setRequiresSetup(data.requiresSetup);
        if (data.requiresSetup) {
          setShowAuthModal(true); // Auto-open setup if no admin exists
        }
      }
    } catch (err) {
      console.error('Failed to check database setup status:', err);
    }
  };

  useEffect(() => {
    checkSetupStatus();
  }, [userId]);

  // Sync user profile details
  useEffect(() => {
    if (user) {
      setUserData(user);
    } else {
      setUserData({ isAdmin: false });
    }
  }, [user]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (requiresSetup) {
        await register(authEmail, authPassword, authFirstName, authLastName);
        setRequiresSetup(false);
      } else {
        await login(authEmail, authPassword);
      }
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthFirstName('');
      setAuthLastName('');
    } catch (err) {
      console.error(err);
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <>
      {/* Header element */}
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
              <CustomUserButton user={userData} onLogout={logout} />
            </div>
          </SignedIn>

          <SignedOut>
            <button 
              className="btn-secondary" 
              onClick={() => { setShowAuthModal(true); setAuthError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.6rem 1.2rem', borderRadius: '10px' }}
            >
              <LogIn size={16} /> {requiresSetup ? 'Setup Admin' : 'Sign In'}
            </button>
          </SignedOut>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        <SignedOut>
          <div className="landing-container">
            <div className="glass landing-card">
              <Shield size={48} style={{ color: 'var(--primary)', marginBottom: '1.25rem' }} />
              <h2 style={{ fontFamily: 'var(--title-font)', fontWeight: '600', marginBottom: '0.5rem' }}>Homelab Access Portal</h2>
              {requiresSetup ? (
                <>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Welcome! No accounts detected on this server. Please create the initial Administrator account to manage your storage.
                  </p>
                  <button className="auth-button" onClick={() => { setShowAuthModal(true); setAuthError(''); }}>
                    Initialize Server Admin
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    This portal is private and restricted. Sign in with your registered account credentials to view and manage files.
                  </p>
                  <button className="auth-button" onClick={() => { setShowAuthModal(true); setAuthError(''); }}>
                    Access Portal
                  </button>
                </>
              )}
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {loadingUser || !isLoaded ? (
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

      {/* Custom Auth Modal (Login / Initial setup) */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={requiresSetup ? null : () => setShowAuthModal(false)}>
          <div className="glass modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            {!requiresSetup && (
              <button className="close-btn" onClick={() => setShowAuthModal(false)}>
                ✕
              </button>
            )}
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <Shield size={36} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
              <h2 style={{ fontFamily: 'var(--title-font)', fontWeight: '600', fontSize: '1.4rem' }}>
                {requiresSetup ? 'Initial Server Setup' : 'Sign In to Storage'}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {requiresSetup 
                  ? 'Create the primary administrator account below' 
                  : 'Enter your homelab credentials to log in'
                }
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {requiresSetup && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">First Name</label>
                    <input 
                      type="text" 
                      id="firstName" 
                      className="form-input" 
                      value={authFirstName} 
                      onChange={(e) => setAuthFirstName(e.target.value)} 
                      placeholder="Jane"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lastName">Last Name</label>
                    <input 
                      type="text" 
                      id="lastName" 
                      className="form-input" 
                      value={authLastName} 
                      onChange={(e) => setAuthLastName(e.target.value)} 
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input 
                  type="email" 
                  id="email" 
                  className="form-input" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input 
                  type="password" 
                  id="password" 
                  className="form-input" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </div>

              {authError && (
                <div className="alert error" style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem', marginTop: '0.5rem' }}>
                  {authError}
                </div>
              )}

              <button 
                type="submit" 
                className="submit-btn" 
                disabled={authLoading}
                style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem' }}
              >
                {authLoading 
                  ? 'Connecting...' 
                  : requiresSetup ? 'Create Admin Account' : 'Sign In'
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
