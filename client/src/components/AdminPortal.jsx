import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Users, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatBytes } from './FileCard';

const AdminPortal = () => {
  const { getToken } = useAuth();
  
  // State variables
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);
  const [formError, setFormError] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user list');
      }
      
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormSuccess(null);
    setFormError(null);

    try {
      const token = await getToken();
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, password, firstName, lastName })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setFormSuccess('User successfully registered on this server!');
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      
      // Refresh user list
      fetchUsers();
    } catch (err) {
      console.error(err);
      setFormError(err.message || 'Server error creating user');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-grid">
        {/* Create User Form Section */}
        <div className="glass admin-form">
          <h2 className="form-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={20} className="logo-icon" /> Create New User
          </h2>
          
          <form onSubmit={handleCreateUser}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="firstName">First Name</label>
              <input 
                type="text" 
                id="firstName" 
                className="form-input"
                value={firstName} 
                onChange={(e) => setFirstName(e.target.value)} 
                placeholder="e.g. Jane"
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="lastName">Last Name</label>
              <input 
                type="text" 
                id="lastName" 
                className="form-input"
                value={lastName} 
                onChange={(e) => setLastName(e.target.value)} 
                placeholder="e.g. Doe"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="email">Email Address *</label>
              <input 
                type="email" 
                id="email" 
                className="form-input"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="e.g. user@example.com"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="password">Temporary Password *</label>
              <input 
                type="password" 
                id="password" 
                className="form-input"
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>

            {formSuccess && (
              <div className="alert success" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} />
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div className="alert error" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="submit-btn"
              disabled={formLoading}
              style={{ width: '100%' }}
            >
              {formLoading ? 'Creating User...' : 'Register User'}
            </button>
          </form>
        </div>

        {/* Registered Users List Section */}
        <div className="glass users-table-container">
          <h2 className="form-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} className="logo-icon" /> Registered Homelab Users
          </h2>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
            </div>
          ) : error ? (
            <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Local User ID</th>
                  <th>Created</th>
                  <th>Storage Used</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-profile-cell">
                        <img src={u.imageUrl} alt={u.firstName || 'User'} className="user-avatar" />
                        <div>
                          <div className="user-name-display">
                            {u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'Unnamed User'}
                          </div>
                          <div className="user-email-display">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {u.id}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-main)' }}>
                      {formatBytes(u.storageUsed || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;
