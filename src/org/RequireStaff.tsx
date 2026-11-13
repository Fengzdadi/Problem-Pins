import type { ReactNode } from 'react';

/**
 * Guards the organization dashboard. Placeholder: lets everyone through.
 * The staff-app module replaces this with a real check (`useStore().staff`) that sends
 * signed-out visitors to `/org/login?next=<path>`.
 */
export default function RequireStaff({ children }: { path: string; children: ReactNode }) {
  return <>{children}</>;
}
