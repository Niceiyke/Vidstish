import React, { useState } from 'react';
import { defaultShortcuts } from '../hooks/useKeyboardShortcuts';
import { clsx } from 'clsx';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = {
    all: 'All Shortcuts',
    playback: 'Playback',
    editing: 'Editing',
    selection: 'Selection',
    history: 'History',
    general: 'General'
  };

  const filteredShortcuts = Object.entries(defaultShortcuts).filter(
    ([_, shortcut]) => activeCategory === 'all' || shortcut.category === activeCategory
  );

  if (!isOpen) return null;

  return (
    <div className="keyboard-shortcuts-overlay" onClick={onClose}>
      <div 
        className="keyboard-shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts help"
          >
            ×
          </button>
        </div>

        <div className="modal-content">
          <div className="category-tabs">
            {Object.entries(categories).map(([key, label]) => (
              <button
                key={key}
                className={clsx('category-tab', { 
                  active: activeCategory === key 
                })}
                onClick={() => setActiveCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="shortcuts-list">
            {filteredShortcuts.map(([action, shortcut]) => (
              <div key={action} className="shortcut-row">
                <div className="shortcut-description">
                  {shortcut.description}
                </div>
                <div className="shortcut-key">
                  {shortcut.key.split('+').map((key, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <span className="key-plus">+</span>}
                      <kbd className="key">{key}</kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <p>Press <kbd className="key">?</kbd> anywhere to show this help</p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;