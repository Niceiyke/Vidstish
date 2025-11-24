import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VisualTimeline } from '../components/VisualTimeline';

// Mock all external dependencies
jest.mock('../store/timelineStore', () => ({
  useTimelineStore: jest.fn(),
}));

jest.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.mock('wavesurfer.js', () => ({
  default: {
    create: jest.fn(() => ({
      load: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      destroy: jest.fn(),
      getDuration: jest.fn(() => 300),
      getCurrentTime: jest.fn(() => 50),
      seekTo: jest.fn(),
      on: jest.fn(),
    })),
  },
}));

describe('VisualTimeline Component', () => {
  const mockProps = {
    videoUrl: 'https://example.com/video.mp4',
    userId: 'test-user',
    youtubeId: 'test-youtube-id',
    apiBaseUrl: 'http://localhost:8000',
  };

  const createMockStore = (overrides = {}) => ({
    segments: [
      { id: 'seg1', start: 0, end: 10, selected: false },
      { id: 'seg2', start: 15, end: 25, selected: false },
    ],
    videoDuration: 300,
    currentTime: 50,
    isPlaying: false,
    selectedSegments: new Set(),
    updateSegment: jest.fn(),
    addSegment: jest.fn(),
    removeSegment: jest.fn(),
    selectSegment: jest.fn(),
    clearSelection: jest.fn(),
    setCurrentTime: jest.fn(),
    setIsPlaying: jest.fn(),
    setVideoInfo: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: jest.fn(() => true),
    canRedo: jest.fn(() => true),
    saveToHistory: jest.fn(),
    lastSaved: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { useTimelineStore } = require('../store/timelineStore');
    useTimelineStore.mockReturnValue(createMockStore());
    const { useKeyboardShortcuts } = require('../hooks/useKeyboardShortcuts');
    useKeyboardShortcuts.mockImplementation(() => {});
  });

  test('should render without crashing', () => {
    render(<VisualTimeline {...mockProps} />);
    
    expect(screen.getByText('Video waveform will appear here')).toBeInTheDocument();
  });

  test('should render timeline controls', () => {
    render(<VisualTimeline {...mockProps} />);
    
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByText('00:50 / 05:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Undo')).toBeInTheDocument();
    expect(screen.getByLabelText('Redo')).toBeInTheDocument();
  });

  test('should render segments when provided', () => {
    render(<VisualTimeline {...mockProps} />);
    
    // Check if timeline segments are rendered
    const timeline = document.querySelector('.timeline-container');
    expect(timeline).toBeInTheDocument();
  });

  test('should handle play/pause toggle', async () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore();
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    const playButton = screen.getByLabelText('Play');
    fireEvent.click(playButton);
    
    await waitFor(() => {
      expect(mockStore.setIsPlaying).toHaveBeenCalledWith(true);
    });
  });

  test('should handle undo/redo buttons', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore();
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    const undoButton = screen.getByLabelText('Undo');
    const redoButton = screen.getByLabelText('Redo');
    
    fireEvent.click(undoButton);
    expect(mockStore.undo).toHaveBeenCalled();
    
    fireEvent.click(redoButton);
    expect(mockStore.redo).toHaveBeenCalled();
  });

  test('should show bulk actions when segments are selected', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore({ selectedSegments: new Set(['seg1']) });
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('🗑️ Delete')).toBeInTheDocument();
    expect(screen.getByText('🔗 Merge')).toBeInTheDocument();
    expect(screen.getByText('✂️ Trim')).toBeInTheDocument();
    expect(screen.getByText('❌ Clear')).toBeInTheDocument();
  });

  test('should handle bulk delete', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore({ selectedSegments: new Set(['seg1']) });
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    const deleteButton = screen.getByText('🗑️ Delete');
    fireEvent.click(deleteButton);
    
    expect(mockStore.removeSegment).toHaveBeenCalledWith('seg1');
    expect(mockStore.clearSelection).toHaveBeenCalled();
  });

  test('should show add segment button', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore();
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    const addButton = screen.getByText('+ Add Segment');
    fireEvent.click(addButton);
    
    expect(mockStore.addSegment).toHaveBeenCalled();
  });

  test('should display save status when available', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const savedDate = new Date('2024-01-01T12:00:00');
    const mockStore = createMockStore({ lastSaved: savedDate });
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    expect(screen.getByText(/Last saved:/)).toBeInTheDocument();
  });

  test('should format time correctly', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore();
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    // Check time display format
    const timeDisplay = screen.getByText('00:50 / 05:00');
    expect(timeDisplay).toBeInTheDocument();
  });

  test('should provide proper ARIA labels', () => {
    const { useTimelineStore } = require('../store/timelineStore');
    const mockStore = createMockStore();
    useTimelineStore.mockReturnValue(mockStore);
    
    render(<VisualTimeline {...mockProps} />);
    
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Undo')).toBeInTheDocument();
    expect(screen.getByLabelText('Redo')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete selected segments')).toBeInTheDocument();
    expect(screen.getByLabelText('Merge selected segments')).toBeInTheDocument();
    expect(screen.getByLabelText('Trim selected segments')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
    expect(screen.getByLabelText('Add segment')).toBeInTheDocument();
  });

  test('should handle missing video URL gracefully', () => {
    render(<VisualTimeline {...mockProps} videoUrl={undefined} />);
    
    expect(screen.getByText('Video waveform will appear here')).toBeInTheDocument();
  });
});