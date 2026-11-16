/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;

/** 빌드 결과(dist)에 내려받기 파일 폴더를 그대로 복사한다. (<a href> 로 거는 파일은 Vite 가 옮겨 주지 않으므로) */
function copyDownloads(dirs: string[]): Plugin {
  let outDir = 'dist';
  return {
    name: 'copy-downloads',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      for (const d of dirs) {
        const from = resolve(root, d);
        if (existsSync(from)) cpSync(from, resolve(outDir, d), { recursive: true });
      }
    },
  };
}

// 멀티 페이지: 홈 + 각 잡동사니 프로젝트가 하위 폴더에 하나씩
export default defineConfig({
  base: './',
  plugins: [react(), copyDownloads(['cuenote/downloads'])],
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        draw: resolve(root, 'draw/index.html'),
        timer: resolve(root, 'timer/index.html'),
        cuenote: resolve(root, 'cuenote/index.html'),
        studio: resolve(root, 'studio-mini/index.html'),
      },
    },
  },
  test: {
    include: ['draw/src/**/*.test.ts'],
  },
});
