import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { 
  FileText, 
  FileAudio, 
  FileVideo, 
  FileArchive, 
  File, 
  Download, 
  Trash2, 
  Image as ImageIcon,
  Eye
} from 'lucide-react';

// Secure Image Thumbnail Component
const AuthenticatedThumbnail = ({ fileId, mimeType, altText }) => {
  const { getToken } = useAuth();
  const [imgSrc, setImgSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl = null;

    const fetchImage = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/files/${fileId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Failed to load image');

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setImgSrc(objectUrl);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching image thumbnail:', err);
        setError(true);
        setLoading(false);
      }
    };

    fetchImage();

    // Cleanup object URL on unmount to prevent memory leaks
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, getToken]);

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: 'auto', height: '100%' }}>
        <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
      </div>
    );
  }

  if (error) {
    return <ImageIcon className="file-icon-large" size={40} />;
  }

  return <img src={imgSrc} alt={altText} className="thumbnail-image" loading="lazy" />;
};

// Formatter helper for file sizes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const FileCard = ({ file, isSelected, onSelect, onDelete, onSingleDownload, onQuickView }) => {
  const isImage = file.mime_type.startsWith('image/');
  
  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('audio/')) return <FileAudio className="file-icon-large" size={40} />;
    if (mimeType.startsWith('video/')) return <FileVideo className="file-icon-large" size={40} />;
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) {
      return <FileArchive className="file-icon-large" size={40} />;
    }
    return <FileText className="file-icon-large" size={40} />;
  };

  const handleCardClick = (e) => {
    // If clicking a button, checkbox or its container, don't toggle selection
    if (
      e.target.closest('.file-actions') || 
      e.target.closest('.checkbox-container') || 
      e.target.type === 'checkbox'
    ) {
      return;
    }
    onSelect(file.id);
  };

  return (
    <div 
      className={`glass file-card ${isSelected ? 'selected' : ''}`}
      onClick={handleCardClick}
    >
      <div className="checkbox-container">
        <input 
          type="checkbox" 
          className="file-checkbox" 
          checked={isSelected}
          onChange={() => onSelect(file.id)}
        />
      </div>

      <div className="file-preview">
        {isImage ? (
          <AuthenticatedThumbnail 
            fileId={file.id} 
            mimeType={file.mime_type} 
            altText={file.original_name} 
          />
        ) : (
          getFileIcon(file.mime_type)
        )}
      </div>

      <div className="file-info">
        <div className="file-name" title={file.original_name}>
          {file.original_name}
        </div>
        <div className="file-meta">
          <span>{formatBytes(parseInt(file.size))}</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="file-actions">
        <button 
          className="icon-btn" 
          title="Quick View"
          onClick={() => onQuickView(file)}
        >
          <Eye size={16} />
        </button>
        <button 
          className="icon-btn" 
          title="Download"
          onClick={() => onSingleDownload(file)}
        >
          <Download size={16} />
        </button>
        <button 
          className="icon-btn delete" 
          title="Delete"
          onClick={() => onDelete(file.id)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default FileCard;
export { formatBytes };
