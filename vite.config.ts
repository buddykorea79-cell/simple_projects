/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 멀티 페이지: 홈 + 각 잡동사니 프로젝트가 하위 폴더에 하나씩
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        draw: resolve(import.meta.dirname, 'draw/index.html'),
        timer: resolve(import.meta.dirname, 'timer/index.html'),
      },
    },
  },
  test: {
    include: ['draw/src/**/*.test.ts'],
  },
});
