import type { Category, Status } from './types';

export const CATEGORIES: Record<Category, { label: string; color: string }> = {
  lighting: { label: 'Lighting', color: '#e8542a' },
  seating: { label: 'Seating', color: '#c98a1b' },
  accessibility: { label: 'Accessibility', color: '#13826f' },
  litter: { label: 'Litter', color: '#2f6db5' },
  noise: { label: 'Noise', color: '#8e63c7' },
  other: { label: 'Other', color: '#8a8f98' },
};

export const CATEGORY_ORDER: Category[] = ['lighting', 'seating', 'accessibility', 'litter', 'noise', 'other'];

export const STATUSES: Record<Status, { label: string; residentLabel: string; color: string; soft: string }> = {
  open: { label: 'Open', residentLabel: 'Open', color: '#e8542a', soft: '#fdeee8' },
  in_review: { label: 'In review', residentLabel: 'In review', color: '#c98a1b', soft: '#fbf3e2' },
  scheduled: { label: 'Scheduled', residentLabel: 'Scheduled', color: '#2f6db5', soft: '#e9f0fa' },
  sent_to_city: { label: 'Sent to City', residentLabel: 'Waiting on City', color: '#8e63c7', soft: '#f1ebfa' },
  fixed: { label: 'Fixed', residentLabel: 'Fixed', color: '#2e8b57', soft: '#e6f4ec' },
};

export const STATUS_ORDER: Status[] = ['open', 'in_review', 'scheduled', 'sent_to_city', 'fixed'];

export const OWNERS = ['BID crew', 'West Side District staff'];

export const DISTRICT = 'West Side District';
