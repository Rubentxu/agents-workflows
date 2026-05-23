/**
 * ArnSelector — Browse and select a resource ARN from the registry.
 * Opens a dropdown listing available resources of a given kind (agent, skill, prompt, template, tool).
 */

import { useEffect, useRef, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';
import { Button } from '@/components/primitives/Button';

export interface ArnSelectorProps {
  /** Currently selected ARN (null means none selected) */
  value: string | null;
  /** Called when the user selects a resource */
  onChange: (arn: string | null) => void;
  /** The kind of resource to list */
  resourceKind: 'agent' | 'skill' | 'prompt' | 'template' | 'tool';
  /** Placeholder shown in the text input when no value is selected */
  placeholder?: string;
  /** Optional label shown above the input */
  label?: string;
}

interface RegistryResource {
  arn: string;
  name?: string;
  description?: string;
}

/**
 * Renders a read-only ARN input with a "Browse" button that opens a dropdown
 * listing all resources of the specified kind fetched from the REST API.
 * Selecting an item updates the ARN via onChange.
 */
export function ArnSelector({
  value,
  onChange,
  resourceKind,
  placeholder = 'Select a resource…',
  label,
}: ArnSelectorProps) {
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState<RegistryResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Fetch resources from REST API when dropdown opens */
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(restApiUrl(`/${resourceKind}s`))
      .then((res) => res.json())
      .then((data: unknown) => {
        // API returns { agents: [...], skills: [...], ... }
        const key = `${resourceKind}s` as keyof typeof data;
        const list = (data as Record<string, unknown>)[key];
        setResources(Array.isArray(list) ? (list as RegistryResource[]) : []);
      })
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, [open, resourceKind]);

  /** Close dropdown when clicking outside */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = resources.filter(
    (r) =>
      r.arn.toLowerCase().includes(search.toLowerCase()) ||
      (r.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-1" ref={dropdownRef}>
      {label && (
        <label className="text-xs font-medium text-on-surface">{label}</label>
      )}

      <div className="flex gap-2">
        {/* ARN display input */}
        <input
          ref={inputRef}
          type="text"
          value={value ?? ''}
          readOnly
          placeholder={placeholder}
          className="flex-1 text-sm font-mono bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none cursor-pointer"
          onClick={() => setOpen((o) => !o)}
        />

        {/* Browse button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
        >
          Browse
        </Button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="z-20 absolute mt-10 w-96 bg-surface-container border border-outline-variant rounded shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-outline-variant">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${resourceKind}s…`}
              autoFocus
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
            />
          </div>

          {/* List */}
          <ul className="max-h-64 overflow-y-auto divide-y divide-outline-variant">
            {loading && (
              <li className="px-4 py-3 text-sm text-secondary text-center">Loading…</li>
            )}
            {!loading && filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-secondary text-center">No {resourceKind}s found</li>
            )}
            {!loading && filtered.map((resource) => (
              <li key={resource.arn}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(resource.arn);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-surface transition-colors ${
                    value === resource.arn ? 'bg-surface' : ''
                  }`}
                >
                  <div className="text-sm font-medium text-on-surface">
                    {resource.name ?? resource.arn.split('/').pop()}
                  </div>
                  {resource.description && (
                    <div className="text-xs text-secondary mt-0.5 line-clamp-1">
                      {resource.description}
                    </div>
                  )}
                  <div className="text-xs font-mono text-secondary/70 mt-0.5 truncate">
                    {resource.arn}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
