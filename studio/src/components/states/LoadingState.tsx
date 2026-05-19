interface LoadingStateProps {
  type: 'cards' | 'rows' | 'detail';
  count?: number;
}

function SkeletonCard() {
  return (
    <div
      className="min-h-[96px] p-4 rounded-xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
        boxShadow: 'var(--elevation-1)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        <div className="flex-1 space-y-2">
          <div
            className="h-7 w-16 rounded animate-pulse"
            style={{ background: 'var(--color-outline-variant)' }}
          />
          <div
            className="h-3 w-20 rounded animate-pulse"
            style={{ background: 'var(--color-outline-variant)' }}
          />
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 p-3 rounded-lg"
      style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
    >
      <div
        className="w-8 h-8 rounded-full animate-pulse"
        style={{ background: 'var(--color-outline-variant)' }}
      />
      <div className="flex-1 space-y-2">
        <div
          className="h-4 w-1/3 rounded animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        <div
          className="h-3 w-1/2 rounded animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
      </div>
      <div
        className="h-6 w-16 rounded animate-pulse"
        style={{ background: 'var(--color-outline-variant)' }}
      />
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div
      className="p-6 rounded-xl space-y-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
        boxShadow: 'var(--elevation-1)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        <div className="flex-1 space-y-2">
          <div
            className="h-5 w-1/4 rounded animate-pulse"
            style={{ background: 'var(--color-outline-variant)' }}
          />
          <div
            className="h-3 w-1/2 rounded animate-pulse"
            style={{ background: 'var(--color-outline-variant)' }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div
          className="h-4 w-full rounded animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        <div
          className="h-4 w-5/6 rounded animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        <div
          className="h-4 w-2/3 rounded animate-pulse"
          style={{ background: 'var(--color-outline-variant)' }}
        />
      </div>
    </div>
  );
}

export function LoadingState({ type, count = 4 }: LoadingStateProps) {
  const n = Math.max(1, count);

  if (type === 'cards') {
    return (
      <div className="kpi-grid">
        {Array.from({ length: n }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (type === 'rows') {
    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        {Array.from({ length: n }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  return <SkeletonDetail />;
}
