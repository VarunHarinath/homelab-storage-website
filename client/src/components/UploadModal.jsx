import React, { useState, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { X, UploadCloud, File, AlertCircle, FolderSync } from 'lucide-react';
import { formatBytes } from './FileCard';

// Recursive Helper to parse dropped files/directories
const traverseFileTree = async (item, path = '') => {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file((file) => {
        // Create custom property to store full relative path
        file.relativePath = path + file.name;
        resolve([file]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const readAllEntries = async () => {
        let allEntries = [];
        let readEntries = async () => {
          return new Promise((resolveRead) => {
            dirReader.readEntries((entries) => {
              resolveRead(entries);
            });
          });
        };
        
        let entries = await readEntries();
        while (entries.length > 0) {
          allEntries = allEntries.concat(entries);
          entries = await readEntries(); // Read next batch (handles chrome limit of 100 entries)
        }
        return allEntries;
      };

      readAllEntries().then(async (entries) => {
        const filePromises = entries.map(entry => traverseFileTree(entry, path + item.name + '/'));
        const filesArray = await Promise.all(filePromises);
        resolve(filesArray.flat());
      });
    } else {
      resolve([]);
    }
  });
};

const UploadModal = ({ isOpen, onClose, onUploadSuccess }) => {
  const { getToken } = useAuth();
  
  // State variables
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  if (!isOpen) return null;

  // Drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (uploading) return;

    if (e.dataTransfer.items) {
      const promises = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i].webkitGetAsEntry();
        if (item) {
          promises.push(traverseFileTree(item));
        }
      }
      const results = await Promise.all(promises);
      const allFiles = results.flat();
      handleFilesSelected(allFiles);
    } else if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files).map(file => {
        file.relativePath = file.name;
        return file;
      });
      handleFilesSelected(files);
    }
  };

  // Input select handlers
  const handleFileChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).map(file => {
        file.relativePath = file.name;
        return file;
      });
      handleFilesSelected(files);
    }
  };

  const handleFolderChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).map(file => {
        // webkitRelativePath contains the full relative path e.g. "my-folder/sub/pic.jpg"
        file.relativePath = file.webkitRelativePath || file.name;
        return file;
      });
      handleFilesSelected(files);
    }
  };

  const handleFilesSelected = (files) => {
    // Append newly selected files to existing list
    setSelectedFiles(prev => [...prev, ...files]);
    setError(null);
    setUploadProgress(0);
    setCurrentFileIndex(0);
  };

  // Sequentially uploads files to avoid server memory overload
  const startUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setError(null);
    
    const uploadedFiles = [];

    try {
      const token = await getToken();
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileIndex(i);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        // Pass relative path so directory structures are registered
        formData.append('relativePath', file.relativePath || file.name);

        const response = await axios.post('/api/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${token}`
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        });

        uploadedFiles.push(response.data);
      }

      // Clear selection and notify success
      setSelectedFiles([]);
      setUploading(false);
      onUploadSuccess(uploadedFiles);
      onClose();
    } catch (err) {
      console.error('Sequence upload error:', err);
      setError(err.response?.data?.error || 'Upload was interrupted. Some files might have succeeded.');
      setUploading(false);
      
      // Refresh user view with whichever files actually uploaded
      if (uploadedFiles.length > 0) {
        onUploadSuccess(uploadedFiles);
      }
    }
  };

  const triggerFileSelect = (e) => {
    e.stopPropagation();
    fileInputRef.current.click();
  };

  const triggerFolderSelect = (e) => {
    e.stopPropagation();
    folderInputRef.current.click();
  };

  return (
    <div className="modal-overlay" onClick={uploading ? null : onClose}>
      <div className="glass modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        {!uploading && (
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        )}
        <h2 className="modal-title">Upload Files & Folders</h2>
        
        {/* Dropzone Container */}
        <div 
          className={`dropzone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          style={{ padding: '2.5rem 1.5rem', pointerEvents: uploading ? 'none' : 'auto' }}
        >
          {/* File Picker Inputs */}
          <input 
            type="file" 
            className="file-input" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            multiple
          />
          <input 
            type="file" 
            className="file-input" 
            ref={folderInputRef} 
            onChange={handleFolderChange}
            webkitdirectory="true"
            directory="true"
            multiple
          />

          <UploadCloud size={44} className="dropzone-icon" />
          
          <div>
            <p style={{ fontWeight: '600', color: 'white', fontSize: '1.05rem' }}>Drag & Drop files or folders here</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>or use the select pickers below</p>
          </div>

          {!uploading && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn-secondary" onClick={triggerFileSelect} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                <File size={14} /> Select Files
              </button>
              <button type="button" className="btn-secondary" onClick={triggerFolderSelect} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
                <FolderSync size={14} /> Select Folder
              </button>
            </div>
          )}
        </div>

        {/* Selected Files Queue List */}
        {selectedFiles.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <span>Queue: {selectedFiles.length} item(s) selected</span>
              {!uploading && (
                <button 
                  onClick={() => setSelectedFiles([])} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Clear Queue
                </button>
              )}
            </div>
            
            {/* Scrollable File List Card */}
            <div 
              style={{ 
                maxHeight: '160px', 
                overflowY: 'auto', 
                background: 'var(--bg-input)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                padding: '0.5rem'
              }}
            >
              {selectedFiles.slice(0, 100).map((file, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '0.8rem', 
                    padding: '0.25rem 0.5rem',
                    borderBottom: idx === selectedFiles.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)'
                  }}
                >
                  <span style={{ color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }} title={file.relativePath}>
                    {file.relativePath}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatBytes(file.size)}</span>
                </div>
              ))}
              {selectedFiles.length > 100 && (
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.25rem 0' }}>
                  ... and {selectedFiles.length - 100} more files
                </div>
              )}
            </div>
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="alert error" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Progress Tracker UI */}
        {uploading && (
          <div className="progress-container">
            <div className="progress-header">
              <span style={{ fontWeight: '500', color: 'white' }}>
                Uploading {currentFileIndex + 1} of {selectedFiles.length}
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              File: {selectedFiles[currentFileIndex]?.relativePath}
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {selectedFiles.length > 0 && !uploading && (
          <button 
            className="auth-button"
            onClick={startUpload}
            style={{ width: '100%', marginTop: '1.25rem' }}
          >
            Upload {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files/Folders'}
          </button>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
