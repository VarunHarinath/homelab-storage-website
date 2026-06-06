import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { X, File, Download } from 'lucide-react';
import { formatBytes } from './FileCard';

// Authenticated Media Loader
const AuthenticatedMedia = ({ fileId, mimeType, originalName }) => {
  const { getToken } = useAuth();
  const [src, setSrc] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl = null;

    const fetchMedia = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/files/${fileId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch media file');

        if (mimeType.startsWith('text/')) {
          const text = await response.text();
          setTextContent(text);
        } else {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
        setLoading(false);
      } catch (err) {
        console.error('Quick view fetch error:', err);
        setError(true);
        setLoading(false);
      }
    };

    fetchMedia();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, mimeType, getToken]);

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: '200px' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--accent-rose)' }}>
        <AlertCircle size={32} style={{ marginBottom: '0.5rem' }} />
        <p>Could not load file preview.</p>
      </div>
    );
  }

  if (mimeType.startsWith('image/')) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', maxHeight: '65vh' }}>
        <img 
          src={src} 
          alt={originalName} 
          style={{ 
            maxWidth: '100%', 
            maxHeight: '65vh', 
            borderRadius: '8px', 
            objectFit: 'contain',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
          }} 
        />
      </div>
    );
  }

  if (mimeType.startsWith('video/')) {
    return (
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <video 
          src={src} 
          controls 
          autoPlay 
          style={{ 
            maxWidth: '100%', 
            maxHeight: '65vh', 
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)' 
          }} 
        />
      </div>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return (
      <div style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
        <div 
          style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(99, 102, 241, 0.15)', 
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
            animation: 'pulse 2s infinite'
          }}
        >
          <File size={28} />
        </div>
        <audio src={src} controls autoPlay style={{ width: '100%' }} />
      </div>
    );
  }

  if (mimeType.startsWith('text/')) {
    return (
      <pre 
        style={{ 
          textAlign: 'left', 
          padding: '1.25rem', 
          background: 'var(--bg-input)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '8px', 
          maxHeight: '50vh', 
          overflow: 'auto',
          fontFamily: 'var(--mono)',
          fontSize: '0.85rem',
          color: 'var(--text-main)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {textContent}
      </pre>
    );
  }

  // Fallback for document types like PDF, docx, etc. or files without preview
  return (
    <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <File size={56} style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', opacity: '0.7' }} />
      <h3 style={{ color: 'white', fontWeight: '500', marginBottom: '0.5rem' }}>No Preview Available</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Previews are supported for images, videos, audio, and text files.
      </p>
    </div>
  );
};

const QuickViewModal = ({ file, onClose, onDownload }) => {
  if (!file) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="glass modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '720px', padding: '2.5rem 2rem 2rem' }}
      >
        <button className="close-btn" onClick={onClose}>
          <X size={20} />
        </button>

        <h2 className="modal-title" style={{ fontSize: '1.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1.5rem', marginBottom: '1.5rem' }}>
          Quick View: {file.original_name}
        </h2>

        {/* Media Preview Area */}
        <div style={{ background: 'rgba(5, 7, 12, 0.4)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', marginBottom: '1.5rem' }}>
          <AuthenticatedMedia 
            fileId={file.id} 
            mimeType={file.mime_type} 
            originalName={file.original_name} 
          />
        </div>

        {/* File Metadata Details & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            <div>
              <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>Size: </span>
              {formatBytes(parseInt(file.size))}
            </div>
            <div>
              <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>Mime-Type: </span>
              {file.mime_type}
            </div>
            <div>
              <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>Uploaded: </span>
              {new Date(file.created_at).toLocaleString()}
            </div>
          </div>

          <button 
            className="btn-zip" 
            onClick={() => {
              onDownload(file);
              onClose();
            }}
            style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Download size={16} /> Download File
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickViewModal;
