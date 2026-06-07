import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import JSZip from 'jszip';
import { 
  Search, 
  Upload, 
  Trash2, 
  Download, 
  FolderOpen, 
  HardDrive, 
  FileText, 
  Image as ImageIcon,
  Archive,
  Loader2,
  CheckSquare,
  Square
} from 'lucide-react';
import FileCard, { formatBytes } from './FileCard';
import UploadModal from './UploadModal';
import QuickViewModal from './QuickViewModal';

const Dashboard = () => {
  const { getToken } = useAuth();
  
  // File state
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, images, documents, others
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  // Preview modal state
  const [previewFile, setPreviewFile] = useState(null);
  
  // ZIP downloading progress state
  const [zipCompiling, setZipCompiling] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  // Fetch files from backend
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/files', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data = await response.json();
      setFiles(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not retrieve file metadata from the database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const isDocumentType = (mimeType) => {
    if (!mimeType) return false;
    const lower = mimeType.toLowerCase();
    return (
      lower.startsWith('text/') ||
      lower.includes('pdf') ||
      lower.includes('word') ||
      lower.includes('excel') ||
      lower.includes('spreadsheet') ||
      lower.includes('presentation') ||
      lower.includes('powerpoint') ||
      lower.includes('document') ||
      lower.includes('sheet') ||
      lower.includes('csv')
    );
  };

  // Filtered files list
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.original_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'images') {
      return matchesSearch && file.mime_type.startsWith('image/');
    }
    if (filterType === 'documents') {
      return matchesSearch && isDocumentType(file.mime_type);
    }
    if (filterType === 'archives') {
      return matchesSearch && (
        file.mime_type.includes('zip') || 
        file.mime_type.includes('tar') || 
        file.mime_type.includes('compressed') ||
        file.mime_type.includes('rar')
      );
    }
    return matchesSearch;
  });

  // Calculate statistics
  const totalStorage = files.reduce((acc, curr) => acc + parseInt(curr.size), 0);
  const imageCount = files.filter(f => f.mime_type.startsWith('image/')).length;
  const docCount = files.filter(f => isDocumentType(f.mime_type)).length;

  // Toggle selection
  const handleSelectFile = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredFiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFiles.map(f => f.id));
    }
  };

  // Download single file
  const handleSingleDownload = async (file) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/files/${file.id}?download=true`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Could not download file.');
    }
  };

  // Download selected files as ZIP
  const handleZipDownload = async () => {
    if (selectedIds.length === 0) return;
    
    setZipCompiling(true);
    setZipProgress('Initializing ZIP compression...');

    try {
      const token = await getToken();
      const zip = new JSZip();
      const filesToZip = files.filter(f => selectedIds.includes(f.id));
      
      // Use standard naming and handle duplicate file names
      const nameCounts = {};

      for (let i = 0; i < filesToZip.length; i++) {
        const file = filesToZip[i];
        setZipProgress(`Downloading file ${i + 1} of ${filesToZip.length}: ${file.original_name}`);
        
        const response = await fetch(`/api/files/${file.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) throw new Error(`Failed to fetch ${file.original_name}`);
        
        const blob = await response.blob();
        
        // Handle name collision
        let name = file.original_name;
        if (nameCounts[name] !== undefined) {
          nameCounts[name]++;
          const extIndex = name.lastIndexOf('.');
          if (extIndex !== -1) {
            name = `${name.substring(0, extIndex)} (${nameCounts[name]})${name.substring(extIndex)}`;
          } else {
            name = `${name} (${nameCounts[name]})`;
          }
        } else {
          nameCounts[name] = 0;
        }

        zip.file(name, blob);
      }

      setZipProgress('Assembling ZIP file on your system...');
      const zipContent = await zip.generateAsync({ type: 'blob' });
      
      const url = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = url;
      a.download = `homelab-files-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setZipCompiling(false);
      setZipProgress('');
      setSelectedIds([]);
    } catch (err) {
      console.error('ZIP generation error:', err);
      alert(`ZIP creation failed: ${err.message}`);
      setZipCompiling(false);
      setZipProgress('');
    }
  };

  // Delete single file
  const handleDeleteFile = async (id) => {
    if (!confirm('Are you sure you want to delete this file from the homelab server?')) return;
    
    try {
      const token = await getToken();
      const response = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Deletion failed');
      
      setFiles(prev => prev.filter(f => f.id !== id));
      setSelectedIds(prev => prev.filter(item => item !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to delete file.');
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected files?`)) return;
    
    try {
      const token = await getToken();
      
      // Delete in parallel
      await Promise.all(
        selectedIds.map(id => 
          fetch(`/api/files/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
        )
      );

      setFiles(prev => prev.filter(f => !selectedIds.includes(f.id)));
      setSelectedIds([]);
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Failed to delete some files. Refreshing directory.');
      fetchFiles();
    }
  };

  const handleUploadSuccess = (newFiles) => {
    if (Array.isArray(newFiles)) {
      setFiles(prev => [...newFiles, ...prev]);
    } else {
      setFiles(prev => [newFiles, ...prev]);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Stats Summary Grid */}
      <div className="stats-grid">
        <div className="glass stat-card">
          <div className="stat-icon-container primary">
            <HardDrive size={24} />
          </div>
          <div className="stat-details">
            <h3>Storage Used</h3>
            <div className="stat-value">{formatBytes(totalStorage)}</div>
          </div>
        </div>

        <div className="glass stat-card">
          <div className="stat-icon-container cyan">
            <ImageIcon size={24} />
          </div>
          <div className="stat-details">
            <h3>Photos & Images</h3>
            <div className="stat-value">{imageCount}</div>
          </div>
        </div>

        <div className="glass stat-card">
          <div className="stat-icon-container emerald">
            <FileText size={24} />
          </div>
          <div className="stat-details">
            <h3>Documents</h3>
            <div className="stat-value">{docCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Upload Control Bar */}
      <div className="filter-bar">
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Search files by name..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={18} className="search-icon" />
        </div>

        <div className="filter-options" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="pill-filters">
            <button 
              className={`pill-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              <HardDrive size={14} /> All Files
            </button>
            <button 
              className={`pill-btn ${filterType === 'images' ? 'active' : ''}`}
              onClick={() => setFilterType('images')}
            >
              <ImageIcon size={14} /> Photos
            </button>
            <button 
              className={`pill-btn ${filterType === 'documents' ? 'active' : ''}`}
              onClick={() => setFilterType('documents')}
            >
              <FileText size={14} /> Documents
            </button>
            <button 
              className={`pill-btn ${filterType === 'archives' ? 'active' : ''}`}
              onClick={() => setFilterType('archives')}
            >
              <Archive size={14} /> Archives
            </button>
          </div>

          <button 
            className="upload-trigger-btn"
            onClick={() => setIsUploadOpen(true)}
          >
            <Upload size={18} /> Upload File
          </button>
        </div>
      </div>

      {/* Multiselect Action Overlay Banner */}
      {selectedIds.length > 0 && (
        <div className="actions-bar">
          <span style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckSquare size={18} style={{ color: 'var(--primary)' }} />
            {selectedIds.length} {selectedIds.length === 1 ? 'file' : 'files'} selected
          </span>
          <div className="action-buttons">
            <button className="btn-secondary" onClick={() => setSelectedIds([])}>
              Cancel Selection
            </button>
            <button className="btn-zip" onClick={handleZipDownload} disabled={zipCompiling}>
              {zipCompiling ? (
                <>
                  <Loader2 size={16} className="spin" style={{ animation: 'spin 1s infinite linear' }} />
                  Compiling...
                </>
              ) : (
                <>
                  <Download size={16} /> Download ZIP
                </>
              )}
            </button>
            <button className="btn-danger-outline" onClick={handleBulkDelete}>
              <Trash2 size={16} /> Delete Selected
            </button>
          </div>
        </div>
      )}

      {zipCompiling && (
        <div className="glass" style={{ padding: '1rem', border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Loader2 className="spin" size={20} style={{ color: 'var(--accent-emerald)', animation: 'spin 1s infinite linear' }} />
          <span style={{ fontSize: '0.9rem', color: '#34D399', fontWeight: '500' }}>{zipProgress}</span>
        </div>
      )}

      {/* Main Files Area */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      ) : error ? (
        <div className="empty-state glass">
          <FolderOpen size={48} className="empty-icon" />
          <h2>Database Offline</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state glass">
          <FolderOpen size={48} className="empty-icon" />
          <h2>No files found</h2>
          {searchQuery ? (
            <p style={{ color: 'var(--text-muted)' }}>No files match your search filter "{searchQuery}"</p>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Drag and drop files to upload your first files to this homelab portal.</p>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredFiles.length} of {files.length} files
            </span>
            <button 
              onClick={handleSelectAll} 
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {selectedIds.length === filteredFiles.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          <div className="file-grid">
            {filteredFiles.map(file => (
              <FileCard 
                key={file.id}
                file={file}
                isSelected={selectedIds.includes(file.id)}
                onSelect={handleSelectFile}
                onDelete={handleDeleteFile}
                onSingleDownload={handleSingleDownload}
                onQuickView={setPreviewFile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal overlays */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      <QuickViewModal 
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleSingleDownload}
      />
    </div>
  );
};

export default Dashboard;
