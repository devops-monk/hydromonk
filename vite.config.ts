import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

function copyIcons() {
  return {
    name: 'copy-icons',
    closeBundle() {
      const sizes = [16, 32, 48, 128];
      const outDir = resolve(__dirname, 'dist/icons');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      sizes.forEach(s => {
        const src = resolve(__dirname, `icons/icon${s}.png`);
        if (existsSync(src)) copyFileSync(src, resolve(outDir, `icon${s}.png`));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json',
      additionalInputs: ['src/background/service-worker.ts'],
      disableAutoLaunch: true,
    }),
    copyIcons(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
