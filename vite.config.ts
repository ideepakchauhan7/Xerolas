import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        widget: path.resolve(__dirname, 'src/renderer/widget.html'),
        overlay: path.resolve(__dirname, 'src/renderer/overlay.html'),
        result: path.resolve(__dirname, 'src/renderer/result.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html')
      }
    }
  }
});
