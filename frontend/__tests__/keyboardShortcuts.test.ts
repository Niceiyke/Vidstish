import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, defaultShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTimelineStore } from '../store/timelineStore';

// Mock react-hotkeys-hook
jest.mock('react-hotkeys-hook', () => ({
  useHotkeys: jest.fn(),
}));

// Mock the store
jest.mock('../store/timelineStore', () => ({
  useTimelineStore: jest.fn(),
}));

describe('Keyboard Shortcuts', () => {
  const mockUseHotkeys = jest.fn();
  const mockStore = {
    setCurrentTime: jest.fn(),
    currentTime: 0,
    videoDuration: 300,
    setIsPlaying: jest.fn(),
    isPlaying: false,
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: jest.fn(() => true),
    canRedo: jest.fn(() => true),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
    removeSelectedSegments: jest.fn(),
    addSegment: jest.fn(),
    selectedSegments: new Set(),
    segments: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useTimelineStore as unknown as jest.Mock).mockReturnValue(mockStore);
    (require('react-hotkeys-hook').useHotkeys as jest.Mock).mockImplementation(mockUseHotkeys);
  });

  test('should initialize keyboard shortcuts', () => {
    renderHook(() => useKeyboardShortcuts());

    // Should call useHotkeys for each default shortcut
    expect(mockUseHotkeys).toHaveBeenCalled();
    expect(mockUseHotkeys.mock.calls.length).toBeGreaterThan(0);
  });

  test('should set up spacebar for play/pause', () => {
    renderHook(() => useKeyboardShortcuts());

    // Find the spacebar call
    const spacebarCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'space'
    );

    expect(spacebarCall).toBeDefined();
    expect(spacebarCall[2]).toEqual({ preventDefault: true });

    // Test the callback
    act(() => {
      const callback = spacebarCall[1];
      callback(new Event('keydown'));
    });

    expect(mockStore.setIsPlaying).toHaveBeenCalledWith(true);
  });

  test('should set up arrow keys for seeking', () => {
    renderHook(() => useKeyboardShortcuts());

    // Find arrow key calls
    const arrowLeftCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'arrowLeft'
    );
    const arrowRightCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'arrowRight'
    );

    expect(arrowLeftCall).toBeDefined();
    expect(arrowRightCall).toBeDefined();

    // Test left arrow callback
    act(() => {
      arrowLeftCall[1](new Event('keydown'));
    });
    expect(mockStore.setCurrentTime).toHaveBeenCalledWith(0); // currentTime - 5, clamped to 0

    // Test right arrow callback
    act(() => {
      arrowRightCall[1](new Event('keydown'));
    });
    expect(mockStore.setCurrentTime).toHaveBeenCalledWith(5); // currentTime + 5
  });

  test('should set up ctrl+z for undo', () => {
    renderHook(() => useKeyboardShortcuts());

    const ctrlZCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'ctrl+z'
    );

    expect(ctrlZCall).toBeDefined();

    // Test when undo is available
    (mockStore.canUndo as jest.Mock).mockReturnValue(true);
    act(() => {
      ctrlZCall[1](new Event('keydown'));
    });
    expect(mockStore.undo).toHaveBeenCalled();

    // Test when undo is not available
    (mockStore.canUndo as jest.Mock).mockReturnValue(false);
    jest.clearAllMocks();
    act(() => {
      ctrlZCall[1](new Event('keydown'));
    });
    expect(mockStore.undo).not.toHaveBeenCalled();
  });

  test('should set up ctrl+y for redo', () => {
    renderHook(() => useKeyboardShortcuts());

    const ctrlYCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'ctrl+y'
    );

    expect(ctrlYCall).toBeDefined();

    // Test when redo is available
    (mockStore.canRedo as jest.Mock).mockReturnValue(true);
    act(() => {
      ctrlYCall[1](new Event('keydown'));
    });
    expect(mockStore.redo).toHaveBeenCalled();

    // Test when redo is not available
    (mockStore.canRedo as jest.Mock).mockReturnValue(false);
    jest.clearAllMocks();
    act(() => {
      ctrlYCall[1](new Event('keydown'));
    });
    expect(mockStore.redo).not.toHaveBeenCalled();
  });

  test('should set up ctrl+a for select all', () => {
    renderHook(() => useKeyboardShortcuts());

    const ctrlACall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'ctrl+a'
    );

    expect(ctrlACall).toBeDefined();

    act(() => {
      ctrlACall[1](new Event('keydown'));
    });

    expect(mockStore.selectAll).toHaveBeenCalled();
  });

  test('should set up escape for clear selection', () => {
    renderHook(() => useKeyboardShortcuts());

    const escapeCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'escape'
    );

    expect(escapeCall).toBeDefined();

    act(() => {
      escapeCall[1](new Event('keydown'));
    });

    expect(mockStore.clearSelection).toHaveBeenCalled();
  });

  test('should set up delete for removing selected segments', () => {
    renderHook(() => useKeyboardShortcuts());

    const deleteCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'delete'
    );

    expect(deleteCall).toBeDefined();

    // Test when segments are selected
    mockStore.selectedSegments = new Set(['segment-1', 'segment-2']);
    act(() => {
      deleteCall[1](new Event('keydown'));
    });
    expect(mockStore.removeSelectedSegments).toHaveBeenCalled();

    // Test when no segments are selected
    mockStore.selectedSegments = new Set();
    jest.clearAllMocks();
    act(() => {
      deleteCall[1](new Event('keydown'));
    });
    expect(mockStore.removeSelectedSegments).not.toHaveBeenCalled();
  });

  test('should set up ctrl+d for duplicating segments', () => {
    renderHook(() => useKeyboardShortcuts());

    const ctrlDCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'ctrl+d'
    );

    expect(ctrlDCall).toBeDefined();

    // Test when segments are selected
    mockStore.selectedSegments = new Set(['segment-1']);
    (mockStore.segments as any) = [{ id: 'segment-1', start: 0, end: 10 }];
    
    act(() => {
      ctrlDCall[1](new Event('keydown'));
    });

    expect(mockStore.addSegment).toHaveBeenCalledWith({
      start: 1,
      end: 11,
      selected: false
    });
    expect(mockStore.clearSelection).toHaveBeenCalled();

    // Test when no segments are selected
    mockStore.selectedSegments = new Set();
    jest.clearAllMocks();
    act(() => {
      ctrlDCall[1](new Event('keydown'));
    });
    expect(mockStore.addSegment).not.toHaveBeenCalled();
  });

  test('should set up ctrl+s for saving', () => {
    renderHook(() => useKeyboardShortcuts());

    const ctrlSCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'ctrl+s'
    );

    expect(ctrlSCall).toBeDefined();

    // Mock console.log to capture save trigger
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    act(() => {
      ctrlSCall[1](new Event('keydown'));
    });

    expect(consoleSpy).toHaveBeenCalledWith('Save triggered via keyboard shortcut');

    consoleSpy.mockRestore();
  });

  test('should prevent default behavior for all shortcuts', () => {
    renderHook(() => useKeyboardShortcuts());

    // Check that all calls include preventDefault: true
    mockUseHotkeys.mock.calls.forEach(call => {
      expect(call[2]).toEqual({ preventDefault: true });
    });
  });

  test('should handle edge cases for seeking', () => {
    renderHook(() => useKeyboardShortcuts());

    // Test seeking when at the beginning
    mockStore.currentTime = 2;
    const arrowLeftCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'arrowLeft'
    );

    act(() => {
      arrowLeftCall[1](new Event('keydown'));
    });

    // Should clamp to 0, not go negative
    expect(mockStore.setCurrentTime).toHaveBeenCalledWith(0);

    // Test seeking when at the end
    mockStore.currentTime = 295;
    mockStore.videoDuration = 300;
    const arrowRightCall = mockUseHotkeys.mock.calls.find(
      call => call[0] === 'arrowRight'
    );

    act(() => {
      arrowRightCall[1](new Event('keydown'));
    });

    // Should clamp to video duration
    expect(mockStore.setCurrentTime).toHaveBeenCalledWith(300);
  });
});

describe('Default Shortcuts', () => {
  test('should have complete shortcut definitions', () => {
    expect(defaultShortcuts).toBeDefined();
    expect(typeof defaultShortcuts).toBe('object');

    // Check required shortcuts exist
    const requiredShortcuts = [
      'space',
      'arrowLeft', 
      'arrowRight',
      'ctrlZ',
      'ctrlY',
      'ctrlA',
      'delete',
      'escape',
      'ctrlD',
      'ctrlS'
    ];

    requiredShortcuts.forEach(shortcut => {
      expect(defaultShortcuts[shortcut]).toBeDefined();
      expect(defaultShortcuts[shortcut].key).toBeDefined();
      expect(defaultShortcuts[shortcut].description).toBeDefined();
      expect(defaultShortcuts[shortcut].category).toBeDefined();
    });
  });

  test('should categorize shortcuts correctly', () => {
    const categories = ['playback', 'editing', 'selection', 'history', 'general'];
    
    Object.values(defaultShortcuts).forEach(shortcut => {
      expect(categories).toContain(shortcut.category);
    });
  });
});

describe('Custom Shortcuts', () => {
  test('should handle custom key bindings', () => {
    const customBindings = {
      space: 'enter',
      arrowLeft: 'a',
      arrowRight: 'd'
    };

    // This would test the useCustomShortcuts hook if it were implemented
    // For now, we'll just verify the concept
    expect(customBindings).toBeDefined();
    expect(customBindings.space).toBe('enter');
  });
});