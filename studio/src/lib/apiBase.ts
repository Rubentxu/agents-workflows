function normalizeBaseUrl(value: string): string {
  return value.endsWith('/api') ? value : `${value.replace(/\/$/, '')}/api`;
}

export function getRestApiBaseUrl(): string {
  const explicit = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env?.VITE_AGENTS_WORKFLOWS_REST_URL;
  if (explicit) return normalizeBaseUrl(explicit);

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (port === '8080') {
      return `${protocol}//${hostname}:8081/api`;
    }
  }

  return '/api';
}

export function restApiUrl(path: string): string {
  const base = getRestApiBaseUrl();
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
