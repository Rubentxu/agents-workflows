/**
 * TagInput — Editable list of string tags / chips.
 * Supports keyboard input, comma-separated paste, and optional suggestions dropdown.
 * Used for skills ARNs, triggers, labels, and any string-list fields.
 */

import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';

export interface TagInputProps {
  /** Current list of tag strings */
  tags: string[];
  /** Called whenever the tags list changes */
  onChange: (tags: string[]) => void;
  /** Placeholder text shown when the input is empty */
  placeholder?: string;
  /** Optional list of suggestions shown in a dropdown below the input */
  suggestions?: string[];
}

/**
 * Renders existing tags as removable chips and a text input for adding new tags.
 * Supports:
 * - Typing and pressing Enter or comma to add a tag
 * - Pasting comma-separated values
 * - Clicking a suggestion to add it
 * - Clicking × on a chip to remove it
 */
export function TagInput({
  tags,
  onChange,
  placeholder = 'Add tag…',
  suggestions = [],
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Remove a tag by index */
  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  /** Add a single tag, avoiding duplicates */
  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  /** Handle keyboard events in the text input */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  /** Handle paste — split on commas and add each piece as a tag */
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',')) {
      e.preventDefault();
      const parts = pasted.split(',').map((p) => p.trim()).filter(Boolean);
      const newTags = parts.filter((p) => !tags.includes(p));
      if (newTags.length > 0) {
        onChange([...tags, ...newTags]);
      }
      setInputValue('');
    }
  };

  /** Filter suggestions to only those that match the current input */
  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.includes(s)
  );

  return (
    <div className="relative">
      {/* Chips + input row */}
      <div
        className="flex flex-wrap gap-1.5 px-3 py-2 bg-surface border border-outline-variant rounded text-sm cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2 py-0.5 bg-surface-container border border-outline-variant rounded text-secondary"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(index); }}
              className="text-secondary hover:text-error transition-colors leading-none"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? placeholder : undefined}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-on-surface placeholder:text-secondary/50"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-surface-container border border-outline-variant rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
                className="w-full px-3 py-2 text-sm text-left text-on-surface hover:bg-surface hover:text-primary transition-colors"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
