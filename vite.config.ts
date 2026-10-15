import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) {
            return 'vendor-three';
          }
          if (id.includes('@react-three') || id.includes('three-stdlib')) {
            return 'vendor-r3f';
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    open: false,
    watch: {
      ignored: ['**/release/**'],
    },
  },
});
