import type { CounselingStatus } from '@/lib/api/counseling';

export const STATUS_LABELS: Record<CounselingStatus, string> = {
  submitted: 'New',
  assigned: 'Assigned',
  closed: 'Closed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const STATUS_STYLES: Record<CounselingStatus, string> = {
  submitted: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  closed: 'bg-green-100 text-green-800',
  declined: 'bg-gray-200 text-gray-700',
  cancelled: 'bg-gray-200 text-gray-700',
};

export function formatDateTime(date: Date | null) {
  return date ? date.toLocaleString() : '—';
}

export function categoryLabel(category: string | null) {
  return category ? category[0].toUpperCase() + category.slice(1) : '—';
}
