import React, { useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { clsx } from 'clsx';

interface BulkOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: 'merge' | 'trim' | 'metadata' | null;
}

export const BulkOperationsModal: React.FC<BulkOperationsModalProps> = ({
  isOpen,
  onClose,
  operation
}) => {
  const {
    segments,
    selectedSegments,
    mergeSelectedSegments,
    trimSelectedSegments,
    clearSelection
  } = useTimelineStore();

  const [trimValues, setTrimValues] = useState({
    start: 0,
    end: 0,
    usePercentage: false
  });

  const [metadataValues, setMetadataValues] = useState({
    title: '',
    description: '',
    tags: ''
  });

  const selectedSegmentList = segments.filter(s => selectedSegments.has(s.id));

  if (!isOpen || !operation || selectedSegments.size === 0) return null;

  const handleMerge = () => {
    mergeSelectedSegments();
    onClose();
  };

  const handleTrim = () => {
    const { start, end } = trimValues;
    trimSelectedSegments(start, end);
    onClose();
  };

  const handleMetadataUpdate = () => {
    // Implement metadata update logic
    console.log('Updating metadata for selected segments:', metadataValues);
    onClose();
  };

  const renderMergeContent = () => (
    <div className="modal-section">
      <h4>Merge {selectedSegments.size} Segments</h4>
      <p className="modal-description">
        This will combine all selected segments into a single segment spanning from the earliest start time to the latest end time.
      </p>
      
      <div className="segment-preview">
        <h5>Segments to be merged:</h5>
        {selectedSegmentList.map((segment, index) => (
          <div key={segment.id} className="preview-item">
            <span>Segment {index + 1}:</span>
            <span>{Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1)} - {Math.floor(segment.end / 60)}:{(segment.end % 60).toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div className="merge-result">
        <h5>Result:</h5>
        <div className="preview-item result">
          <span>Merged Segment:</span>
          <span>
            {Math.floor(Math.min(...selectedSegmentList.map(s => s.start)) / 60)}:{(Math.min(...selectedSegmentList.map(s => s.start)) % 60).toFixed(1)} - {Math.floor(Math.max(...selectedSegmentList.map(s => s.end)) / 60)}:{(Math.max(...selectedSegmentList.map(s => s.end)) % 60).toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );

  const renderTrimContent = () => (
    <div className="modal-section">
      <h4>Trim Selected Segments</h4>
      <p className="modal-description">
        Apply the same start and end times to all selected segments.
      </p>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={trimValues.usePercentage}
            onChange={(e) => setTrimValues(prev => ({ ...prev, usePercentage: e.target.checked }))}
          />
          Use percentage values
        </label>
      </div>

      <div className="trim-controls">
        <div className="form-group">
          <label>Start Time:</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={trimValues.start}
            onChange={(e) => setTrimValues(prev => ({ ...prev, start: parseFloat(e.target.value) || 0 }))}
            placeholder={trimValues.usePercentage ? "0-100%" : "seconds"}
          />
        </div>

        <div className="form-group">
          <label>End Time:</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={trimValues.end}
            onChange={(e) => setTrimValues(prev => ({ ...prev, end: parseFloat(e.target.value) || 0 }))}
            placeholder={trimValues.usePercentage ? "0-100%" : "seconds"}
          />
        </div>
      </div>

      <div className="segment-preview">
        <h5>Affected Segments:</h5>
        {selectedSegmentList.map((segment, index) => (
          <div key={segment.id} className="preview-item">
            <span>Segment {index + 1}:</span>
            <span>{Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1)} - {Math.floor(segment.end / 60)}:{(segment.end % 60).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMetadataContent = () => (
    <div className="modal-section">
      <h4>Update Metadata for {selectedSegments.size} Segments</h4>
      <p className="modal-description">
        Apply the same metadata to all selected segments.
      </p>

      <div className="form-group">
        <label>Title:</label>
        <input
          type="text"
          value={metadataValues.title}
          onChange={(e) => setMetadataValues(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Common title for selected segments"
        />
      </div>

      <div className="form-group">
        <label>Description:</label>
        <textarea
          value={metadataValues.description}
          onChange={(e) => setMetadataValues(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Common description for selected segments"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>Tags:</label>
        <input
          type="text"
          value={metadataValues.tags}
          onChange={(e) => setMetadataValues(prev => ({ ...prev, tags: e.target.value }))}
          placeholder="Comma-separated tags"
        />
      </div>

      <div className="segment-preview">
        <h5>Affected Segments:</h5>
        {selectedSegmentList.map((segment, index) => (
          <div key={segment.id} className="preview-item">
            <span>Segment {index + 1}:</span>
            <span>{Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1)} - {Math.floor(segment.end / 60)}:{(segment.end % 60).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bulk-operations-overlay" onClick={onClose}>
      <div 
        className="bulk-operations-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Bulk Operations</h3>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Close bulk operations"
          >
            ×
          </button>
        </div>

        <div className="modal-content">
          {operation === 'merge' && renderMergeContent()}
          {operation === 'trim' && renderTrimContent()}
          {operation === 'metadata' && renderMetadataContent()}
        </div>

        <div className="modal-footer">
          <button 
            className="button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="button"
            onClick={
              operation === 'merge' ? handleMerge :
              operation === 'trim' ? handleTrim :
              handleMetadataUpdate
            }
          >
            {operation === 'merge' ? 'Merge Segments' :
             operation === 'trim' ? 'Apply Trim' :
             'Update Metadata'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkOperationsModal;