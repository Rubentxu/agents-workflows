import type { ReactNode } from 'react';
import { KpiCard } from './KpiCard';

interface KpiItem {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: string;
  status?: 'default' | 'success' | 'warning' | 'error' | 'info';
  loading?: boolean;
}

interface KpiGridProps {
  items: KpiItem[];
}

export function KpiGrid({ items }: KpiGridProps) {
  return (
    <div className="kpi-grid">
      {items.map((item, i) => (
        <KpiCard key={i} {...item} />
      ))}
    </div>
  );
}
