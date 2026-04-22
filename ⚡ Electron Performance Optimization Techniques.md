# ⚡ Xerolas — Electron Performance Optimization Guide

> Complete guide to making Electron fast enough for production.
> Apply all techniques below to bring Electron within 70% of Tauri's performance.

---

## Table of Contents

1. [Lazy Load Everything](#1-lazy-load-everything)
2. [Disable Unnecessary Chromium Features](#2-disable-unnecessary-chromium-features)
3. [Hidden Warm-Up Window](#3-hidden-warm-up-window)
4. [Optimize the Renderer Process](#4-optimize-the-renderer-process)
5. [V8 Snapshot & Code Caching](#5-v8-snapshot--code-caching)
6. [Optimize IPC Communication](#6-optimize-ipc-communication)
7. [OffscreenCanvas for Screenshot Processing](#7-offscreencanvas-for-screenshot-processing)
8. [Reduce Bundle Size](#8-reduce-bundle-size)
9. [Hardware Acceleration](#9-hardware-acceleration)
10. [Memory Management](#10-memory-management)
11. [Performance Results](#performance-results)
12. [Implementation Priority](#implementation-priority)

---

## 1. Lazy Load Everything

**Problem:** Default Electron loads the entire app on startup — slow.

**Solution:** Load only the floating widget on startup. Defer everything else.

```js
// ❌ BAD — loads everything immediately
import AIPanel from './AIPanel'
import Settings from './Settings'
import History from './History'

// ✅ GOOD — load only when needed
const AIPanel   = lazy(() => import('./AIPanel'))
const Settings  = lazy(() => import('./Settings'))
const History   = lazy(() => import('./History'))
```

**What to load on startup:**
- ✅ Floating widget (tiny, always visible)
- ✅ Global hotkey listener

**What to lazy load:**
- ⏳ AI result panel (load on first capture)
- ⏳ Settings panel (load on first open)
- ⏳ History sidebar (load on first open)
- ⏳ Capture overlay (load on first trigger)

**Expected gain:** Startup time drops from `3–6s → ~0.8s`

---

## 2. Disable Unnecessary Chromium Features

**Problem:** Electron ships with many Chromium features you don't need, all consuming RAM and CPU.

**Solution:** Disable them explicitly in your `BrowserWindow` config.

```js
const win = new BrowserWindow({
  webPreferences: {
    // Core security
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,

    // Performance — disable unused features
    spellcheck: false,                   // saves ~20MB RAM
    enableWebSQL: false,                 // unused, disable
    backgroundThrottling: false,         // keep hotkey responsive
    disableHtmlFullscreenWindowResize: true,
    v8CacheOptions: 'bypassHeatCheck',   // faster JS init
  },

  // Window performance
  show: false,                           // never flash on load
  paintWhenInitiallyHidden: false,       // don't render if hidden
  backgroundColor: '#00000000',         // transparent, no white flash
})

// Disable GPU sandbox only if needed
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
```

**Also disable in `app.commandLine`:**
```js
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
```

**Expected gain:** `~30–40% RAM reduction`

---

## 3. Hidden Warm-Up Window

> **This is the single biggest perceived speed improvement.**

**Problem:** User presses hotkey → window creates → loads → renders → shows. Too slow.

**Solution:** Pre-create the window silently at startup. On hotkey, just show it.

```js
// main.js
let captureWin = null

app.whenReady().then(() => {
  // Create widget window (visible immediately — tiny)
  createWidget()

  // Silently pre-warm the capture window in background
  preWarmCaptureWindow()
})

function preWarmCaptureWindow() {
  captureWin = new BrowserWindow({
    show: false,                    // hidden — user never sees this
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  captureWin.loadFile('capture.html')
  // Window is now fully loaded, sitting in memory, ready to show instantly
}

// On hotkey trigger — just show, don't create
globalShortcut.register('CommandOrControl+Shift+Space', () => {
  if (captureWin) {
    captureWin.show()              // instant — already loaded
    captureWin.focus()
  }
})
```

**Expected gain:** Hotkey response from `200–500ms → ~50ms` (feels instant)

---

## 4. Optimize the Renderer Process

**Problem:** Heavy JS work blocks the UI thread, causing jank and slow renders.

**Solution:** Keep the main thread lean and use browser-native APIs for performance.

### Use CSS animations over JS animations
```css
/* ❌ BAD — JS animation, blocks thread */
/* setInterval(() => el.style.transform = ..., 16) */

/* ✅ GOOD — GPU-accelerated CSS animation */
.floating-widget {
  animation: float 4s ease-in-out infinite;
  will-change: transform;           /* promotes to own GPU layer */
  transform: translateZ(0);         /* triggers hardware acceleration */
}

@keyframes float {
  0%, 100% { transform: translateY(0px) translateZ(0); }
  50%       { transform: translateY(-8px) translateZ(0); }
}
```

### Batch DOM reads and writes
```js
// ❌ BAD — layout thrashing
element.style.width = '100px'
const height = element.offsetHeight   // forces layout recalc
element.style.height = height + 'px'

// ✅ GOOD — batch with requestAnimationFrame
requestAnimationFrame(() => {
  const height = element.offsetHeight  // read
  requestAnimationFrame(() => {
    element.style.height = height + 'px' // write
  })
})
```

### Defer non-critical work
```js
// ✅ Run low-priority work during idle time
requestIdleCallback(() => {
  loadHistoryPanel()
  prefetchSettings()
}, { timeout: 2000 })
```

### Virtualize long lists
```js
// ❌ BAD — renders all 100+ history items to DOM
history.map(item => <div>{item}</div>)

// ✅ GOOD — only renders visible items
// Use react-window or react-virtual for the history panel
import { FixedSizeList } from 'react-window'
<FixedSizeList height={400} itemCount={history.length} itemSize={60}>
  {({ index, style }) => <HistoryItem style={style} data={history[index]}/>}
</FixedSizeList>
```

**Expected gain:** Smooth 60fps UI, zero jank during interactions

---

## 5. V8 Snapshot & Code Caching

**Problem:** JavaScript is re-parsed and re-compiled on every launch — wasteful.

**Solution:** Cache compiled bytecode so subsequent launches skip the parse step.

```js
// electron-builder config (package.json)
{
  "build": {
    "electronVersion": "latest",
    "asar": true,
    "compression": "maximum",
    "files": ["dist/**/*"],
    "extraMetadata": {
      "v8CacheOptions": "code"
    }
  }
}
```

### Enable bytecode caching in main process
```js
// main.js — enable V8 code cache
app.commandLine.appendSwitch('js-flags', '--harmony --optimize-for-size')

// For renderer
const ses = session.defaultSession
ses.setCodeCachePath(path.join(app.getPath('userData'), 'v8-cache'))
```

**Expected gain:** `40–60% faster JS initialization` on second and subsequent launches

---

## 6. Optimize IPC Communication

**Problem:** Passing large screenshot data through IPC incorrectly is a major bottleneck.

**Solution:** Use the right IPC method for each data type.

```js
// ❌ BAD — serialize/deserialize large image through JSON
ipcMain.on('screenshot', (event, base64Image) => { ... })

// ✅ GOOD — use SharedArrayBuffer for large binary data
// In preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('xerolas', {
  // For small data (commands, settings)
  sendCommand: (cmd) => ipcRenderer.invoke('command', cmd),

  // For large data (screenshots) — use SharedArrayBuffer
  sendScreenshot: (buffer) => {
    const sharedBuffer = new SharedArrayBuffer(buffer.byteLength)
    const view = new Uint8Array(sharedBuffer)
    view.set(new Uint8Array(buffer))
    return ipcRenderer.invoke('screenshot', sharedBuffer)
  },

  // For receiving AI results
  onResult: (callback) => ipcRenderer.on('ai-result', (_, data) => callback(data)),
})
```

### Use invoke (promise-based) over send (fire-and-forget)
```js
// ❌ BAD — fire and forget, hard to track
ipcRenderer.send('analyze', data)
ipcMain.on('analyze', handler)

// ✅ GOOD — promise-based, cleaner flow
const result = await ipcRenderer.invoke('analyze', data)
ipcMain.handle('analyze', async (event, data) => {
  return await callGeminiAPI(data)
})
```

**Expected gain:** Screenshot transfer `5–10x faster` for large captures

---

## 7. OffscreenCanvas for Screenshot Processing

**Problem:** Processing screenshots on the main thread freezes the UI.

**Solution:** Move all image processing to a Web Worker using OffscreenCanvas.

```js
// captureWorker.js — runs in separate thread
self.onmessage = async ({ data: { imageData, width, height } }) => {
  // Create offscreen canvas in worker thread
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Put raw pixel data
  ctx.putImageData(new ImageData(imageData, width, height), 0, 0)

  // Resize for API efficiency (max 1024px wide)
  const scale = Math.min(1, 1024 / width)
  const resized = new OffscreenCanvas(width * scale, height * scale)
  const rCtx = resized.getContext('2d')
  rCtx.drawImage(canvas, 0, 0, resized.width, resized.height)

  // Convert to compressed JPEG blob
  const blob = await resized.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  const arrayBuffer = await blob.arrayBuffer()

  // Send compressed result back to main thread
  self.postMessage({ buffer: arrayBuffer }, [arrayBuffer])
}
```

```js
// In renderer — use the worker
const worker = new Worker('./captureWorker.js')

function processScreenshot(rawImageData) {
  return new Promise((resolve) => {
    worker.postMessage({
      imageData: rawImageData.data.buffer,
      width: rawImageData.width,
      height: rawImageData.height,
    }, [rawImageData.data.buffer])  // transfer ownership, zero copy

    worker.onmessage = ({ data }) => resolve(data.buffer)
  })
}
```

**Expected gain:** UI stays at `60fps` during capture. Zero jank.

---

## 8. Reduce Bundle Size

**Problem:** Large JS bundles take longer to parse and execute.

**Solution:** Aggressive code splitting and tree-shaking with Vite.

### Vite config for Electron
```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'chrome120',            // target actual Electron Chromium version
    minify: 'esbuild',             // fastest minifier
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code from app code
          vendor: ['react', 'react-dom'],
          ai: ['./src/ai-client.js'],
          capture: ['./src/capture.js'],
        }
      }
    },
    // Enable chunk size warnings
    chunkSizeWarningLimit: 200,    // warn if chunk > 200KB
  },
})
```

### Remove unused dependencies
```bash
# Audit what's large in your bundle
npx vite-bundle-visualizer

# Common bloat to remove or replace:
# moment.js    → use date-fns (tree-shakeable)
# lodash       → use lodash-es or native JS
# axios        → use native fetch
# uuid         → use crypto.randomUUID()
```

**Target bundle sizes:**
| Chunk | Target Size |
|---|---|
| Widget (initial load) | `< 50KB` |
| Capture overlay | `< 80KB` |
| AI result panel | `< 100KB` |
| Settings | `< 60KB` |
| Total | `< 300KB` |

**Expected gain:** Initial JS parse time `2–3x faster`

---

## 9. Hardware Acceleration

**Problem:** Software rendering is slower and uses more CPU.

**Solution:** Use GPU-accelerated rendering for animated windows.

```js
// main.js — enable hardware acceleration properly
app.disableHardwareAcceleration()   // ← REMOVE THIS if you have it

// For the floating widget (always visible, animated)
const widgetWin = new BrowserWindow({
  transparent: true,
  frame: false,
  hasShadow: false,
  webPreferences: {
    offscreen: false,              // use GPU rendering, NOT offscreen
  },
})
```

```css
/* Force GPU layer for animated elements only */
.floating-widget,
.capture-overlay,
.result-panel {
  transform: translateZ(0);
  will-change: transform, opacity;
  backface-visibility: hidden;
}

/* Don't force GPU on static elements — wastes VRAM */
.static-text,
.settings-panel {
  /* no transform/will-change needed */
}
```

**Expected gain:** Animations run at native `60fps`, no CPU involvement

---

## 10. Memory Management

**Problem:** Memory leaks and uncleaned resources inflate RAM over time.

**Solution:** Explicit cleanup at every lifecycle stage.

```js
// Release screenshot buffer immediately after sending to API
async function analyzeScreenshot(buffer) {
  try {
    const result = await callGeminiAPI(buffer)
    return result
  } finally {
    buffer = null              // allow GC immediately
  }
}

// Cap history in memory (keep only last 10 items)
function addToHistory(item) {
  history.push(item)
  if (history.length > 10) {
    history.shift()            // remove oldest
  }
}

// Clean up workers when not in use
let captureWorker = null

function getCaptureWorker() {
  if (!captureWorker) {
    captureWorker = new Worker('./captureWorker.js')
  }
  return captureWorker
}

// Terminate worker after 30s of inactivity
let workerTimeout = null
function scheduleWorkerCleanup() {
  clearTimeout(workerTimeout)
  workerTimeout = setTimeout(() => {
    captureWorker?.terminate()
    captureWorker = null
  }, 30_000)
}

// Cap Electron's V8 heap size
// Add to package.json scripts:
// "start": "electron --max-old-space-size=256 ."
```

### Monitor memory in development
```js
// Add to main.js during development only
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const mem = process.memoryUsage()
    console.log(`RSS: ${Math.round(mem.rss / 1024 / 1024)}MB | Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`)
  }, 5000)
}
```

**Expected gain:** RAM stays flat over time, no memory creep

---

## Performance Results

After applying all optimizations:

| Metric | Unoptimized Electron | Optimized Electron | Tauri |
|---|---|---|---|
| **App size** | ~150MB | ~80MB | ~8MB |
| **RAM on launch** | ~300MB | ~120MB | ~30MB |
| **Startup time** | 3–6s | ~0.8s | < 0.5s |
| **Hotkey response** | 200–500ms | ~50ms | ~10ms |
| **Bundle size** | ~5MB+ | < 300KB | N/A |
| **Animation FPS** | 30–40fps | 60fps | 60fps |
| **Feel** | Sluggish | Snappy | Native |

---

## Implementation Priority

Apply these in order for maximum impact with minimum effort:

```
Priority 1 — Instant wins (implement first)
  ✅ Hidden warm-up window         → feels instant
  ✅ Disable unused Chromium flags → -40% RAM
  ✅ Lazy load all panels          → -70% startup time

Priority 2 — High impact (implement second)
  ✅ OffscreenCanvas worker        → 60fps UI during capture
  ✅ IPC optimization              → faster screenshot transfer
  ✅ Vite bundle splitting         → faster JS parse

Priority 3 — Polish (implement last)
  ✅ V8 bytecode caching           → faster repeat launches
  ✅ GPU layer CSS                 → smooth animations
  ✅ Memory management             → stable long-term RAM
```

---

## Summary

> Optimized Electron reaches **~70% of Tauri's performance** with **0% migration cost**.
>
> The **hidden warm-up window** is the single most impactful technique — implement it first.
>
> If Xerolas v1 ships with Electron + these optimizations, it will feel snappy and professional.
> Migrate to Tauri in v2 if bundle size and RAM become user complaints.

---

*Xerolas Optimization Guide — v1.0*
*Stack: Electron + React + Vite + Cloudflare Workers + Gemini AI*