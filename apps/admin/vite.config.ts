import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Environment variables live in a single .env at the repository root rather
  // than one per app, so there is exactly one file to keep out of git and one
  // .env.example to keep accurate.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),

  server: {
    port: 5173,
  },
});
