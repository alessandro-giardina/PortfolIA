import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le rotte del backend, inoltrate identiche sia dal dev server (`vite`)
// sia dall'anteprima di produzione (`vite preview`, usata da `npm start`).
const proxy = {
  '/health': {
    target: 'http://localhost:3200',
    changeOrigin: true,
  },
  '/api': {
    target: 'http://localhost:3200',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
