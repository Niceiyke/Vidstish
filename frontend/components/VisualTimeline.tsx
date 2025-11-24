'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useTimelineStore } from '../store/timelineStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { clsx } from 'clsx';

export type VisualTimelineProps = {
  videoUrl?: string;
  userId: string;
  youtubeId: string;
  apiBaseUrl?: string;
  className?: string;
};

export const VisualTimeline: React.FC<VisualTimelineProps> = ({
  videoUrl,
  userId,
  youtubeId,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  className
}) => {
  const {
    segments,
    videoDuration,
    currentTime,
    isPlaying,
    selectedSegments,
    updateSegment,
    addSegment,
    removeSegment,
    selectSegment,
    clearSelection,
    setCurrentTime,
    setIsPlaying,
    setVideoInfo,
    undo,
    redo,
    canUndo,
    canRedo,
    saveToHistory,
    lastSaved
  } = useTimelineStore();

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !videoUrl) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4A90E2',
      progressColor: '#5B21B6',
      cursorColor: '#E5E7EB',
      barWidth: 2,
      barGap: 1,
      height: isMobile ? 60 : 80,
      normalize: true,
    });

    wavesurfer.load(videoUrl);
    wavesurferRef.current = wavesurfer;

    // Event listeners
    wavesurfer.on('ready', () => {
      console.log('WaveSurfer ready');
      setVideoInfo(videoUrl, wavesurfer.getDuration());
    });

    wavesurfer.on('play', () => {
      setIsPlaying(true);
    });

    wavesurfer.on('pause', () => {
      setIsPlaying(false);
    });

    wavesurfer.on('timeupdate', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('click', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    return () => {
      wavesurfer.destroy();
    };
  }, [videoUrl, setVideoInfo, setIsPlaying, setCurrentTime, isMobile]);

  // Update playback state
  useEffect(() => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.play();
      } else {
        wavesurferRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Update current time
  useEffect(() => {
    if (wavesurferRef.current && videoDuration > 0) {
      const progress = currentTime / videoDuration;
      wavesurferRef.current.seekTo(progress);
    }
  }, [currentTime, videoDuration]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSegmentClick = useCallback((segmentId: string, event: React.MouseEvent) => {
    selectSegment(segmentId, event.ctrlKey || event.metaKey);
  }, [selectSegment]);

  const handleSegmentDrag = useCallback((segmentId: string, newStart: number, newEnd: number) => {
    updateSegment(segmentId, { start: newStart, end: newEnd });
  }, [updateSegment]);

  const handleBulkDelete = useCallback(() => {
    selectedSegments.forEach(id => removeSegment(id));
    clearSelection();
    setShowBulkActions(false);
  }, [selectedSegments, removeSegment, clearSelection]);

  const handleBulkMerge = useCallback(() => {
    // Implement bulk merge logic
    console.log('Bulk merge triggered');
    clearSelection();
    setShowBulkActions(false);
  }, [clearSelection]);

  const handleBulkTrim = useCallback(() => {
    // Implement bulk trim logic
    console.log('Bulk trim triggered');
    clearSelection();
    setShowBulkActions(false);
  }, [clearSelection]);

  const renderTimeline = () => {
    if (!videoDuration) return null;

    const timelineWidth = 1000; // Base width for calculations
    const pixelsPerSecond = timelineWidth / videoDuration;

    return (
      <div className="timeline-container" ref={timelineRef}>
        <div className="timeline-ruler">
          {Array.from({ length: Math.ceil(videoDuration / 10) + 1 }, (_, i) => (
            <div
              key={i}
              className="timeline-marker"
              style={{ left: `${(i * 10 * pixelsPerSecond) / timelineWidth * 100}%` }}
            >
              <span className="timeline-time">{formatTime(i * 10)}</span>
            </div>
          ))}
        </div>

        <div className="segments-container">
          {segments.map((segment, index) => {
            const left = (segment.start * pixelsPerSecond) / timelineWidth * 100;
            const width = ((segment.end - segment.start) * pixelsPerSecond) / timelineWidth * 100;
            const isSelected = selectedSegments.has(segment.id);

            return (
              <div
                key={segment.id}
                className={clsx(
                  'timeline-segment',
                  { 'segment-selected': isSelected },
                  { 'segment-mobile': isMobile }
                )}
                style={{
                  left: `${left}%`,
                  width: `${width}%`
                }}
                onClick={(e) => handleSegmentClick(segment.id, e)}
                role="button"
                tabIndex={0}
                aria-label={`Segment ${index + 1}: ${formatTime(segment.start)} to ${formatTime(segment.end)}`}
              >
                <div className="segment-handle segment-start" />
                <div className="segment-content">
                  <span className="segment-number">{index + 1}</span>
                  <span className="segment-duration">{formatTime(segment.end - segment.start)}</span>
                </div>
                <div className="segment-handle segment-end" />
              </div>
            );
          })}
        </div>

        <div
          className="timeline-progress"
          style={{ left: `${(currentTime * pixelsPerSecond) / timelineWidth * 100}%` }}
        />
      </div>
    );
  };

  const renderBulkActions = () => {
    if (selectedSegments.size === 0) return null;

    return (
      <div className={clsx('bulk-actions', { 'bulk-mobile': isMobile })}>
        <span className="bulk-count">{selectedSegments.size} selected</span>
        <div className="bulk-buttons">
          <button
            className="bulk-button"
            onClick={handleBulkDelete}
            aria-label="Delete selected segments"
          >
            🗑️ Delete
          </button>
          <button
            className="bulk-button"
            onClick={handleBulkMerge}
            aria-label="Merge selected segments"
          >
            🔗 Merge
          </button>
          <button
            className="bulk-button"
            onClick={handleBulkTrim}
            aria-label="Trim selected segments"
          >
            ✂️ Trim
          </button>
          <button
            className="bulk-button"
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            ❌ Clear
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={clsx('visual-timeline', className, { 'timeline-mobile': isMobile })}>
      {/* Waveform Visualization */}
      <div className="waveform-container">
        <div ref={waveformRef} className="waveform" />
        {!videoUrl && (
          <div className="waveform-placeholder">
            <p>Video waveform will appear here</p>
          </div>
        )}
      </div>

      {/* Timeline Controls */}
      <div className="timeline-controls">
        <div className="control-group">
          <button
            className={clsx('control-button', { 'button-active': isPlaying })}
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          
          <div className="time-display">
            <span className="current-time">{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="total-time">{formatTime(videoDuration)}</span>
          </div>

          <div className="history-controls">
            <button
              className="control-button"
              onClick={undo}
              disabled={!canUndo()}
              aria-label="Undo"
            >
              ↶
            </button>
            <button
              className="control-button"
              onClick={redo}
              disabled={!canRedo()}
              aria-label="Redo"
            >
              ↷
            </button>
          </div>
        </div>

        {lastSaved && (
          <div className="save-status">
            Last saved: {lastSaved.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Interactive Timeline */}
      {renderTimeline()}

      {/* Bulk Actions */}
      {renderBulkActions()}

      {/* Mobile-specific controls */}
      {isMobile && (
        <div className="mobile-controls">
          <button
            className="mobile-add-segment"
            onClick={() => addSegment()}
            aria-label="Add segment"
          >
            + Add Segment
          </button>
        </div>
      )}

      {/* Desktop controls */}
      {!isMobile && (
        <div className="desktop-controls">
          <button
            className="button secondary"
            onClick={() => addSegment()}
            aria-label="Add segment"
          >
            + Add Segment
          </button>
        </div>
      )}
    </div>
  );
};

export default VisualTimeline;