import React from 'react';
import { cn } from '../../utils/firestore-helpers';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'pending': 'bg-stone-100 text-stone-600',
    'in-progress': 'bg-blue-50 text-blue-600',
    'reported': 'bg-amber-100 text-amber-700',
    'completed': 'bg-emerald-50 text-emerald-600'
  };

  const labels: Record<string, string> = {
    'pending': 'Oczekuje',
    'in-progress': 'W toku',
    'reported': 'Zameldowane',
    'completed': 'Gotowe'
  };

  return (
    <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md", styles[status] || 'bg-stone-100 text-stone-600')}>
      {labels[status] || status}
    </span>
  );
}