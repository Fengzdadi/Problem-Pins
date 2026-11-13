import type { config as appConfig } from '../../config';
import type { Backend } from '../types';

/**
 * Live backend on Supabase (Postgres + Auth + Storage + Realtime).
 * Owned by the backend module; see docs/ARCHITECTURE.md. Not implemented yet.
 */
export function createSupabaseBackend(_config: typeof appConfig): Backend {
  throw new Error('The Supabase backend is not implemented yet. Run without VITE_SUPABASE_URL to use demo mode.');
}
