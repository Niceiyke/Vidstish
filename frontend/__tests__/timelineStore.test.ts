import { renderHook, act } from '@testing-library/react';
import { useTimelineStore } from '../store/timelineStore';

describe('Timeline Store', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useTimelineStore());
    act(() => {
      result.current.setSegments([]);
    });
  });

  test('should initialize with empty segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    expect(result.current.segments).toEqual([]);
    expect(result.current.selectedSegments.size).toBe(0);
    expect(result.current.canUndo()).toBe(false);
    expect(result.current.canRedo()).toBe(false);
  });

  test('should add a segment', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
    });
    
    expect(result.current.segments.length).toBe(1);
    expect(result.current.segments[0].start).toBe(0);
    expect(result.current.segments[0].end).toBe(10);
  });

  test('should update a segment', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add initial segment
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
    });
    
    const segmentId = result.current.segments[0].id;
    
    act(() => {
      result.current.updateSegment(segmentId, { start: 5, end: 15 });
    });
    
    expect(result.current.segments[0].start).toBe(5);
    expect(result.current.segments[0].end).toBe(15);
  });

  test('should remove a segment', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add two segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
    });
    
    expect(result.current.segments.length).toBe(2);
    
    const segmentId = result.current.segments[0].id;
    
    act(() => {
      result.current.removeSegment(segmentId);
    });
    
    expect(result.current.segments.length).toBe(1);
    expect(result.current.segments[0].start).toBe(15);
  });

  test('should handle segment selection', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
    });
    
    const segment1Id = result.current.segments[0].id;
    const segment2Id = result.current.segments[1].id;
    
    // Select first segment
    act(() => {
      result.current.selectSegment(segment1Id);
    });
    
    expect(result.current.selectedSegments.has(segment1Id)).toBe(true);
    expect(result.current.selectedSegments.size).toBe(1);
    
    // Select second segment with multi-select
    act(() => {
      result.current.selectSegment(segment2Id, true);
    });
    
    expect(result.current.selectedSegments.has(segment1Id)).toBe(true);
    expect(result.current.selectedSegments.has(segment2Id)).toBe(true);
    expect(result.current.selectedSegments.size).toBe(2);
    
    // Single select should clear other selections
    act(() => {
      result.current.selectSegment(segment1Id, false);
    });
    
    expect(result.current.selectedSegments.has(segment1Id)).toBe(true);
    expect(result.current.selectedSegments.has(segment2Id)).toBe(false);
    expect(result.current.selectedSegments.size).toBe(1);
  });

  test('should clear selection', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments and select them
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
    });
    
    act(() => {
      result.current.selectAll();
    });
    
    expect(result.current.selectedSegments.size).toBe(2);
    
    act(() => {
      result.current.clearSelection();
    });
    
    expect(result.current.selectedSegments.size).toBe(0);
  });

  test('should select all segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
      result.current.addSegment({ start: 30, end: 40 });
    });
    
    act(() => {
      result.current.selectAll();
    });
    
    expect(result.current.selectedSegments.size).toBe(3);
  });

  test('should remove selected segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
      result.current.addSegment({ start: 30, end: 40 });
    });
    
    // Select first two segments
    act(() => {
      result.current.selectAll();
      result.current.removeSelectedSegments();
    });
    
    expect(result.current.segments.length).toBe(1);
    expect(result.current.selectedSegments.size).toBe(0);
  });

  test('should merge selected segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add overlapping segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 8, end: 15 });
      result.current.addSegment({ start: 20, end: 30 });
    });
    
    // Select first two segments
    act(() => {
      const segmentIds = result.current.segments.map(s => s.id);
      segmentIds.slice(0, 2).forEach(id => {
        result.current.selectSegment(id, true);
      });
      result.current.mergeSelectedSegments();
    });
    
    expect(result.current.segments.length).toBe(2); // One merged, one original
    expect(result.current.selectedSegments.size).toBe(0);
    
    // Find the merged segment
    const mergedSegment = result.current.segments.find(s => s.start === 0 && s.end === 15);
    expect(mergedSegment).toBeDefined();
  });

  test('should trim selected segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
    });
    
    // Select first segment
    act(() => {
      const segmentId = result.current.segments[0].id;
      result.current.selectSegment(segmentId);
      result.current.trimSelectedSegments(2, 8);
    });
    
    expect(result.current.segments[0].start).toBe(2);
    expect(result.current.segments[0].end).toBe(8);
    expect(result.current.selectedSegments.size).toBe(0);
  });

  test('should handle undo/redo functionality', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add initial segment
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
    });
    
    expect(result.current.canUndo()).toBe(true);
    expect(result.current.canRedo()).toBe(false);
    
    // Update the segment
    act(() => {
      const segmentId = result.current.segments[0].id;
      result.current.updateSegment(segmentId, { start: 5, end: 15 });
    });
    
    // Undo the change
    act(() => {
      result.current.undo();
    });
    
    expect(result.current.segments[0].start).toBe(0);
    expect(result.current.canUndo()).toBe(true);
    expect(result.current.canRedo()).toBe(true);
    
    // Redo the change
    act(() => {
      result.current.redo();
    });
    
    expect(result.current.segments[0].start).toBe(5);
    expect(result.current.canUndo()).toBe(true);
    expect(result.current.canRedo()).toBe(false);
  });

  test('should handle reordering segments', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add segments
    act(() => {
      result.current.addSegment({ start: 0, end: 10 });
      result.current.addSegment({ start: 15, end: 25 });
      result.current.addSegment({ start: 30, end: 40 });
    });
    
    expect(result.current.segments[0].start).toBe(0);
    expect(result.current.segments[1].start).toBe(15);
    
    // Move second segment up
    act(() => {
      result.current.reorderSegment(1, 'up');
    });
    
    expect(result.current.segments[0].start).toBe(15);
    expect(result.current.segments[1].start).toBe(0);
    
    // Move first segment down
    act(() => {
      result.current.reorderSegment(0, 'down');
    });
    
    expect(result.current.segments[0].start).toBe(0);
    expect(result.current.segments[1].start).toBe(15);
  });

  test('should handle time management', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    act(() => {
      result.current.setVideoInfo('test-url', 300);
      result.current.setCurrentTime(120);
      result.current.setIsPlaying(true);
    });
    
    expect(result.current.videoDuration).toBe(300);
    expect(result.current.currentTime).toBe(120);
    expect(result.current.isPlaying).toBe(true);
  });

  test('should handle auto-save toggling', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    expect(result.current.autoSaveEnabled).toBe(true);
    
    act(() => {
      result.current.disableAutoSave();
    });
    
    expect(result.current.autoSaveEnabled).toBe(false);
    
    act(() => {
      result.current.enableAutoSave();
    });
    
    expect(result.current.autoSaveEnabled).toBe(true);
  });

  test('should update last saved timestamp', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    expect(result.current.lastSaved).toBeNull();
    
    act(() => {
      result.current.updateLastSaved();
    });
    
    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });

  test('should handle conflict resolution setting', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    expect(result.current.conflictResolution).toBe('manual');
    
    act(() => {
      result.current.setConflictResolution('latest');
    });
    
    expect(result.current.conflictResolution).toBe('latest');
  });

  test('should maintain history limit', () => {
    const { result } = renderHook(() => useTimelineStore());
    
    // Add many segments to test history limit
    for (let i = 0; i < 60; i++) {
      act(() => {
        result.current.addSegment({ start: i * 10, end: (i + 1) * 10 });
      });
    }
    
    // Should only keep last 50 states
    expect(result.current.history.length).toBeLessThanOrEqual(50);
  });
});