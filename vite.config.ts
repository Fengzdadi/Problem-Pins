import { defineConfig } from 'vitest/config';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Claude Code keeps per-module git worktrees under .claude/; their copies aren't this checkout's tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
