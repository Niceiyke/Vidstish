import { useHotkeys } from 'react-hotkeys-hook';
import { useTimelineStore } from '../store/timelineStore';
import { useCallback } from 'react';

export type KeyboardShortcut = {
  key: string;
  description: string;
  category: 'playback' | 'editing' | 'selection' | 'history' | 'general';
};

export const defaultShortcuts: Record<string, KeyboardShortcut> = {
  space: {
    key: 'space',
    description: 'Play/Pause',
    category: 'playback'
  },
  arrowLeft: {
    key: 'arrowLeft',
    description: 'Seek backward 5 seconds',
    category: 'playback'
  },
  arrowRight: {
    key: 'arrowRight',
    description: 'Seek forward 5 seconds',
    category: 'playback'
  },
  ctrlZ: {
    key: 'ctrl+z',
    description: 'Undo',
    category: 'history'
  },
  ctrlY: {
    key: 'ctrl+y',
    description: 'Redo',
    category: 'history'
  },
  ctrlA: {
    key: 'ctrl+a',
    description: 'Select all segments',
    category: 'selection'
  },
  delete: {
    key: 'delete',
    description: 'Delete selected segments',
    category: 'editing'
  },
  escape: {
    key: 'escape',
    description: 'Clear selection',
    category: 'selection'
  },
  ctrlD: {
    key: 'ctrl+d',
    description: 'Duplicate selected segments',
    category: 'editing'
  },
  ctrlS: {
    key: 'ctrl+s',
    description: 'Save segments',
    category: 'general'
  }
};

export const useKeyboardShortcuts = () => {
  const {
    setCurrentTime,
    currentTime,
    videoDuration,
    setIsPlaying,
    isPlaying,
    undo,
    redo,
    canUndo,
    canRedo,
    selectAll,
    clearSelection,
    removeSelectedSegments,
    addSegment,
    selectedSegments,
    segments
  } = useTimelineStore();

  // Play/Pause
  useHotkeys('space', useCallback((e) => {
    e.preventDefault();
    setIsPlaying(!isPlaying);
  }, [setIsPlaying, isPlaying]), { preventDefault: true });

  // Seek backward
  useHotkeys('arrowLeft', useCallback((e) => {
    e.preventDefault();
    const newTime = Math.max(0, currentTime - 5);
    setCurrentTime(newTime);
  }, [setCurrentTime, currentTime]), { preventDefault: true });

  // Seek forward
  useHotkeys('arrowRight', useCallback((e) => {
    e.preventDefault();
    const newTime = Math.min(videoDuration, currentTime + 5);
    setCurrentTime(newTime);
  }, [setCurrentTime, currentTime, videoDuration]), { preventDefault: true });

  // Undo
  useHotkeys('ctrl+z', useCallback((e) => {
    e.preventDefault();
    if (canUndo()) {
      undo();
    }
  }, [undo, canUndo]), { preventDefault: true });

  // Redo
  useHotkeys('ctrl+y', useCallback((e) => {
    e.preventDefault();
    if (canRedo()) {
      redo();
    }
  }, [redo, canRedo]), { preventDefault: true });

  // Select all
  useHotkeys('ctrl+a', useCallback((e) => {
    e.preventDefault();
    selectAll();
  }, [selectAll]), { preventDefault: true });

  // Clear selection
  useHotkeys('escape', useCallback((e) => {
    e.preventDefault();
    clearSelection();
  }, [clearSelection]), { preventDefault: true });

  // Delete selected
  useHotkeys('delete', useCallback((e) => {
    e.preventDefault();
    if (selectedSegments.size > 0) {
      removeSelectedSegments();
    }
  }, [selectedSegments, removeSelectedSegments]), { preventDefault: true });

  // Duplicate selected segments
  useHotkeys('ctrl+d', useCallback((e) => {
    e.preventDefault();
    if (selectedSegments.size > 0) {
      const selectedSegmentList = segments.filter(s => selectedSegments.has(s.id));
      selectedSegmentList.forEach(segment => {
        addSegment({
          start: segment.start + 1,
          end: segment.end + 1,
          selected: false
        });
      });
      clearSelection();
    }
  }, [selectedSegments, segments, addSegment, clearSelection]), { preventDefault: true });

  // Save (you can implement save functionality)
  useHotkeys('ctrl+s', useCallback((e) => {
    e.preventDefault();
    console.log('Save triggered via keyboard shortcut');
    // Implement save logic here
  }, []), { preventDefault: true });
};

export const useCustomShortcuts = (customBindings: Record<string, string>) => {
  // Implementation for customizable keyboard bindings
  // This would allow users to modify shortcuts in preferences
  const bindings = { ...defaultShortcuts };
  
  // Apply custom bindings
  Object.entries(customBindings).forEach(([action, key]) => {
    if (bindings[action]) {
      bindings[action].key = key;
    }
  });
  
  return bindings;
};