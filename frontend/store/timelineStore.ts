import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type Segment = {
  id: string;
  start: number;
  end: number;
  selected?: boolean;
};

export type TimelineState = {
  segments: Segment[];
  videoUrl?: string;
  videoDuration: number;
  currentTime: number;
  isPlaying: boolean;
  selectedSegments: Set<string>;
  history: Segment[][];
  historyIndex: number;
  maxHistory: number;
  isLoading: boolean;
  autoSaveEnabled: boolean;
  lastSaved: Date | null;
  conflictResolution: 'manual' | 'latest' | 'keepLocal';
  
  // Actions
  setSegments: (segments: Segment[]) => void;
  addSegment: (segment?: Partial<Segment>) => void;
  updateSegment: (id: string, updates: Partial<Segment>) => void;
  removeSegment: (id: string) => void;
  removeSelectedSegments: () => void;
  selectSegment: (id: string, multiSelect?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  mergeSelectedSegments: () => void;
  trimSelectedSegments: (start?: number, end?: number) => void;
  reorderSegment: (index: number, direction: 'up' | 'down') => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setVideoInfo: (url: string, duration: number) => void;
  
  // History management
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveToHistory: (segments: Segment[]) => void;
  
  // Auto-save
  enableAutoSave: () => void;
  disableAutoSave: () => void;
  updateLastSaved: () => void;
  setConflictResolution: (resolution: 'manual' | 'latest' | 'keepLocal') => void;
};

const createInitialSegment = (index: number, videoDuration: number, lastEnd?: number): Segment => {
  const safeDuration = Math.max(videoDuration, 1);
  const startSeed = lastEnd !== undefined ? Math.min(lastEnd, safeDuration - 1) : 0;
  const endSeed = Math.min(startSeed + 15, safeDuration);
  
  return {
    id: `segment-${index}-${Date.now()}`,
    start: startSeed,
    end: endSeed,
    selected: false
  };
};

const clamp = (value: number, max: number, min = 0) => Math.min(Math.max(value, min), max);

export const useTimelineStore = create<TimelineState>()(
  subscribeWithSelector((set, get) => ({
    segments: [],
    videoDuration: 0,
    currentTime: 0,
    isPlaying: false,
    selectedSegments: new Set(),
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    isLoading: false,
    autoSaveEnabled: true,
    lastSaved: null,
    conflictResolution: 'manual',

    setSegments: (segments) => {
      set({ segments });
      get().saveToHistory(segments);
    },

    addSegment: (segment) => {
      const { segments, videoDuration } = get();
      const newSegment = createInitialSegment(
        segments.length + 1,
        videoDuration,
        segments[segments.length - 1]?.end
      );
      const updatedSegments = [...segments, { ...newSegment, ...segment }];
      set({ segments: updatedSegments });
      get().saveToHistory(updatedSegments);
    },

    updateSegment: (id, updates) => {
      const { segments, videoDuration } = get();
      const updatedSegments = segments.map(segment => {
        if (segment.id !== id) return segment;
        
        const updated = { ...segment, ...updates };
        
        // Ensure valid time bounds
        updated.start = clamp(updated.start, videoDuration);
        updated.end = clamp(updated.end, videoDuration);
        
        // Ensure start is before end
        if (updated.start >= updated.end) {
          updated.start = Math.max(0, updated.end - 0.5);
          updated.end = updated.start + 0.5;
        }
        
        return updated;
      });
      
      set({ segments: updatedSegments });
    },

    removeSegment: (id) => {
      const { segments } = get();
      const updatedSegments = segments.filter(segment => segment.id !== id);
      set({ segments: updatedSegments });
      get().saveToHistory(updatedSegments);
    },

    removeSelectedSegments: () => {
      const { segments, selectedSegments } = get();
      const updatedSegments = segments.filter(segment => !selectedSegments.has(segment.id));
      set({ 
        segments: updatedSegments,
        selectedSegments: new Set()
      });
      get().saveToHistory(updatedSegments);
    },

    selectSegment: (id, multiSelect = false) => {
      const { selectedSegments } = get();
      const newSelected = new Set(selectedSegments);
      
      if (multiSelect) {
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
      } else {
        newSelected.clear();
        newSelected.add(id);
      }
      
      set({ selectedSegments: newSelected });
    },

    clearSelection: () => {
      set({ selectedSegments: new Set() });
    },

    selectAll: () => {
      const { segments } = get();
      const newSelected = new Set(segments.map(s => s.id));
      set({ selectedSegments: newSelected });
    },

    mergeSelectedSegments: () => {
      const { segments, selectedSegments } = get();
      const selected = segments.filter(s => selectedSegments.has(s.id));
      
      if (selected.length < 2) return;
      
      const minStart = Math.min(...selected.map(s => s.start));
      const maxEnd = Math.max(...selected.map(s => s.end));
      
      const updatedSegments = segments
        .filter(s => !selectedSegments.has(s.id))
        .concat([{
          id: `merged-${Date.now()}`,
          start: minStart,
          end: maxEnd,
          selected: false
        }])
        .sort((a, b) => a.start - b.start);
      
      set({ 
        segments: updatedSegments,
        selectedSegments: new Set()
      });
      get().saveToHistory(updatedSegments);
    },

    trimSelectedSegments: (start, end) => {
      const { segments, selectedSegments, videoDuration } = get();
      const updatedSegments = segments.map(segment => {
        if (!selectedSegments.has(segment.id)) return segment;
        
        const trimStart = start !== undefined ? start : segment.start;
        const trimEnd = end !== undefined ? end : segment.end;
        
        return {
          ...segment,
          start: clamp(trimStart, videoDuration),
          end: clamp(trimEnd, videoDuration, segment.start + 0.5)
        };
      });
      
      set({ 
        segments: updatedSegments,
        selectedSegments: new Set()
      });
      get().saveToHistory(updatedSegments);
    },

    reorderSegment: (index, direction) => {
      const { segments } = get();
      const newSegments = [...segments];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (!newSegments[targetIndex]) return;
      
      [newSegments[index], newSegments[targetIndex]] = 
        [newSegments[targetIndex], newSegments[index]];
      
      set({ segments: newSegments });
      get().saveToHistory(newSegments);
    },

    setCurrentTime: (time) => {
      const { videoDuration } = get();
      set({ currentTime: clamp(time, videoDuration) });
    },

    setIsPlaying: (playing) => {
      set({ isPlaying: playing });
    },

    setVideoInfo: (url, duration) => {
      set({ videoUrl: url, videoDuration: duration });
    },

    saveToHistory: (segments) => {
      const { history, historyIndex, maxHistory } = get();
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push([...segments]);
      
      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }
      
      set({ 
        history: newHistory,
        historyIndex: newHistory.length - 1
      });
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        set({ 
          segments: [...history[newIndex]],
          historyIndex: newIndex,
          selectedSegments: new Set()
        });
      }
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        set({ 
          segments: [...history[newIndex]],
          historyIndex: newIndex,
          selectedSegments: new Set()
        });
      }
    },

    canUndo: () => {
      const { historyIndex } = get();
      return historyIndex > 0;
    },

    canRedo: () => {
      const { history, historyIndex } = get();
      return historyIndex < history.length - 1;
    },

    enableAutoSave: () => {
      set({ autoSaveEnabled: true });
    },

    disableAutoSave: () => {
      set({ autoSaveEnabled: false });
    },

    updateLastSaved: () => {
      set({ lastSaved: new Date() });
    },

    setConflictResolution: (resolution) => {
      set({ conflictResolution: resolution });
    },
  }))
);

// Auto-save subscription
if (typeof window !== 'undefined') {
  useTimelineStore.subscribe(
    (state) => state.segments,
    (segments) => {
      const state = useTimelineStore.getState();
      if (state.autoSaveEnabled && segments.length > 0) {
        // Debounced auto-save (30 seconds)
        clearTimeout((window as any).autoSaveTimeout);
        (window as any).autoSaveTimeout = setTimeout(() => {
          // Implement auto-save logic here
          console.log('Auto-saving segments...', segments);
          state.updateLastSaved();
        }, 30000);
      }
    }
  );
}