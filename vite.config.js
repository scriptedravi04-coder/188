import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const match = rawUrl.trim().match(/^(https?:\/\/[a-zA-Z0-9-]+\.supabase\.co)/i);
  return match ? match[1] : rawUrl.trim();
}

if (process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = sanitizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
}
if (process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    entries: [
      'index.html',
      'src/**/*.{js,jsx,ts,tsx}',
    ],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'lucide-react',
      'sonner',
      'axios',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'date-fns',
      'recharts',
      'driver.js',
      'canvas-confetti',
      'qrcode.react',
      '@radix-ui/react-popover',
      '@radix-ui/react-slot',
      'react-day-picker',
      'zustand',
      'gsap',
      'marked',
      'papaparse',
      'jspdf',
      'socket.io-client',
      '@supabase/supabase-js',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      'd3',
    ],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
  },
});
