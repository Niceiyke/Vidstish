'use client';

import { useState, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import VisualTimeline from '../components/VisualTimeline';
import KeyboardShortcutsHelp from '../components/KeyboardShortcutsHelp';
import BulkOperationsModal from '../components/BulkOperationsModal';
import { useTimelineStore } from '../store/timelineStore';
import { clsx } from 'clsx';

export default function EnhancedTimelinePage() {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkOperation, setBulkOperation] = useState<'merge' | 'trim' | 'metadata' | null>(null);
  const [userId] = useState('demo-user-123');
  const [youtubeId] = useState('dQw4w9WgXcQ');
  const [videoUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // Demo video

  const {
    segments,
    videoDuration,
    selectedSegments,
    autoSaveEnabled,
    lastSaved,
    isLoading,
    enableAutoSave,
    disableAutoSave
  } = useTimelineStore();

  // Global keyboard shortcuts
  useHotkeys('?', (e) => {
    e.preventDefault();
    setShowShortcutsHelp(true);
  }, { preventDefault: true });

  // Initialize with a demo video duration
  useEffect(() => {
    // Simulate loading a video with known duration
    if (videoDuration === 0) {
      // This would normally come from the video metadata
      // For demo purposes, we'll use a 300-second (5-minute) video
      // In a real app, this would be loaded from the YouTube API
      console.log('Loading demo video...');
    }
  }, [videoDuration]);

  const handleBulkOperation = (operation: 'merge' | 'trim' | 'metadata') => {
    if (selectedSegments.size === 0) {
      alert('Please select segments first');
      return;
    }
    setBulkOperation(operation);
    setShowBulkModal(true);
  };

  const toggleAutoSave = () => {
    if (autoSaveEnabled) {
      disableAutoSave();
    } else {
      enableAutoSave();
    }
  };

  return (
    <main className="enhanced-timeline-page">
      <header className="page-header">
        <div className="header-content">
          <h1>SermonClipper Enhanced Timeline</h1>
          <p className="page-description">
            Professional timeline editor with waveform visualization, keyboard shortcuts, 
            bulk operations, and mobile-optimized controls.
          </p>
        </div>
        
        <div className="header-actions">
          <div className="auto-save-status">
            <label className="auto-save-toggle">
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={toggleAutoSave}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Auto-save</span>
            </label>
            {lastSaved && (
              <span className="last-saved">
                Last saved: {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="header-buttons">
            <button
              className="header-button"
              onClick={() => setShowShortcutsHelp(true)}
              title="Keyboard shortcuts (?)"
            >
              ⌨️ Shortcuts
            </button>
            <button
              className={clsx('header-button', { 
                'button-active': selectedSegments.size > 0 
              })}
              onClick={() => handleBulkOperation('merge')}
              disabled={selectedSegments.size < 2}
              title={`Merge ${selectedSegments.size} selected segments`}
            >
              🔗 Merge
            </button>
            <button
              className={clsx('header-button', { 
                'button-active': selectedSegments.size > 0 
              })}
              onClick={() => handleBulkOperation('trim')}
              disabled={selectedSegments.size === 0}
              title={`Trim ${selectedSegments.size} selected segments`}
            >
              ✂️ Trim
            </button>
            <button
              className={clsx('header-button', { 
                'button-active': selectedSegments.size > 0 
              })}
              onClick={() => handleBulkOperation('metadata')}
              disabled={selectedSegments.size === 0}
              title={`Update metadata for ${selectedSegments.size} selected segments`}
            >
              📝 Edit
            </button>
          </div>
        </div>
      </header>

      <div className="page-content">
        <div className="timeline-section">
          <VisualTimeline
            videoUrl={videoUrl}
            userId={userId}
            youtubeId={youtubeId}
          />
        </div>

        <div className="info-panel">
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Segments</span>
              <span className="stat-value">{segments.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Selected</span>
              <span className="stat-value">{selectedSegments.size}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Duration</span>
              <span className="stat-value">
                {segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0).toFixed(1)}s
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Video Duration</span>
              <span className="stat-value">
                {videoDuration ? `${(videoDuration / 60).toFixed(1)}m` : '--'}
              </span>
            </div>
          </div>

          {segments.length > 0 && (
            <div className="segments-list">
              <h3>Segments Overview</h3>
              <div className="segments-list-content">
                {segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    className={clsx('segment-item', {
                      'segment-selected': selectedSegments.has(segment.id)
                    })}
                  >
                    <span className="segment-index">#{index + 1}</span>
                    <span className="segment-times">
                      {Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1)} - {Math.floor(segment.end / 60)}:{(segment.end % 60).toFixed(1)}
                    </span>
                    <span className="segment-duration">
                      {(segment.end - segment.start).toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Bulk Operations Modal */}
      <BulkOperationsModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        operation={bulkOperation}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Processing...</p>
          </div>
        </div>
      )}
    </main>
  );
}