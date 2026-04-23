import type { DisplaySnapshot, OverlayPayload, Rect, SelectionPayload } from '../shared/types';

const overlayRoot = document.getElementById('overlay-root') as HTMLDivElement;
const desktopCanvas = document.getElementById('desktop-canvas') as HTMLDivElement;
const selectionBox = document.getElementById('selection-box') as HTMLDivElement;
const selectionDimensions = document.getElementById('selection-dimensions') as HTMLDivElement;
const overlayToolbarStatus = document.getElementById('overlay-toolbar-status') as HTMLSpanElement;
const overlayToolbarText = document.getElementById('overlay-toolbar-text') as HTMLParagraphElement;

let payload: OverlayPayload | null = null;
let activeDisplay: DisplaySnapshot | null = null;
let dragStart: { x: number; y: number } | null = null;
let submitting = false;

function setOverlayState(
  state: 'ready' | 'dragging' | 'processing' | 'error',
  options: { label?: string; text?: string } = {}
): void {
  overlayRoot.dataset.state = state;

  const defaults = {
    ready: {
      label: 'Ready',
      text: 'Drag anywhere on your screen. Xerolas starts analyzing as soon as you release.'
    },
    dragging: {
      label: 'Selecting',
      text: 'Release the mouse to keep this capture open and start the answer beside it.'
    },
    processing: {
      label: 'Analyzing',
      text: 'This capture stays open while Xerolas builds the answer in the side panel.'
    },
    error: {
      label: 'Retry',
      text: 'Something interrupted the capture. Drag again or press Esc to exit.'
    }
  }[state];

  overlayToolbarStatus.textContent = options.label ?? defaults.label;
  overlayToolbarText.textContent = options.text ?? defaults.text;
  overlayToolbarStatus.className = `surface-chip overlay-toolbar-status is-${state}`;
}

function applyPayload(nextPayload: OverlayPayload): void {
  payload = nextPayload;
  activeDisplay = null;
  dragStart = null;
  submitting = false;
  selectionBox.hidden = true;
  renderDisplaySnapshots(nextPayload);
  setOverlayState('ready');
}

function renderDisplaySnapshots(currentPayload: OverlayPayload): void {
  desktopCanvas.innerHTML = '';

  desktopCanvas.style.width = `${currentPayload.desktopBounds.width}px`;
  desktopCanvas.style.height = `${currentPayload.desktopBounds.height}px`;

  if (currentPayload.mode === 'combined' && currentPayload.combinedImageDataUrl) {
    const combinedImage = document.createElement('img');
    combinedImage.src = currentPayload.combinedImageDataUrl;
    combinedImage.className = 'desktop-background';
    combinedImage.style.left = '0px';
    combinedImage.style.top = '0px';
    combinedImage.style.width = `${currentPayload.desktopBounds.width}px`;
    combinedImage.style.height = `${currentPayload.desktopBounds.height}px`;
    desktopCanvas.appendChild(combinedImage);
    return;
  }

  currentPayload.displays.forEach((display) => {
    const displayImage = document.createElement('img');
    displayImage.src = display.imageDataUrl;
    displayImage.className = 'desktop-background';
    displayImage.style.left = `${display.bounds.x - currentPayload.desktopBounds.x}px`;
    displayImage.style.top = `${display.bounds.y - currentPayload.desktopBounds.y}px`;
    displayImage.style.width = `${display.bounds.width}px`;
    displayImage.style.height = `${display.bounds.height}px`;
    desktopCanvas.appendChild(displayImage);
  });
}

function getPoint(event: PointerEvent): { x: number; y: number } {
  if (!payload) {
    return { x: 0, y: 0 };
  }

  return {
    x: payload.desktopBounds.x + event.clientX,
    y: payload.desktopBounds.y + event.clientY
  };
}

function getDisplayForPoint(point: { x: number; y: number }): DisplaySnapshot | null {
  if (!payload) {
    return null;
  }

  return (
    payload.displays.find((display) => {
      const withinX = point.x >= display.bounds.x && point.x <= display.bounds.x + display.bounds.width;
      const withinY = point.y >= display.bounds.y && point.y <= display.bounds.y + display.bounds.height;
      return withinX && withinY;
    }) ?? null
  );
}

function clampPointToDisplay(point: { x: number; y: number }, display: DisplaySnapshot): {
  x: number;
  y: number;
} {
  return {
    x: Math.min(Math.max(point.x, display.bounds.x), display.bounds.x + display.bounds.width),
    y: Math.min(Math.max(point.y, display.bounds.y), display.bounds.y + display.bounds.height)
  };
}

function updateSelectionBox(rect: Rect): void {
  if (!payload) {
    return;
  }

  selectionBox.hidden = false;
  selectionBox.style.left = `${rect.x - payload.desktopBounds.x}px`;
  selectionBox.style.top = `${rect.y - payload.desktopBounds.y}px`;
  selectionBox.style.width = `${rect.width}px`;
  selectionBox.style.height = `${rect.height}px`;
  selectionDimensions.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

function createSelectionRect(from: { x: number; y: number }, to: { x: number; y: number }): Rect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(from.x - to.x),
    height: Math.abs(from.y - to.y)
  };
}

overlayRoot.addEventListener('pointerdown', (event) => {
  if (!payload || submitting) {
    return;
  }

  const point = getPoint(event);
  const display = getDisplayForPoint(point);
  if (!display) {
    return;
  }

  activeDisplay = display;
  dragStart = clampPointToDisplay(point, display);
  overlayRoot.setPointerCapture(event.pointerId);
  setOverlayState('dragging');
});

overlayRoot.addEventListener('pointermove', (event) => {
  if (!dragStart || !activeDisplay || submitting) {
    return;
  }

  const currentPoint = clampPointToDisplay(getPoint(event), activeDisplay);
  updateSelectionBox(createSelectionRect(dragStart, currentPoint));
});

overlayRoot.addEventListener('pointerup', async (event) => {
  if (!dragStart || !activeDisplay || submitting) {
    return;
  }

  const endPoint = clampPointToDisplay(getPoint(event), activeDisplay);
  overlayRoot.releasePointerCapture(event.pointerId);
  const rect = createSelectionRect(dragStart, endPoint);
  dragStart = null;

  if (rect.width < 12 || rect.height < 12) {
    activeDisplay = null;
    selectionBox.hidden = true;
    setOverlayState('ready');
    return;
  }

  const selection: SelectionPayload = {
    displayId: activeDisplay.id,
    absoluteBounds: rect
  };

  activeDisplay = null;
  submitting = true;
  setOverlayState('processing');

  try {
    await window.desktopAssistant.submitSelection(selection);
  } catch (error) {
    console.error(error);
    setOverlayState('error');
  } finally {
    submitting = false;
  }
});

window.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') {
    await window.desktopAssistant.cancelSelection();
  }
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

window.desktopAssistant
  .getOverlayPayload()
  .then((nextPayload) => {
    if (!nextPayload) {
      return;
    }

    applyPayload(nextPayload);
  })
  .catch(console.error);

window.desktopAssistant.onOverlayPayload((nextPayload) => {
  applyPayload(nextPayload);
});
