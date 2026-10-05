import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'jsdom', globals: true, css: false, setupFiles: ['./src/test-setup.js'] },
});
