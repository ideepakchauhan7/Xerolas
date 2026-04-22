import {
  QUICK_ACTIONS,
  getQuickActionLabel,
  type AnalysisResult,
  type HistoryEntry,
  type HistoryViewModel,
  type QuickActionId
} from '../shared/types';

const resultText = document.getElementById('result-text') as HTMLDivElement;
const resultSubtitle = document.getElementById('result-subtitle') as HTMLParagraphElement;
const quickActions = document.getElementById('quick-actions') as HTMLDivElement;
const historyPanel = document.getElementById('history-panel') as HTMLDivElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;
const captureAgainButton = document.getElementById('capture-again') as HTMLButtonElement;
const copyResultButton = document.getElementById('copy-result') as HTMLButtonElement;
const shareResultButton = document.getElementById('share-result') as HTMLButtonElement;
const toggleHistoryButton = document.getElementById('toggle-history') as HTMLButtonElement;
const minimizeResultButton = document.getElementById('minimize-result') as HTMLButtonElement;
const collapseResultButton = document.getElementById('collapse-result') as HTMLButtonElement;
const clearHistoryButton = document.getElementById('clear-history') as HTMLButtonElement;

let currentResult: AnalysisResult | null = null;
let currentHistory: HistoryViewModel = { items: [], limit: 10 };
let historyOpen = false;

function formatTime(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(isoDate));
}

function renderQuickActions(activeQuickActionId: QuickActionId | null): void {
  quickActions.innerHTML = '';

  QUICK_ACTIONS.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preset-chip${action.id === activeQuickActionId ? ' is-active' : ''}`;
    button.textContent = action.id === 'describe' ? 'AI Overview' : action.label;
    button.addEventListener('click', async () => {
      if (currentResult) {
        await window.desktopAssistant.rerunResult(action.id);
        return;
      }

      await window.desktopAssistant.requestCapture(action.id);
    });
    quickActions.appendChild(button);
  });
}

function renderHistoryItem(entry: HistoryEntry): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-item';
  button.addEventListener('click', async () => {
    await window.desktopAssistant.selectHistoryEntry(entry.id);
  });

  const image = document.createElement('img');
  image.src = entry.imageDataUrl;
  image.alt = 'Capture preview';
  button.appendChild(image);

  const copy = document.createElement('div');
  copy.className = 'history-item-copy';

  const meta = document.createElement('div');
  meta.className = 'history-item-meta';

  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = entry.quickActionId === 'describe' ? 'AI Overview' : getQuickActionLabel(entry.quickActionId);
  meta.appendChild(title);

  const time = document.createElement('span');
  time.textContent = formatTime(entry.createdAt);
  meta.appendChild(time);

  const preview = document.createElement('div');
  preview.className = 'history-item-preview';
  preview.textContent = entry.text.slice(0, 140);

  copy.append(meta, preview);
  button.appendChild(copy);

  return button;
}

function renderHistory(history: HistoryViewModel): void {
  currentHistory = history;
  historyList.innerHTML = '';

  if (!history.items.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No captures yet.';
    historyList.appendChild(empty);
    return;
  }

  history.items.forEach((entry) => {
    historyList.appendChild(renderHistoryItem(entry));
  });
}

function renderResult(result: AnalysisResult): void {
  currentResult = result;
  resultSubtitle.textContent =
    result.quickActionId === 'describe'
      ? 'AI Overview'
      : `${getQuickActionLabel(result.quickActionId)} for this capture`;
  resultText.textContent = result.text;
  renderQuickActions(result.quickActionId);
}

function setHistoryOpen(nextOpen: boolean): void {
  historyOpen = nextOpen;
  historyPanel.classList.toggle('is-open', historyOpen);
}

captureAgainButton.addEventListener('click', async () => {
  await window.desktopAssistant.requestCapture(currentResult?.quickActionId);
});

copyResultButton.addEventListener('click', async () => {
  if (!currentResult) {
    return;
  }

  await navigator.clipboard.writeText(currentResult.text);
});

shareResultButton.addEventListener('click', async () => {
  await window.desktopAssistant.shareResult();
});

toggleHistoryButton.addEventListener('click', () => {
  setHistoryOpen(!historyOpen);
});

minimizeResultButton.addEventListener('click', async () => {
  await window.desktopAssistant.minimizeResult();
});

collapseResultButton.addEventListener('click', async () => {
  await window.desktopAssistant.collapseResult();
});

clearHistoryButton.addEventListener('click', async () => {
  await window.desktopAssistant.clearHistory();
});

window.desktopAssistant.onResult(renderResult);
window.desktopAssistant.onHistory(renderHistory);

Promise.all([window.desktopAssistant.getResult(), window.desktopAssistant.getHistory()])
  .then(([result, history]) => {
    if (result) {
      renderResult(result);
    } else {
      resultText.textContent = 'Capture any part of your screen and Xerolas will analyze it here.';
      renderQuickActions('describe');
    }

    renderHistory(history);
  })
  .catch(console.error);
